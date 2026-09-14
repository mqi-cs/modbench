// Real, per-part dimensions mined from the vendors' own words.
//
// WHY THIS EXISTS
//
// lib/preview/layers.ts used to argue that platform constants were the
// better source because "no vendor states either in a feed". That was
// checked against the parsed `attributes` columns, not against the feed
// text, and it is wrong: 17.8% of bezel inserts state an outer diameter
// in body_html, 36.5% of chapter rings state both diameters, and 14.2% of
// hand sets state an H/M/S length triple. The parse simply never ran for
// those fields.
//
// It also matters. The stated numbers disagree with the constants that
// were standing in for them:
//
//   insert outer   38.0mm stated   vs 37.8 assumed
//   insert inner   31.8mm stated   vs 31.3 assumed
//   ring inner     27.7mm stated   vs 28.5 assumed  (the ring overlaps the
//                                                    dial edge; it was drawn
//                                                    flush with it)
//   hour hand       8.5mm stated   vs  9.0 assumed
//
// A bezel-to-case ratio that is half a millimetre out is the first thing
// a modder notices, so these are worth having.
//
// DISPLAY ONLY. These land in `attributes.renderMm`, a namespace no rule
// in lib/compat reads, and they must stay that way. attributes.lengthSetMm
// IS compat-visible (hand-stack-clearance keys off it) and is deliberately
// left null: a length parsed out of marketing prose is good enough to draw
// with and not good enough to assert a fit from.

/**
 * Millimetre dimensions used to draw a part. Never used to judge fitment.
 *
 * The case fields are the exception to "parsed from listing text": they
 * were already extracted into `attributes` by Phase 1 and are populated on
 * 94-99% of cases, so they are read from there and simply travel in the
 * same shape. parseDimensions never emits them.
 */
export interface RenderMm {
  /** bezel_insert, chapter_ring: outside diameter. */
  outer?: number;
  /** bezel_insert, chapter_ring: bore diameter. */
  inner?: number;
  /** crown: diameter across the flutes. */
  diameter?: number;
  /** hands: reach from pivot to tip, per hand. */
  hour?: number;
  minute?: number;
  second?: number;
  /** case: from attributes, not from prose. */
  caseDiameter?: number;
  lugWidth?: number;
  aperture?: number;
}

const N = String.raw`(\d{1,2}(?:\.\d{1,2})?)`;

const OUTER = new RegExp(String.raw`(?:outer|outside)\s*(?:diameter|dia\.?)\s*[:\-–]?\s*${N}\s*mm`, "i");
const INNER = new RegExp(String.raw`(?:inner|inside)\s*(?:diameter|dia\.?)\s*[:\-–]?\s*${N}\s*mm`, "i");
const CROWN = new RegExp(String.raw`crown\s*(?:diameter|dia\.?|size|width)\s*[:\-–]?\s*${N}\s*mm`, "i");
const HANDS = new RegExp(
  String.raw`(?:h\s*\/\s*m\s*\/\s*s|hour\s*\/\s*minute\s*\/\s*second)\s*[:\-–]?\s*${N}\s*(?:mm)?\s*\/\s*${N}\s*(?:mm)?\s*\/\s*${N}\s*mm`,
  "i",
);

/**
 * Plausible ranges, per field.
 *
 * A regex over marketing prose will eventually match a case thickness or
 * a wrist size. Anything outside these is dropped rather than drawn --
 * the constant it falls back to is known-sane, a stray 55mm is not.
 */
const BOUNDS: Record<string, [number, number]> = {
  outer: [24, 46],
  inner: [18, 40],
  diameter: [4, 11],
  hour: [4, 14],
  minute: [7, 17],
  second: [7, 18],
  caseDiameter: [30, 48],
  lugWidth: [14, 26],
  aperture: [22, 36],
};

function bounded(field: keyof RenderMm, raw: string | number | undefined | null): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const v = Number(raw);
  if (!Number.isFinite(v)) return undefined;
  const range = BOUNDS[field];
  if (!range) return undefined;
  return v >= range[0] && v <= range[1] ? v : undefined;
}

/**
 * Case dimensions out of the attributes Phase 1 already parsed.
 *
 * Same bounds check as the prose parse, because "42.5mm" arriving from a
 * tagged column is no more sacred than one arriving from a sentence.
 */
export function caseDimensions(attributes: {
  caseDiameterMm?: unknown;
  lugWidthMm?: unknown;
  dialApertureMm?: unknown;
}): RenderMm {
  const out: RenderMm = {};
  const d = bounded("caseDiameter", attributes.caseDiameterMm as number | null);
  const l = bounded("lugWidth", attributes.lugWidthMm as number | null);
  const a = bounded("aperture", attributes.dialApertureMm as number | null);
  if (d !== undefined) out.caseDiameter = d;
  if (l !== undefined) out.lugWidth = l;
  if (a !== undefined) out.aperture = a;
  return out;
}

/**
 * Parses whatever this category's dimensions are out of listing text.
 *
 * Returns only fields the vendor actually stated and that survive the
 * bounds check, so a caller can tell "stated" from "absent" by presence.
 * Never guesses: a partial result is correct and expected.
 */
export function parseDimensions(category: string, text: string): RenderMm {
  const flat = text.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&[a-z]+;/gi, " ").replace(/\s+/g, " ");
  const out: RenderMm = {};

  if (category === "bezel_insert" || category === "chapter_ring") {
    const outer = bounded("outer", flat.match(OUTER)?.[1]);
    const inner = bounded("inner", flat.match(INNER)?.[1]);
    // A bore wider than the part it is cut in means the two matches came
    // from different sentences. Neither is trustworthy then.
    if (outer !== undefined && inner !== undefined && inner >= outer) return out;
    if (outer !== undefined) out.outer = outer;
    if (inner !== undefined) out.inner = inner;
    return out;
  }

  if (category === "crown") {
    const d = bounded("diameter", flat.match(CROWN)?.[1]);
    if (d !== undefined) out.diameter = d;
    return out;
  }

  if (category === "hands") {
    const m = flat.match(HANDS);
    if (!m) return out;
    const hour = bounded("hour", m[1]);
    const minute = bounded("minute", m[2]);
    const second = bounded("second", m[3]);
    // The minute hand reaches past the hour hand on every watch ever
    // made. If the parse says otherwise it has read the numbers in some
    // other order, and a swapped pair draws worse than the default.
    if (hour === undefined || minute === undefined || minute <= hour) return out;
    out.hour = hour;
    out.minute = minute;
    if (second !== undefined) out.second = second;
    return out;
  }

  return out;
}

/** True when nothing was stated, so the caller should use its constant. */
export function isEmpty(d: RenderMm | undefined): boolean {
  return !d || Object.keys(d).length === 0;
}
