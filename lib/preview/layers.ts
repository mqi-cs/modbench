// Render geometry and z-order for the preview.
//
// Pure data and arithmetic. Nothing here reaches the database, and
// nothing here is ever read by lib/compat -- these numbers decide how
// large to draw a part, never whether it fits.
//
// WHY PLATFORM CONSTANTS AND NOT PART ATTRIBUTES
//
// specs/05-phase-4-preview.md says to scale each part by its own
// `attributes` diameter field. Those fields are empty: outerDiameterMm is
// null for all 681 approved bezel inserts and lengthSetMm is null for all
// 438 approved hand sets, because no vendor states either in a feed. Only
// dial diameterMm is populated, and it is the same 28.5 for all 467 that
// have it.
//
// Falling back to the platform is not a workaround, it is the more
// accurate source. These parts are interchangeable *because* their
// dimensions are fixed by the case they mount to -- an SKX007 bezel
// insert is 37.8mm across regardless of who sells it, which is the entire
// premise the catalog is built on. A per-SKU number would only ever
// restate the platform's number, or be wrong.

export const CANVAS = 800;

/**
 * The canvas is sized by lug-to-lug span, not case diameter.
 *
 * Scaling to the 42.5mm case put the case edge hard against the frame and
 * cut the lugs off entirely -- they reach about 1.75mm past the case on
 * each side, so the widest part of an SKX007 is its 46mm lug span, and
 * that is what has to fit.
 */
const LUG_SPAN_MM = 46;
export const PX_PER_MM = (CANVAS * 0.95) / LUG_SPAN_MM;

/**
 * Real-world diameters, in millimetres, for the case platforms this phase
 * covers. Sourced from the same vendor fitment documentation the compat
 * rules were built from -- these are the standard mod dimensions, not
 * measurements of any one SKU.
 *
 * Phase 4 is scoped to skx007 (specs/05-phase-4-preview.md, "Scope this
 * phase to the skx007-case family only"); skx013 is listed because its
 * geometry is already known and adding the silhouette later is the cheap
 * expansion the spec describes.
 */
export const PLATFORM_GEOMETRY: Record<string, { case: number; insert: number; chapterRing: number; dial: number; crystal: number }> = {
  skx007: { case: 42.5, insert: 37.8, chapterRing: 30.6, dial: 28.5, crystal: 31.5 },
  skx013: { case: 37.8, insert: 33.0, chapterRing: 30.6, dial: 28.5, crystal: 28.0 },
};

export const DEFAULT_PLATFORM = "skx007";

/**
 * A hand set is drawn to the minute hand's reach, which is what the eye
 * actually judges: a minute hand should land on the minute track at the
 * dial's edge. Expressed as a diameter (tip to tip through the pivot) so
 * it shares the units of everything else here.
 */
const HAND_SET_SPAN_MM = 27.0;

import { familyPlatform } from "../compat/platform";

function geometryFor(family: string): (typeof PLATFORM_GEOMETRY)[string] {
  const platform = familyPlatform(family);
  return (platform && PLATFORM_GEOMETRY[platform]) || PLATFORM_GEOMETRY[DEFAULT_PLATFORM]!;
}

/**
 * Radius, in canvas pixels, that a part of this category should be drawn
 * at. Dials and hand sets carry no platform in their family (they are
 * universal across these cases, which is why the catalog does not scope
 * them), so they fall through to the default platform's geometry.
 */
export function renderRadiusPx(category: string, family: string): number {
  const g = geometryFor(family);
  switch (category) {
    case "case":
      return (g.case * PX_PER_MM) / 2;
    case "bezel":
      return (g.case * PX_PER_MM) / 2;
    case "bezel_insert":
      return (g.insert * PX_PER_MM) / 2;
    case "chapter_ring":
      return (g.chapterRing * PX_PER_MM) / 2;
    case "dial":
      return (g.dial * PX_PER_MM) / 2;
    case "crystal":
      return (g.crystal * PX_PER_MM) / 2;
    case "hands":
      return (HAND_SET_SPAN_MM * PX_PER_MM) / 2;
    default:
      return (g.dial * PX_PER_MM) / 2;
  }
}

/**
 * Draw order, back to front. specs/05-phase-4-preview.md fixes this list;
 * pass measure 5 ("insert never behind the case, hands never behind the
 * dial") is a test over exactly this array, so it is exported rather than
 * inlined into the draw loop.
 */
export const LAYER_ORDER = ["case", "dial", "chapterRing", "hands", "bezel", "bezelInsert", "glare"] as const;
export type LayerKey = (typeof LAYER_ORDER)[number];

/** Build slot each layer draws from. `glare` is generated, not a part. */
export const LAYER_SLOT: Record<LayerKey, string | null> = {
  case: "case",
  dial: "dial",
  chapterRing: "chapterRing",
  hands: "hands",
  bezel: "bezel",
  bezelInsert: "bezelInsert",
  glare: null,
};

export function layerIndex(key: LayerKey): number {
  return LAYER_ORDER.indexOf(key);
}
