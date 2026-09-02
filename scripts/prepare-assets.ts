// Offline preparation of preview layer assets.
// specs/05-phase-4-preview.md, "Asset preparation -- the actual work".
//
// Fetches each approved part's vendor photograph once, decides whether it
// is usable, and writes a normalised 800x800 transparent PNG for the ones
// that are. Nothing here runs at request time: the app only ever reads the
// PNGs this produces, and never touches a vendor URL.
//
//   pnpm prepare-assets            # full run, cached downloads reused
//   pnpm prepare-assets --dry-run  # classify and report, write nothing
//   pnpm prepare-assets --limit=50 --category=dial
//
// Downloads are cached under data/raw/images/ (gitignored) so re-running
// after a threshold change costs no network.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import sharp from "sharp";
import type { Sharp, OverlayOptions } from "sharp";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import {
  probeBackground,
  subjectMask,
  markEnclosed,
  findComponents,
  findHoles,
  assignHoles,
  measure,
  handGeometry,
  assignHandRoles,
  type HandGeometry,
  type HandRole,
} from "../lib/preview/segment";
import { classify, isFrameSpanning, isHandShaped, partitionSubjects, HAND_SUBJECT_SHARE, NOISE_FLOOR, type PreviewCategory, type AssetState } from "../lib/preview/classify";
import { CANVAS, renderRadiusPx } from "../lib/preview/layers";

const CACHE_DIR = "data/raw/images";
const ASSET_DIR = "public/assets";
const PREVIEW_CATEGORIES: PreviewCategory[] = ["dial", "hands", "bezel_insert", "chapter_ring"];

// Analysis resolution. The source is fetched at 800px and analysed at 400
// -- flood fill and connected-component labelling are O(pixels), and every
// measure used is a ratio, so halving the raster quarters the work and
// changes no decision. The asset itself is still written from the 800px
// source.
const ANALYSIS_SIZE = 400;

interface Row {
  id: string;
  category: PreviewCategory;
  family: string;
  name: string;
  imageUrl: string;
}

function cachePath(id: string): string {
  return `${CACHE_DIR}/${id}.bin`;
}

async function fetchImage(row: Row): Promise<Buffer | null> {
  const cached = cachePath(row.id);
  if (existsSync(cached)) return readFileSync(cached);
  // Shopify serves a resized derivative from the same CDN path; asking for
  // 800 avoids pulling multi-megabyte originals (one dial sampled at 1.4MB)
  // for an 800x800 canvas that cannot show the extra detail.
  const url = `${row.imageUrl.split("?")[0]}?width=800`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, buf);
    return buf;
  } catch {
    return null;
  }
}

interface Rgba {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface HandPlacement {
  role: HandRole;
  geometry: HandGeometry;
}

export interface AnalysisResult {
  state: AssetState;
  reason: string;
  /** Subject bounding box in analysis-raster coordinates, for the crop. */
  box: { left: number; top: number; width: number; height: number } | null;
  /** Hands only. Empty for every other category. */
  hands: HandPlacement[];
  /** Analysis raster -> source raster scale factor. */
  scale: number;
  /**
   * Chapter rings only: the vertical stretch that turns the vendor's
   * oblique ellipse back into a circle. 1 for everything else.
   */
  unsquash: number;
}

async function toRgba(buf: Buffer, size: number, stretchY = 1): Promise<Rgba | null> {
  try {
    let pipeline = sharp(buf)
      // A transparent source PNG is already cut out; treat it as white-backed
      // so the same border-flood path handles both.
      .flatten({ background: "#ffffff" })
      .resize(size, size, { fit: "contain", background: "#ffffff" });
    if (stretchY !== 1) {
      pipeline = sharp(await pipeline.png().toBuffer()).resize(size, Math.round(size * stretchY), { fit: "fill" });
    }
    const raw = await pipeline.ensureAlpha().raw().toColourspace("srgb").toBuffer({ resolveWithObject: true });
    const { width, height, channels } = raw.info;
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0, j = 0; j < rgba.length; i += channels, j += 4) {
      rgba[j] = raw.data[i]!;
      rgba[j + 1] = raw.data[i + 1] ?? raw.data[i]!;
      rgba[j + 2] = raw.data[i + 2] ?? raw.data[i]!;
      rgba[j + 3] = 255;
    }
    return { data: rgba, width, height };
  } catch {
    return null;
  }
}

