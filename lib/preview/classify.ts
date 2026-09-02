// Decides whether a prepared image is usable as a preview layer.
//
// Pure, and separated from the sharp pipeline on purpose: the thresholds
// below are the only thing standing between the preview and a confidently
// wrong picture, so they are unit-testable and reviewable in isolation.
//
// The bias is deliberately toward rejection. A part with no asset shows a
// labelled placeholder, which is honest. A part with a *wrong* asset shows
// a whole assembled watch composited on top of the user's dial, which
// looks plausible and is a lie. False accepts cost far more than false
// rejects here, and the thresholds are set accordingly.

import type { Component, HandGeometry, ShapeMeasures } from "./segment";

export type AssetState = "ready" | "needs-manual" | "unavailable";

export type PreviewCategory = "dial" | "hands" | "bezel_insert" | "chapter_ring";

export interface ClassifyInput {
  category: PreviewCategory;
  /** probeBackground().agreement -- how uniform the backdrop is. */
  agreement: number;
  /** Components above the noise floor, largest first. */
  components: Component[];
  /** measure() of the largest component. */
  shape: ShapeMeasures | null;
  /** Hands only: per-component geometry, debris already dropped. */
  hands?: HandGeometry[];
  /** Hands only: measured components that did not look like hands. */
  debris?: HandGeometry[];
  /**
   * Components whose bounding box spans essentially the whole frame. See
   * classify() -- these are the backdrop leaking in, not parts.
   */
  frameSpanning?: number;
}

export interface Classification {
  state: AssetState;
  /** Machine-readable reason, one per rejection path. Counted in the run report. */
  reason: string;
}

/**
 * Below this the backdrop is not seamless: the photo was taken on a desk,
 * a wrist, a slab of wood, or against a gradient. A flood fill against a
 * non-uniform backdrop does not fail loudly -- it eats half the subject or
 * none of it -- so this is checked before anything else and rejects
 * outright rather than trying to compensate.
 */
const MIN_BACKDROP_AGREEMENT = 0.9;

/** Ignore dust and JPEG noise. */
export const NOISE_FLOOR = 0.0015;

/**
 * A component counts as a separate subject only if its bounding box is at
 * least this fraction of the largest component's, measured on the
 * diagonal.
 *
 * A fixed pixel floor is not enough. Most vendors print a small watermark
 * or SKU code below the part, and several dials carry detached printed
 * text -- all comfortably above the noise floor, all counted as a second
 * subject, and 70 good flat-on dials were rejected as "multiple subjects"
 * because of them. Worse, they were also inside the crop box, so the dial
 * would have been scaled down to make room for a watermark.
 *
 * Extent rather than area, because a bezel insert is a thin annulus: its
 * ring encloses a lot of frame but contains few pixels, so a vendor
 * watermark can clear 15% of the ring's *area* while being a tenth of its
 * width. One did, and rode into the finished asset. Bounding-box diagonal
 * is the measure that says "as big an object", which is what is meant.
 *
 * Three dials in one frame each span most of the largest one's box, so
 * they still register as three subjects and are still rejected.
 */
export const SUBJECT_SHARE = 0.3;

/**
 * Hands get a lower bar. Within one set an hour hand is routinely half the
 * length of the seconds hand, so the disc threshold discarded 17 perfectly
 * good hour hands as debris; a watermark is under a tenth either way, so
 * dropping to 0.18 separates the two without letting one back in.
 */
export const HAND_SUBJECT_SHARE = 0.18;

