// D7 retry: perceptual hashing over NORMALISED assets.
//
// Task 5 ran this over raw vendor photographs and got numbers it could not
// trust -- the hash tracked the scene, not the object, and ranked a
// confirmed-different chapter ring pair (78) as more similar than a
// confirmed-same crystal pair (140). The diagnosis was that no
// preprocessing existed yet. Phase 4's asset pipeline is that
// preprocessing: background removed, centred, scaled to a fixed pixel
// radius from the real-world diameter. This re-runs the same 145
// candidate pairs against those assets.
//
// Two things make the output interpretable that Task 5 did not have:
//
//   1. A NULL DISTRIBUTION. Random same-category pairs are hashed too, so
//      a candidate's distance can be read as "closer than 99.8% of
//      unrelated parts" rather than as a bare number out of 256. A
//      threshold picked off absolute distances is a threshold picked off
//      nothing.
//   2. The Task 5 calibration pairs are re-checked by name and reported
//      separately, because the whole question is whether the ORDER is
//      right now, not whether the numbers got smaller.
//
//   pnpm dedup-phash
//
// Read-only. Writes a fixture; merges nothing.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../lib/db/client";
import { mergeCandidates, parts as partsTable } from "../lib/db/schema";
import { fromJsonColumn } from "../lib/db/json";
import { HASH_BITS, IMAGE_SIDE, hamming, phash } from "../lib/dedup/phash";

// The hash is computed on GREYSCALE pixels, so it is blind to finish.
// That turned out to matter more than the distance itself: a polished
// silver hand set and the same model in gold are the same object to it,
// and merging those two would assert that a silver part and a gold part
// are one SKU -- a textbook false positive. Colour agreement is checked
// separately, from the style tags the catalog already carries.
const COLOUR_TAGS = new Set([
  "gold-tone", "silver-tone", "blue", "green", "red", "orange",
  "yellow", "brown", "cream", "white", "grey", "black",
]);

interface Side {
  id: string;
  name: string;
  category: string;
  vendor: string;
  review_state: string;
}
interface Pair {
  a: Side;
  b: Side;
  img_a: string;
  img_b: string;
  url_a: string;
  url_b: string;
  hash_distance: number | null;
  score: number;
}

const assetPath = (s: Side) => `public/assets/${s.category}/${s.id}.webp`;

const colourTags = new Map<string, string[]>();
for (const row of db.select().from(partsTable).where(eq(partsTable.reviewState, "approved")).all()) {
  const tags = fromJsonColumn<{ styleTags?: string[] }>(row.attributes).styleTags;
  colourTags.set(row.id, (Array.isArray(tags) ? tags : []).filter((t) => COLOUR_TAGS.has(t)).sort());
}

/** "agree" / "differ" / "unknown" -- unknown when either side is untagged. */
function colourAgreement(a: string, b: string): "agree" | "differ" | "unknown" {
  const ta = colourTags.get(a) ?? [];
  const tb = colourTags.get(b) ?? [];
  if (ta.length === 0 || tb.length === 0) return "unknown";
  return ta.join(",") === tb.join(",") ? "agree" : "differ";
}

const cache = new Map<string, Uint8Array | null>();

/**
 * Hash one prepared asset.
 *
 * Flattened onto white BEFORE greyscaling: the assets carry an alpha
 * channel, and leaving it to be discarded silently would hash whatever
 * the decoder happened to leave in the RGB of fully transparent pixels.
 * Constant background is the entire point of using these.
 */
async function hashAsset(file: string): Promise<Uint8Array | null> {
  if (cache.has(file)) return cache.get(file)!;
  let out: Uint8Array | null = null;
  try {
    const grey = await sharp(readFileSync(file))
      .flatten({ background: "#ffffff" })
      .greyscale()
      .resize(IMAGE_SIDE, IMAGE_SIDE, { fit: "fill" })
      .raw()
      .toBuffer();
    out = phash(new Uint8Array(grey));
  } catch {
    out = null;
  }
  cache.set(file, out);
  return out;
}