/**
 * Every vendor in this catalog photographs chapter rings at a shallow
 * oblique -- 182 of 186 sampled were ellipses, from all four vendors --
 * because the printed minute track lives on the ring's inner wall and is
 * invisible from directly above. A top-down layer needs a circle, so the
 * ellipse is un-projected by stretching the minor axis back to the major.
 *
 * That is a real inverse projection, not a guess: angular positions around
 * the ring are preserved exactly, which is the property that matters for a
 * diagram. What it cannot recover is foreshortened wall height, so the
 * corrected ring reads slightly wider than the real part -- acceptable
 * under this phase's "roughly indicative" remit, and recorded in
 * specs/05-phase-4-preview.md rather than left implicit.
 */
const MIN_RING_OBLIQUITY = 1.12;
const MAX_RING_OBLIQUITY = 2.4;

export async function analyse(buf: Buffer, category: PreviewCategory): Promise<AnalysisResult> {
  const none = { box: null, hands: [], scale: 800 / ANALYSIS_SIZE, unsquash: 1 };
  let img = await toRgba(buf, ANALYSIS_SIZE);
  if (!img) return { state: "unavailable", reason: "undecodable-image", ...none };

  let unsquash = 1;
  if (category === "chapter_ring") {
    const probe = analyseRaster(img, category);
    const aspect = probe.shape?.aspect ?? 1;
    if (aspect >= MIN_RING_OBLIQUITY && aspect <= MAX_RING_OBLIQUITY) {
      unsquash = aspect;
      const stretched = await toRgba(buf, ANALYSIS_SIZE, aspect);
      if (stretched) img = stretched;
    }
  }

  const { bg, components, labels, shape, frameSpanning } = analyseRaster(img, category);

  let hands: HandPlacement[] = [];
  let debris: HandGeometry[] = [];
  if (category === "hands") {
    const measured: HandGeometry[] = components.map((c) => handGeometry(c, labels, img.width, img.height));
    const kept: HandGeometry[] = [];
    for (const g of measured) {
      if (isHandShaped(g)) kept.push(g);
      else debris.push(g);
    }
    hands = assignHandRoles(kept).map((role, i) => ({ role, geometry: kept[i]! }));
  }

  const verdict = classify({
    category,
    agreement: bg.agreement,
    components,
    shape,
    hands: hands.map((h) => h.geometry),
    debris,
    frameSpanning,
  });

  // Union box over every accepted component: a hand set is several
  // components and must be cropped as one group, or the hands lose their
  // sizes relative to each other.
  const relevant = components;
  let box: AnalysisResult["box"] = null;
  if (relevant.length > 0) {
    box = {
      left: Math.min(...relevant.map((c) => c.minX)),
      top: Math.min(...relevant.map((c) => c.minY)),
      width: Math.max(...relevant.map((c) => c.maxX)) - Math.min(...relevant.map((c) => c.minX)) + 1,
      height: Math.max(...relevant.map((c) => c.maxY)) - Math.min(...relevant.map((c) => c.minY)) + 1,
    };
  }
  return { state: verdict.state, reason: verdict.reason, box, hands, scale: 800 / ANALYSIS_SIZE, unsquash };
}