interface Boxed {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function diagonal(c: Boxed): number {
  return Math.hypot(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
}

function shorterSide(c: Boxed): number {
  return Math.min(c.maxX - c.minX + 1, c.maxY - c.minY + 1);
}

/**
 * Diagonal alone is degenerate for a sliver.
 *
 * One insert carried a faint 361x1 line along the bottom edge of the
 * frame. Its diagonal is 361 against the ring's 510, so it cleared the
 * share threshold comfortably and was counted as a second subject -- the
 * ring was rejected as "multiple subjects" and one of the three starter
 * builds lost its insert layer. A real second object has thickness as
 * well as reach.
 */
const MIN_SIDE_SHARE = 0.1;

/**
 * A component reaching this fraction of the frame in *both* axes is the
 * backdrop, not a part: every prepared asset is photographed with margin.
 */
export const FRAME_SPAN = 0.98;

export function isFrameSpanning<T extends Boxed>(c: T, width: number, height: number): boolean {
  return c.maxX - c.minX + 1 >= width * FRAME_SPAN && c.maxY - c.minY + 1 >= height * FRAME_SPAN;
}

/** Splits components into comparable subjects and incidental debris. */
export function partitionSubjects<T extends Boxed>(components: T[], share = SUBJECT_SHARE): { subjects: T[]; debris: T[] } {
  const largest = components[0];
  if (!largest) return { subjects: [], debris: [] };
  const minDiagonal = diagonal(largest) * share;
  const minSide = shorterSide(largest) * MIN_SIDE_SHARE;
  const isSubject = (c: T) => diagonal(c) >= minDiagonal && shorterSide(c) >= minSide;
  return {
    subjects: components.filter(isSubject),
    debris: components.filter((c) => !isSubject(c)),
  };
}

export function classify(input: ClassifyInput): Classification {
  const { category, agreement, components, shape } = input;

  if (agreement < MIN_BACKDROP_AGREEMENT) {
    return { state: "needs-manual", reason: "backdrop-not-seamless" };
  }
  // A component that reaches every edge of the frame is not a part. It is
  // the backdrop, and its presence means the frame holds *two* background
  // colours -- the probe locked onto one and the other survived the flood.
  //
  // That is how a colour-variant montage got through every other check.
  // The panels lined the right and bottom edges, so the modal border
  // colour was the panel grey rather than white; the white gaps between
  // panels then survived as one connected lattice spanning the whole
  // frame, and at 3.3 long-to-wide it passed for a hand. The finished
  // asset was a tangle of white slivers over the dial.
  if ((input.frameSpanning ?? 0) > 0) {
    return { state: "needs-manual", reason: "two-backdrop-colours-in-one-frame" };
  }
  if (components.length === 0) {
    return { state: "unavailable", reason: "no-subject-found" };
  }
  if (shape && shape.coverage > 0.95) {
    // The flood found nothing: the whole frame reads as subject. Usually a
    // photo whose backdrop matches the border tolerance nowhere.
    return { state: "needs-manual", reason: "no-background-separated" };
  }

  // Hands are judged on their own per-hand geometry, never on the shape of
  // the largest blob, so the shape measure is not required on that path --
  // demanding it here reported a perfectly good hand set as "no subject
  // found", which is a different and much more alarming thing than what
  // was actually true.
  if (category === "hands") return classifyHands(components, input.hands ?? [], input.debris ?? []);
  if (!shape) return { state: "unavailable", reason: "no-subject-found" };
  if (category === "bezel_insert") return classifyAnnulus(components, shape, INSERT_HOLE_RANGE);
  if (category === "chapter_ring") return classifyAnnulus(components, shape, CHAPTER_RING_HOLE_RANGE);
  return classifyDisc(components, shape, category);
}

/**
 * A dial or chapter ring photographed flat-on is a single disc: square
 * bounding box, and area close to pi/4 of that box.
 *
 * This is also what rejects a photograph of an assembled watch, which is
 * the failure mode that matters: lugs push the silhouette taller than it
 * is wide and add area outside the disc, so both measures move at once.
 */
function classifyDisc(components: Component[], shape: ShapeMeasures, category: PreviewCategory): Classification {
  if (components.length > 1) {
    return { state: "needs-manual", reason: "multiple-subjects" };
  }
  if (shape.aspect < 0.9 || shape.aspect > 1.11) {
    return { state: "needs-manual", reason: "not-square-silhouette" };
  }
  if (shape.fill < 0.68 || shape.fill > 0.92) {
    return { state: "needs-manual", reason: "not-disc-shaped" };
  }
  // A chapter ring is a ring; a dial is solid. Both are discs by the two
  // measures above, so the hole is what separates them, and a dial with a
  // large hole is a ring that was tagged as a dial (or a ring photographed
  // on top of something).
  if (category === "dial" && shape.holeRatio > 0.4) {
    return { state: "needs-manual", reason: "unexpected-central-hole" };
  }
  return { state: "ready", reason: "ok" };
}

/**
 * A bezel insert is an annulus. The central hole is the whole test.
 *
 * Two of the four vendors photograph inserts *fitted to a complete watch*
 * rather than alone. Those images are square, roughly circular, and on a
 * clean backdrop -- they pass every shape test a disc would -- but their
 * centre is a dial, not a hole. Without this check they would sail
 * through and the preview would draw an entire watch over the user's
 * chosen dial.
 */
/**
 * Central-hole size, as a fraction of outer radius, for the two ring
 * categories. A bezel insert is a broad band -- 37.8mm across a 31.3mm
 * hole on the skx007 platform, so about 0.83 -- while a chapter ring is a
 * much thinner rim, and neither is a disc. The ranges are wide enough to
 * hold the whole platform spread and narrow enough that a photograph of
 * an assembled watch, whose "hole" is a dial, falls outside.
 */
const INSERT_HOLE_RANGE: [number, number] = [0.55, 0.93];
const CHAPTER_RING_HOLE_RANGE: [number, number] = [0.72, 0.98];

function classifyAnnulus(components: Component[], shape: ShapeMeasures, [minHole, maxHole]: [number, number]): Classification {
  if (components.length > 1) {
    return { state: "needs-manual", reason: "multiple-subjects" };
  }
  if (shape.aspect < 0.9 || shape.aspect > 1.11) {
    return { state: "needs-manual", reason: "not-square-silhouette" };
  }
  if (shape.holeRatio < minHole) {
    return { state: "needs-manual", reason: "solid-centre-not-an-annulus" };
  }
  if (shape.holeRatio > maxHole) {
    return { state: "needs-manual", reason: "ring-too-thin-to-be-a-part" };
  }
  return { state: "ready", reason: "ok" };
}

/**
 * Hands ship as a loose set on a backdrop, at whatever angle they landed.
 *
 * Two things have to be true for the set to be usable: the right number of
 * separate hands, and a visible pivot hole on each. The hole matters more
 * than it looks -- it is the axis the hand rotates about, so without it
 * there is no way to place the hand on the dial, and a hand positioned by
 * its bounding-box centre instead sweeps visibly off-centre.
 *
 * The count ceiling is what rejects colour-variant montages, where one
 * image shows the same set in eight finishes. Those segment into 20+
 * components and would otherwise be treated as a 20-hand watch.
 */
function classifyHands(components: Component[], hands: HandGeometry[], debris: HandGeometry[]): Classification {
  if (components.length > 6) {
    return { state: "needs-manual", reason: "too-many-subjects-likely-a-variant-grid" };
  }
  if (hands.length < 2) {
    return { state: "needs-manual", reason: "fewer-than-two-hands" };
  }
  if (hands.length > 4) {
    return { state: "needs-manual", reason: "too-many-hands" };
  }
  // A stray washer, screw or lume pip is dropped as debris rather than
  // failing the set. Anything *large* that is not a hand is different: it
  // means the frame holds something the pipeline did not understand.
  //
  // This is what the component ceiling above missed. One vendor's variant
  // montages put the hero set beside seven small colour panels, and those
  // panels sit on a backdrop about ten levels off white -- just outside
  // the flood tolerance, so each panel became subject, and adjacent
  // panels merged into one or two big blobs. Five components, three of
  // them real hands: it passed every count, and rendered as a tangle of
  // white slivers across the dial.
  const longestHand = Math.max(...hands.map((h) => h.length));
  if (debris.some((d) => d.length >= longestHand * MAX_DEBRIS_SHARE)) {
    return { state: "needs-manual", reason: "large-shape-that-is-not-a-hand" };
  }
  if (debris.length > hands.length) {
    return { state: "needs-manual", reason: "mostly-unidentifiable-shapes" };
  }
  return { state: "ready", reason: "ok" };
}

/**
 * How large a non-hand shape may be, relative to the longest hand, before
 * it disqualifies the set rather than being ignored as debris.
 */
export const MAX_DEBRIS_SHARE = 0.5;

/**
 * Length-to-width ratio below which a component is not a watch hand.
 *
 * The hole requirement this replaced was wrong, not merely strict: it
 * rejected 150 of 237 sampled hand sets, and inspecting them showed the
 * hands were fine -- it was the seconds hand, whose pivot is a pinhole a
 * few pixels across and often filled by shadow, that failed every time.
 * Requiring a hole on *every* hand meant one hard-to-see hole condemned
 * the set. Pivots now fall back to a mass estimate (see handGeometry), so
 * shape is what the classifier tests.
 */
export const MIN_HAND_SLENDERNESS = 2.5;

/**
 * A hand mounts at one end, so almost all of it should sit in front of the
 * pivot. Anything approaching balanced means the pivot landed mid-shaft,
 * and the hand would be drawn as a bar through the middle of the dial --
 * the defect that showed up as crossed X shapes in the first rendered
 * batch.
 */
export const MAX_HAND_TAIL_RATIO = 0.55;

export function isHandShaped(g: HandGeometry): boolean {
  if (g.thickness <= 0) return false;
  if (g.length / g.thickness < MIN_HAND_SLENDERNESS) return false;
  return g.tailRatio <= MAX_HAND_TAIL_RATIO;
}