function stats(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  return { n: s.length, min: s[0]!, p05: at(0.05), median: at(0.5), max: s[s.length - 1]! };
}

async function main() {
  const pairs = Object.values(
    JSON.parse(readFileSync("data/fixtures/phash-raw-results.json", "utf-8")) as Record<string, Pair>,
  );

  // --- Null distribution: unrelated parts of the same category.
  const byCategory = new Map<string, string[]>();
  for (const p of pairs) {
    for (const s of [p.a, p.b]) {
      if (!existsSync(assetPath(s))) continue;
      const list = byCategory.get(s.category) ?? [];
      if (!list.includes(assetPath(s))) list.push(assetPath(s));
      byCategory.set(s.category, list);
    }
  }
  // Every asset on disk, not just candidates -- the null has to describe
  // the catalog, not the shortlist.
  const { readdirSync } = await import("node:fs");
  for (const category of ["dial", "hands", "chapter_ring", "bezel_insert"]) {
    const dir = `public/assets/${category}`;
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".webp")).map((f) => `${dir}/${f}`);
    byCategory.set(category, files);
  }

  const nulls = new Map<string, ReturnType<typeof stats>>();
  const nullSamples = new Map<string, number[]>();
  for (const [category, files] of byCategory) {
    if (files.length < 4) continue;
    const take = Math.min(files.length, 90);
    const picked = files.slice(0, take);
    const hashes: Uint8Array[] = [];
    for (const f of picked) {
      const h = await hashAsset(f);
      if (h) hashes.push(h);
    }
    const ds: number[] = [];
    for (let i = 0; i < hashes.length; i++) {
      for (let j = i + 1; j < hashes.length; j++) ds.push(hamming(hashes[i]!, hashes[j]!));
    }
    nullSamples.set(category, ds);
    nulls.set(category, stats(ds));
  }

  // --- Candidate pairs.
  const rows: {
    a: string; b: string; category: string; vendors: string;
    raw: number | null; norm: number | null; percentile: number | null;
    colour: "agree" | "differ" | "unknown";
    url_a: string; url_b: string; id_a: string; id_b: string;
  }[] = [];

  for (const p of pairs) {
    const fa = assetPath(p.a), fb = assetPath(p.b);
    let norm: number | null = null;
    if (existsSync(fa) && existsSync(fb)) {
      const ha = await hashAsset(fa), hb = await hashAsset(fb);
      if (ha && hb) norm = hamming(ha, hb);
    }
    const sample = nullSamples.get(p.a.category) ?? [];
    const percentile =
      norm === null || sample.length === 0
        ? null
        : sample.filter((d) => d < norm).length / sample.length;
    rows.push({
      a: p.a.name, b: p.b.name, category: p.a.category,
      vendors: `${p.a.vendor}/${p.b.vendor}`,
      raw: p.hash_distance, norm, percentile,
      colour: colourAgreement(p.a.id, p.b.id),
      url_a: p.url_a, url_b: p.url_b, id_a: p.a.id, id_b: p.b.id,
    });
  }

  const scored = rows.filter((r) => r.norm !== null);
  console.log(`\nPairs re-hashed on normalised assets: ${scored.length} of ${rows.length}`);
  console.log("Not re-hashable (no prepared asset for one or both side):");
  const missing = new Map<string, number>();
  for (const r of rows) if (r.norm === null) missing.set(r.category, (missing.get(r.category) ?? 0) + 1);
  for (const [c, n] of [...missing].sort((x, y) => y[1] - x[1])) console.log(`   ${c.padEnd(14)} ${n}`);

  console.log("\nNull distribution -- unrelated same-category parts:");
  for (const [c, s] of nulls) {
    if (!s) continue;
    console.log(`   ${c.padEnd(14)} n=${String(s.n).padStart(5)}  min ${s.min}  5th ${s.p05}  median ${s.median}  max ${s.max}`);
  }

  console.log("\nCandidate pairs, normalised, by category:");
  for (const c of new Set(scored.map((r) => r.category))) {
    const s = stats(scored.filter((r) => r.category === c).map((r) => r.norm!))!;
    const raw = stats(scored.filter((r) => r.category === c).map((r) => r.raw ?? NaN).filter((n) => !Number.isNaN(n)));
    console.log(`   ${c.padEnd(14)} n=${String(s.n).padStart(3)}  normalised min ${s.min} median ${s.median}   (raw was min ${raw?.min} median ${raw?.median})`);
  }

  console.log("\nClosest 16 after normalisation:");
  for (const r of [...scored].sort((x, y) => x.norm! - y.norm!).slice(0, 16)) {
    const pct = r.percentile === null ? "  -  " : `${(r.percentile * 100).toFixed(2)}%`;
    const mark = r.colour === "agree" ? "colour ok  " : r.colour === "differ" ? "COLOUR DIFF" : "colour ?   ";
    console.log(`   ${String(r.norm).padStart(3)}  ${pct.padStart(6)}  ${mark}  ${r.category.padEnd(12)} ${r.a.slice(0, 38).padEnd(38)} || ${r.b.slice(0, 38)}`);
  }

  // The set worth a human's time: close on form AND agreeing on finish.
  const SHORTLIST = 40;
  const strong = scored.filter((r) => r.norm! <= SHORTLIST && r.colour === "agree");
  const formOnly = scored.filter((r) => r.norm! <= SHORTLIST && r.colour !== "agree");
  console.log(`\nAt distance <= ${SHORTLIST}: ${scored.filter((r) => r.norm! <= SHORTLIST).length} pairs.`);
  console.log(`   ${strong.length} also agree on finish  -- the queue worth reviewing`);
  console.log(`   ${formOnly.length} do not              -- same model, different finish, or untagged`);

  // --- Optionally push the shortlist into the SAME review queue the
  // link-paste path writes to. One queue, sources labelled, so a pair
  // both methods found shows as "both" -- the strongest signal available.
  if (process.argv.includes("--queue")) {
    let added = 0, already = 0;
    for (const r of strong) {
      const ids = [r.id_a, r.id_b].sort();
      const existing = db.select().from(mergeCandidates).all()
        .find((c) => (JSON.parse(c.partIds) as string[]).join(",") === ids.join(","));
      if (existing) {
        // A user already claimed this pair. Promote it rather than
        // duplicating: agreement between the two methods IS the finding.
        if (existing.source === "user-link" && existing.status === "pending") {
          db.update(mergeCandidates).set({ source: "both", phashDistance: r.norm })
            .where(eq(mergeCandidates.id, existing.id)).run();
          console.log(`   promoted ${existing.id} to "both" -- a person and the image agree`);
        }
        already++;
        continue;
      }
      db.insert(mergeCandidates).values({
        id: nanoid(12),
        partIds: JSON.stringify(ids),
        submittedUrls: JSON.stringify([r.url_a, r.url_b]),
        unresolvedUrls: "[]",
        source: "phash",
        phashDistance: r.norm,
        colourAgreement: r.colour,
        note: `Nominated by scripts/dedup-phash.ts: normalised images agree to ${r.norm}/256, closer than ${((r.percentile ?? 0) * 100).toFixed(2)}% of unrelated ${r.category} pairs, and colour tags agree. NOT reviewed.`,
        status: "pending",
        createdAt: Date.now(),
      }).run();
      added++;
    }
    console.log(`\nQueued ${added} candidate(s) for review; ${already} were already there.`);
    console.log("None of these is a merge. `pnpm review-merges` to read them.");
  } else {
    console.log("\nRe-run with --queue to put the shortlist into the review queue.");
  }
  void and;

  writeFileSync(
    "data/fixtures/dedup-phash-normalised.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), hashBits: HASH_BITS, null: Object.fromEntries(nulls), pairs: rows }, null, 2) + "\n",
  );
  console.log("\nWrote data/fixtures/dedup-phash-normalised.json");
}

main();