function analyseRaster(img: Rgba, category: PreviewCategory) {
  const bg = probeBackground(img);
  const mask = subjectMask(img, bg.color);
  markEnclosed(img, mask, bg.color);
  const minArea = Math.round(NOISE_FLOOR * img.width * img.height);
  const { components: all, labels } = findComponents(mask, img.width, img.height, minArea);
  assignHoles(all, findHoles(mask, labels, img.width, img.height));
  const { subjects: components } = partitionSubjects(all, category === "hands" ? HAND_SUBJECT_SHARE : undefined);
  const frameSpanning = components.filter((c) => isFrameSpanning(c, img.width, img.height)).length;
  const shape = components[0] ? measure(components[0], img.width, img.height) : null;
  return { bg, mask, components, labels, shape, frameSpanning };
}

/** Cuts the alpha at full resolution and returns an RGBA buffer plus its mask. */
async function cutout(buf: Buffer, unsquash: number, holeThrough = false, share?: number): Promise<{ img: Rgba; labels: Int32Array; components: ReturnType<typeof findComponents>["components"] }> {
  const img = (await toRgba(buf, 800, unsquash))!;
  const bg = probeBackground(img);
  const mask = subjectMask(img, bg.color);
  markEnclosed(img, mask, bg.color);
  const { components: allComponents, labels } = findComponents(mask, img.width, img.height, Math.round(NOISE_FLOOR * img.width * img.height));
  const { subjects: components, debris } = partitionSubjects(allComponents, share);
  // Erase debris outright. A watermark left in the buffer would be cropped
  // away for a disc but composited for a hand set, where the crop is the
  // union of every hand.
  for (const d of debris) {
    for (let y = d.minY; y <= d.maxY; y++) {
      for (let x = d.minX; x <= d.maxX; x++) {
        const i = y * img.width + x;
        if (labels[i] === d.label) mask[i] = 0;
      }
    }
  }
  // Only border-reachable background goes transparent. Enclosed regions
  // are interior detail -- a lume plot, a printed marker, the inside of a
  // mounting hole -- and cream lume on a white backdrop reads as
  // background by colour alone, so zeroing every enclosed pixel punched
  // see-through holes through the middle of finished hands.
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0) img.data[i * 4 + 3] = 0;
  }
  // A ring's centre is the exception: it genuinely is a hole, and the
  // layers below have to show through it.
  if (holeThrough) {
    const holes = findHoles(mask, labels, img.width, img.height);
    const centre = holes.find((h) => h.radius > 0.3 * Math.min(img.width, img.height) / 2);
    if (centre) {
      const seen = new Uint8Array(mask.length);
      const stack = [Math.round(centre.cy) * img.width + Math.round(centre.cx)];
      while (stack.length > 0) {
        const i = stack.pop()!;
        if (seen[i] === 1 || mask[i] !== 2) continue;
        seen[i] = 1;
        img.data[i * 4 + 3] = 0;
        const x = i % img.width;
        const y = (i - x) / img.width;
        if (x > 0) stack.push(i - 1);
        if (x < img.width - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - img.width);
        if (y < img.height - 1) stack.push(i + img.width);
      }
    }
  }
  return { img, labels, components };
}

function blankCanvas(): Sharp {
  return sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
}

/**
 * Cuts the subject out and redraws it centred at the render radius its
 * category and platform call for.
 *
 * Scale comes from the platform, not from the part's own attributes,
 * because the attributes are not there: outerDiameterMm is null for all
 * 681 approved inserts and lengthSetMm is null for all 438 approved hand
 * sets. See lib/preview/layers.ts for why the platform constant is the
 * better source anyway.
 */
