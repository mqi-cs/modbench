// WS4 flow step 8 (D15e): a submitted part's photo may feed the 3D preview
// only if it is the part alone, flat-on, in daylight, at a usable size.
// Anything else is "not previewed", which is honest; a wrong picture is not.
//
// Pure over a decoded raster (photoGate), plus a thin sharp wrapper
// (gatePhoto). The shape checks are the catalog's own asset classifier
// (lib/preview/classify.ts); this adds resolution, lume and a
// rotation-invariant roundness test on top.
import sharp from "sharp";
import { analyseRaster, classify, type PreviewCategory } from "../preview/classify";
import type { Raster } from "../preview/segment";
import type { SlotKey } from "../compat";

export type GateResult = { verdict: "pass" } | { verdict: "reject" | "not-applicable"; reason: string };

/** Slots whose 3D layer is printed from a photo. Every other slot is drawn from shape alone. */
const PHOTO_SLOTS: Partial<Record<SlotKey, PreviewCategory>> = { dial: "dial", bezelInsert: "bezel_insert", chapterRing: "chapter_ring" };

/**
 * Shortest side of the source photo. The dial layer is drawn from a 471 px
 * disc in an 800 px frame (plan §13); a source under 500 px is upscaled
 * into it and prints read soft.
 */
export const MIN_SIDE_PX = 500;

/**
 * Minor / major axis of the subject, from its second moments. 1 for a disc
 * seen square-on; cos(tilt) for a tilted one, whatever direction it leans.
 * 0.92 allows about 23 degrees. The classifier's bounding-box aspect alone
 * misses a tilt along the diagonal: that ellipse still has a square box.
 */
export const MIN_ROUNDNESS = 0.92;

/** Lume-lit: dark backdrop and a glow of saturated green-to-blue light. */
const DARK_BACKDROP_LUMA = 60;
const MIN_GLOW_SHARE = 0.003;

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function photoGate(img: Raster, slot: SlotKey, source: { width: number; height: number } = img): GateResult {
  const category = PHOTO_SLOTS[slot];
  if (!category) return { verdict: "not-applicable", reason: "slot-drawn-from-shape-not-photo" };
  if (Math.min(source.width, source.height) < MIN_SIDE_PX) return { verdict: "reject", reason: "low-resolution" };

  const a = analyseRaster(img, category);
  if (isLumeLit(img, luma(a.bg.color.r, a.bg.color.g, a.bg.color.b))) return { verdict: "reject", reason: "lume-lit" };

  const c = classify({ category, agreement: a.bg.agreement, components: a.components, shape: a.shape, frameSpanning: a.frameSpanning });
  if (c.state !== "ready") return { verdict: "reject", reason: c.reason };

  const main = a.components[0]!;
  if (roundness(a.labels, img.width, main.label, main.minX, main.minY, main.maxX, main.maxY) < MIN_ROUNDNESS) return { verdict: "reject", reason: "not-frontal" };
  return { verdict: "pass" };
}

function isLumeLit(img: Raster, backdropLuma: number): boolean {
  if (backdropLuma >= DARK_BACKDROP_LUMA) return false;
  let glow = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n * 4; i += 4) {
    const r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    const max = Math.max(r, g, b);
    if (max >= 150 && (max - Math.min(r, g, b)) / max >= 0.4 && max !== r) glow++;
  }
  return glow / n >= MIN_GLOW_SHARE;
}

function roundness(labels: Int32Array, w: number, label: number, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (labels[y * w + x] !== label) continue;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
  }
  const mx = sx / n, my = sy / n;
  const a = sxx / n - mx * mx, c = syy / n - my * my, b = sxy / n - mx * my;
  const d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  return Math.sqrt(((a + c) / 2 - d) / ((a + c) / 2 + d));
}

/** Decodes a listing photo and gates it. Undecodable input is a rejection, never a throw. */
export async function gatePhoto(buf: Buffer, slot: SlotKey): Promise<GateResult> {
  try {
    const { width = 0, height = 0 } = await sharp(buf).metadata();
    const raw = await sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize(400, 400, { fit: "inside" })
      .removeAlpha()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const data = new Uint8Array(raw.info.width * raw.info.height * 4);
    for (let i = 0, j = 0; j < data.length; i += 3, j += 4) {
      data[j] = raw.data[i]!;
      data[j + 1] = raw.data[i + 1]!;
      data[j + 2] = raw.data[i + 2]!;
      data[j + 3] = 255;
    }
    return photoGate({ data, width: raw.info.width, height: raw.info.height }, slot, { width, height });
  } catch {
    return { verdict: "reject", reason: "undecodable-image" };
  }
}
