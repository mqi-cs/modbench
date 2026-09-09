// Render geometry for the illustrated preview.
//
// Real SKX007 dimensions, in millimetres, and the canvas scale that maps
// them to the same 800x800 frame the Phase 4 assets already use — so a
// prepared dial photo drops straight into the redrawn case at the right
// size with no fiddling.

export const CANVAS = 800;

/** Widest part of the watch is the lug span, not the case. */
export const LUG_SPAN_MM = 46;
export const PX_PER_MM = (CANVAS * 0.95) / LUG_SPAN_MM;

export const MM = {
  caseDiameter: 42.5,
  lugWidth: 22,
  insertOuter: 37.8,
  insertInner: 31.3,
  crystal: 31.5,
  chapterRing: 30.6,
  dial: 28.5,
  minuteHandReach: 13.5,
  hourHandReach: 9.2,
  secondHandReach: 13.0,
} as const;

export const mm = (v: number) => v * PX_PER_MM;
export const C = CANVAS / 2;

/** Crown at four o'clock, the SKX's signature. */
export const CROWN_ANGLE = 120;

export function polar(radius: number, degreesFromTwelve: number): [number, number] {
  const rad = ((degreesFromTwelve - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
}