async function writeDiscAsset(buf: Buffer, row: Row, result: AnalysisResult): Promise<void> {
  const { img } = await cutout(buf, result.unsquash, row.category === "bezel_insert" || row.category === "chapter_ring");
  // One scale factor, both axes. The analysis raster and the full-size
  // cutout are both stretched by the same un-squash, so folding it into
  // the vertical scale applied it twice: chapter rings came out as a thin
  // arc of the real ring, cropped from the wrong part of the frame. The
  // classifier never saw it, because classification runs on the analysis
  // raster and only the write path was wrong.
  const s = result.scale;
  const box = {
    left: Math.max(0, Math.round(result.box!.left * s)),
    top: Math.max(0, Math.round(result.box!.top * s)),
    width: Math.round(result.box!.width * s),
    height: Math.round(result.box!.height * s),
  };
  box.width = Math.min(box.width, img.width - box.left);
  box.height = Math.min(box.height, img.height - box.top);

  const target = Math.round(renderRadiusPx(row.category, row.family) * 2);
  const cut = await sharp(Buffer.from(img.data), { raw: { width: img.width, height: img.height, channels: 4 } })
    .extract(box)
    .resize(target, target, { fit: "fill" })
    .png()
    .toBuffer();
  await writeAssetFile(blankCanvas().composite([{ input: cut, left: Math.round((CANVAS - target) / 2), top: Math.round((CANVAS - target) / 2) }]), row);
}

/**
 * Angle, clockwise from twelve o'clock, that each hand is drawn at.
 *
 * 10:10:30 is the arrangement every watch brand photographs, for the
 * reason it is useful here too: at that time no hand hides another and
 * none crosses the date window, so all three shapes stay legible.
 */
const HAND_ANGLES: Record<HandRole, number> = { hour: 305, minute: 62, second: 180, extra: 240 };

/**
 * Hands arrive as loose parts lying at arbitrary angles, so each one is
 * cut out on its own, rotated about its pivot, and redrawn radiating from
 * the canvas centre. Compositing the photograph as-is would put three
 * diagonal slivers in a corner of the dial.
 */
