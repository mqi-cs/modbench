// Stepped-elevation cues.
//
// Edge facets say "this is metal". They do not say "this ring sits above
// that one" -- with every boundary lit identically, the assembly read as
// a stack of discs all at one height rather than as a well you look down
// into. What carries depth in a real top-down photograph is the narrow
// shadow each ring throws onto the surface below it, always on the side
// away from the light.
//
// Necessarily the same light as the facets: a contact shadow thrown from
// a different direction fights them and both lose.
//
// WHAT WAS TRIED, AND WHAT SURVIVED
//
//   inner-edge facets at every step   kept -- already the technique, and
//                                     every boundary now has a lip
//   contact shadows at every step     kept -- by far the strongest cue,
//                                     and the only one that made the dial
//                                     read as SUNK rather than pasted on
//   axial offset of dial and hands    DISCARDED -- see OFFSET_PX below
//
// The offset is the interesting failure. Shifting the dial a pixel or two
// with the light is what a real photograph does, but a real photograph
// also shifts the case walls, the insert bore and the hands' shadows by
// the same parallax. Moving only the dial made the chapter ring look
// out of round, which is a worse error than the one it fixed.

import { arcPath, LIT_FROM_TWELVE } from "./facets";
import { C, mm, type WatchMm } from "./geometry";

/** How far round the rim a cast shadow reaches. Narrower than a facet arc. */
const SHADOW_SPAN = 66;

/** Kept at zero. The axial-offset experiment is written up above. */
export const OFFSET_PX = 0;

/**
 * Shadow cast by a ring onto whatever sits inside and below it.
 *
 * Sits just INSIDE radius `r`, opposite the light. A plain arc at low
 * opacity rather than a blurred filter: ten previews on the homepage
 * would be ten filter regions, and at the size these are actually seen
 * the crisp version reads the same.
 */
export function StepShadow({ r, width, opacity = 0.32 }: { r: number; width: number; opacity?: number }) {
  const away = LIT_FROM_TWELVE + 180;
  return (
    <path
      d={arcPath(C, C, r - width / 2, away - SHADOW_SPAN, away + SHADOW_SPAN)}
      fill="none"
      stroke="#000000"
      strokeWidth={width}
      strokeLinecap="butt"
      opacity={opacity}
    />
  );
}

/**
 * The shadow the chapter ring throws onto the dial.
 *
 * The one step a dial photograph cannot supply for itself: the photo is
 * lit flat and cropped at its own edge, so without this the dial reads as
 * pasted onto the ring rather than sitting below it.
 */
export function RingShadow({ m }: { m: WatchMm }) {
  return <StepShadow r={mm(m.ringInner) / 2} width={mm(0.8)} opacity={0.3} />;
}
