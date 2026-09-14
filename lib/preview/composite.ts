// Turns a build into the things the art needs to draw.
//
// Pure, per specs/05-phase-4-preview.md: nothing here loads an image,
// touches the DOM, or reads the clock, so layer order and graceful
// degradation are testable as arithmetic rather than by looking at pixels.
//
// The model changed when the preview moved from compositing prepared
// photographs to drawing silhouettes: a build is now one photograph (the
// dial) plus a set of shapes, not a uniform stack of layers. Those are
// genuinely different kinds of thing, and the old layer list made that
// awkward once most parts stopped being photographs.

import type { RenderMm } from "./dimensions";

export function assetUrl(category: string, partId: string): string {
  return `/assets/${category}/${partId}.webp`;
}

/** One illustrated part: which silhouette to draw, in what colours, at what size. */
export interface ShapePart {
  partId: string;
  name: string;
  shape: string;
  tags: string[];
  /** The vendor's own millimetres, where this part states any. */
  mm?: RenderMm;
}

/**
 * Everything the art needs to draw a build.
 *
 * The dial is a photograph and every other part is a shape, so this is
 * deliberately not a uniform list of layers -- the two are different
 * kinds of thing and pretending otherwise is what made the old
 * asset-per-layer model awkward once parts started being drawn.
 */
export interface ResolvedWatch {
  hasCase: boolean;
  /** Case dimensions, from its attributes. Null when no case is chosen. */
  caseMm: RenderMm | null;
  /**
   * The case's own finish tags. The case used to be drawn from a fixed
   * steel palette whatever was chosen, which is why a PVD-black case and
   * a steel one produced identical pixels.
   */
  caseTags: string[];
  /** Dial photo, when the part has a prepared asset. */
  dialHref: string | null;
  /** True when a dial is selected but has no usable photograph. */
  dialPlaceholder: boolean;
  dialName: string | null;
  crown: ShapePart | null;
  chapterRing: ShapePart | null;
  hands: ShapePart | null;
  bezelInsert: ShapePart | null;
  strap: ShapePart | null;
}

export interface ResolveInput {
  parts: Partial<Record<string, string>>;
  /** Part ids with a prepared photo. Only the dial consults this now. */
  previewable: ReadonlySet<string>;
  /** Per-part display data: name, shapeTag, styleTags and stated size. */
  meta: Readonly<Record<string, { name: string; shape: string; tags: string[]; mm?: RenderMm }>>;
}

const SHAPE_SLOTS = ["crown", "chapterRing", "hands", "bezelInsert", "strap"] as const;

/**
 * Resolves a build into one photograph and a set of silhouettes.
 *
 * Every part in an illustrated category resolves to a shape: its own, or
 * the documented fallback its category takes when the vendor's words say
 * nothing about form. There is no path here that yields an unshaded part,
 * which was the point of the rollout.
 */
export function resolveWatch(input: ResolveInput): ResolvedWatch {
  // Object.hasOwn, not a bare lookup: part ids arrive from a query string
  // and `meta` is a plain object, so an id like "constructor" would
  // otherwise resolve to something inherited from Object.prototype.
  const metaFor = (id: string) => (Object.hasOwn(input.meta, id) ? input.meta[id] : undefined);

  const pick = (slot: string): ShapePart | null => {
    const partId = input.parts[slot];
    if (!partId) return null;
    const meta = metaFor(partId);
    if (!meta) return null;
    return { partId, name: meta.name, shape: meta.shape, tags: meta.tags, mm: meta.mm };
  };

  const dialId = input.parts.dial;
  const dialHasPhoto = Boolean(dialId && input.previewable.has(dialId));

  const caseId = input.parts.case;
  const out: ResolvedWatch = {
    hasCase: Boolean(caseId),
    caseMm: caseId ? (metaFor(caseId)?.mm ?? null) : null,
    caseTags: caseId ? (metaFor(caseId)?.tags ?? []) : [],
    dialHref: dialId && dialHasPhoto ? assetUrl("dial", dialId) : null,
    dialPlaceholder: Boolean(dialId) && !dialHasPhoto,
    dialName: dialId ? (metaFor(dialId)?.name ?? null) : null,
    crown: null,
    chapterRing: null,
    hands: null,
    bezelInsert: null,
    strap: null,
  };
  for (const slot of SHAPE_SLOTS) out[slot] = pick(slot);
  return out;
}

/**
 * Layers actually drawn, back to front.
 *
 * Exported so pass measure 5 ("insert never behind the case, hands never
 * behind the dial") stays a test over a list rather than an inspection of
 * the SVG.
 */
export function drawnLayers(watch: ResolvedWatch): string[] {
  const out: string[] = [];
  if (watch.strap) out.push("strap");
  if (watch.hasCase) out.push("case");
  if (watch.hasCase && watch.crown) out.push("crown");
  if (watch.dialHref || watch.dialPlaceholder) out.push("dial");
  if (watch.chapterRing) out.push("chapterRing");
  if (watch.hands) out.push("hands");
  if (watch.hasCase && watch.bezelInsert) out.push("bezelInsert");
  return out;
}