async function writeHandsAsset(buf: Buffer, row: Row, result: AnalysisResult): Promise<void> {
  const { img, labels, components } = await cutout(buf, 1, false, HAND_SUBJECT_SHARE);
  const s = result.scale;
  const minute = result.hands.find((h) => h.role === "minute") ?? result.hands[0]!;
  const targetLength = renderRadiusPx("hands", row.family);
  const scale = targetLength / Math.max(1, minute.geometry.length * s);

  const layers: OverlayOptions[] = [];
  // Longest first so a shorter hand is never hidden under a longer one.
  const ordered = [...result.hands].sort((a, b) => b.geometry.length - a.geometry.length);
  for (const hand of ordered) {
    const comp = components.find((c) => {
      const px = Math.round(hand.geometry.pivotX * s);
      const py = Math.round(hand.geometry.pivotY * s);
      return px >= c.minX - 4 && px <= c.maxX + 4 && py >= c.minY - 4 && py <= c.maxY + 4;
    });
    if (!comp) continue;

    // Isolate this hand: same cutout, every other component erased.
    const solo = new Uint8Array(img.data.length);
    for (let y = comp.minY; y <= comp.maxY; y++) {
      for (let x = comp.minX; x <= comp.maxX; x++) {
        const i = y * img.width + x;
        if (labels[i] !== comp.label) continue;
        solo[i * 4] = img.data[i * 4]!;
        solo[i * 4 + 1] = img.data[i * 4 + 1]!;
        solo[i * 4 + 2] = img.data[i * 4 + 2]!;
        solo[i * 4 + 3] = img.data[i * 4 + 3]!;
      }
    }

    // Pad to a square centred on the pivot. Rotating about the centre of a
    // pivot-centred square is the same as rotating about the pivot, which
    // is what keeps the hand's tail attached to the middle of the dial.
    //
    // Built by hand rather than with extend()+extract(): sharp applies
    // extract *before* extend in its pipeline, so padding for a square
    // that runs off the right or bottom edge silently never happened and
    // the extract failed with "bad extract area" on 38 of 60 sets.
    const pivotX = hand.geometry.pivotX * s;
    const pivotY = hand.geometry.pivotY * s;
    const reach = Math.ceil(Math.max(
      Math.hypot(comp.minX - pivotX, comp.minY - pivotY),
      Math.hypot(comp.maxX - pivotX, comp.minY - pivotY),
      Math.hypot(comp.minX - pivotX, comp.maxY - pivotY),
      Math.hypot(comp.maxX - pivotX, comp.maxY - pivotY),
    )) + 2;
    const side = reach * 2;
    const left = Math.round(pivotX) - reach;
    const top = Math.round(pivotY) - reach;
    const squareData = new Uint8Array(side * side * 4);
    for (let y = 0; y < side; y++) {
      const sy = y + top;
      if (sy < 0 || sy >= img.height) continue;
      for (let x = 0; x < side; x++) {
        const sx = x + left;
        if (sx < 0 || sx >= img.width) continue;
        const from = (sy * img.width + sx) * 4;
        const to = (y * side + x) * 4;
        squareData[to] = solo[from]!;
        squareData[to + 1] = solo[from + 1]!;
        squareData[to + 2] = solo[from + 2]!;
        squareData[to + 3] = solo[from + 3]!;
      }
    }
    const square = await sharp(Buffer.from(squareData), { raw: { width: side, height: side, channels: 4 } }).png().toBuffer();

    const currentAngle = (Math.atan2(hand.geometry.tipX - hand.geometry.pivotX, -(hand.geometry.tipY - hand.geometry.pivotY)) * 180) / Math.PI;
    const rotation = HAND_ANGLES[hand.role] - currentAngle;
    // Rotate first, then scale the *rotated* dimensions. sharp's rotate
    // enlarges the canvas to fit the turned image (up to sqrt(2)x), so
    // resizing the result back to the pre-rotation side length shrank
    // every hand by that same factor -- the sets came out around half the
    // size the dial called for.
    const turned = await sharp(square).rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    const turnedMeta = await sharp(turned).metadata();
    const drawn = Math.max(8, Math.round((turnedMeta.width ?? side) * scale));
    let rotated = await sharp(turned)
      .resize(drawn, drawn, { fit: "fill" })
      .png()
      .toBuffer();
    // A hand whose pivot-centred square reaches past the canvas has to be
    // clipped to it: sharp refuses to composite an overlay larger than its
    // base. Its own pass, because extract and resize in one pipeline run
    // in sharp's order rather than the call order.
    let meta = await sharp(rotated).metadata();
    if ((meta.width ?? 0) > CANVAS || (meta.height ?? 0) > CANVAS) {
      const w = Math.min(meta.width ?? CANVAS, CANVAS);
      const h = Math.min(meta.height ?? CANVAS, CANVAS);
      rotated = await sharp(rotated)
        .extract({ left: Math.floor(((meta.width ?? w) - w) / 2), top: Math.floor(((meta.height ?? h) - h) / 2), width: w, height: h })
        .png()
        .toBuffer();
      meta = await sharp(rotated).metadata();
    }
    layers.push({
      input: rotated,
      left: Math.round(CANVAS / 2 - (meta.width ?? drawn) / 2),
      top: Math.round(CANVAS / 2 - (meta.height ?? drawn) / 2),
    });
  }
  if (layers.length === 0) throw new Error("no hand layers composited");
  await writeAssetFile(blankCanvas().composite(layers), row);
}

/**
 * WebP, not the PNG specs/05-phase-4-preview.md names.
 *
 * The layers are photographic, so PNG cannot compress them: the whole set
 * came to 82MB, and lossless WebP (130KB vs 144KB on a sample dial) and
 * palette quantisation (140KB, alpha defeats it) both landed within 10%.
 * Lossy WebP at quality 88 with alpha kept lossless is 2.6x smaller for no
 * visible difference at this size on a diagram that is deliberately not
 * photoreal. Alpha stays at 100 because a soft cut-out edge would read as
 * a glow around every part, which is exactly the photographic look the
 * honesty requirement rules out.
 */
async function writeAssetFile(pipeline: Sharp, row: Row): Promise<void> {
  const out = `${ASSET_DIR}/${row.category}/${row.id}.webp`;
  mkdirSync(dirname(out), { recursive: true });
  await pipeline.webp({ quality: 88, alphaQuality: 100, effort: 5 }).toFile(out);
}

async function writeAsset(buf: Buffer, row: Row, result: AnalysisResult): Promise<void> {
  if (row.category === "hands") return writeHandsAsset(buf, row, result);
  if (!result.box) throw new Error("no subject box");
  return writeDiscAsset(buf, row, result);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const catArg = args.find((a) => a.startsWith("--category="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const onlyCategory = catArg ? catArg.split("=")[1] : null;

  const all = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const rows: Row[] = all
    .filter((p) => PREVIEW_CATEGORIES.includes(p.category as PreviewCategory))
    .filter((p) => (onlyCategory ? p.category === onlyCategory : true))
    .filter((p) => p.imageUrl)
    .map((p) => ({ id: p.id, category: p.category as PreviewCategory, family: p.family, name: p.name, imageUrl: p.imageUrl! }))
    .slice(0, limit === Infinity ? undefined : limit);

  console.log(`${dryRun ? "Analysing" : "Preparing"} ${rows.length} parts...\n`);

  const tally: Record<string, Record<string, number>> = {};
  const reasons: Record<string, Record<string, number>> = {};
  const results: { id: string; category: string; state: AssetState; reason: string }[] = [];

  let done = 0;
  const CONCURRENCY = 12;
  async function worker() {
    for (;;) {
      const row = rows[done++];
      if (!row) return;
      const buf = await fetchImage(row);
      let result: AnalysisResult;
      if (!buf) {
        result = { state: "unavailable", reason: "fetch-failed", box: null, hands: [], scale: 1, unsquash: 1 };
      } else {
        result = await analyse(buf, row.category);
        if (!dryRun && result.state === "ready") {
          try {
            await writeAsset(buf, row, result);
          } catch (err) {
            result = { ...result, state: "unavailable", reason: `write-failed:${String(err).slice(0, 40)}` };
          }
        }
      }
      tally[row.category] ??= {};
      tally[row.category]![result.state] = (tally[row.category]![result.state] ?? 0) + 1;
      reasons[row.category] ??= {};
      reasons[row.category]![result.reason] = (reasons[row.category]![result.reason] ?? 0) + 1;
      results.push({ id: row.id, category: row.category, state: result.state, reason: result.reason });
      if (results.length % 100 === 0) process.stdout.write(`  ${results.length}/${rows.length}\r`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("\n=== assetState by category ===");
  for (const [cat, counts] of Object.entries(tally)) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const ready = counts.ready ?? 0;
    console.log(`${cat.padEnd(14)} ready ${String(ready).padStart(4)}/${String(total).padEnd(4)} (${((ready / total) * 100).toFixed(1)}%)  ${JSON.stringify(counts)}`);
    const sorted = Object.entries(reasons[cat]!).filter(([r]) => r !== "ok").sort((a, b) => b[1] - a[1]);
    for (const [reason, n] of sorted) console.log(`    ${String(n).padStart(4)}  ${reason}`);
  }

  if (!dryRun) {
    // Written back to the database, not just to the fixture, because the
    // app has to know which parts have a layer before it draws anything:
    // a part with no asset gets a labelled placeholder, and that decision
    // is made server-side from this column.
    const update = sqlite.prepare("UPDATE parts SET asset_state = ?, updated_at = ? WHERE id = ?");
    const now = Date.now();
    const applyAll = sqlite.transaction((batch: typeof results) => {
      for (const r of batch) update.run(r.state, now, r.id);
    });
    applyAll(results);
    console.log(`Updated asset_state on ${results.length} parts.`);
  }

  writeFileSync("data/fixtures/asset-states.json", JSON.stringify(results.sort((a, b) => a.id.localeCompare(b.id)), null, 2) + "\n");
  console.log(`\nWrote data/fixtures/asset-states.json (${results.length} rows).`);
  if (dryRun) console.log("Dry run: no PNGs written, no database rows updated.");
}

main();
