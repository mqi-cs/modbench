// Render geometry for the illustrated preview.
//
// The canvas scale is FIXED, and deliberately so. Prepared dial photos
// are baked at 28.5mm across an 800px frame; if the scale moved with the
// case, every dial photo would land at the wrong size. So millimetres map
// to pixels through one constant, and a part's own stated dimensions
// change how big it is drawn inside that fixed space -- never the space.

import type { RenderMm } from "../dimensions";

export const CANVAS = 800;
export const C = CANVAS / 2;

/** Widest part of the watch is the lug span, not the case. */
export const LUG_SPAN_MM = 46;
export const PX_PER_MM = (CANVAS * 0.95) / LUG_SPAN_MM;

export const mm = (v: number) => v * PX_PER_MM;

/**
 * Defaults, in millimetres, for a part that states nothing.
 *
 * These are the MODAL VALUES of what vendors actually state, not guesses:
 * scripts/backfill-dimensions.ts reports 38mm outer on 107 inserts, 31.8
 * inner on 72, 30.5/27.7 on 66 chapter rings and 8.5/12.5 on 45 hand
 * sets. The numbers this file used to carry (37.8 / 31.3 / 28.5 inner /
 * 9.0 hour) were assumptions, and each was measurably wrong.
 */
export const DEFAULT_MM = {
  caseDiameter: 42.5,
  lugWidth: 22,
  lugToLug: 46,
  dialAperture: 28.5,
  crystal: 31.5,
  insertOuter: 38.0,
  insertInner: 31.8,
  ringOuter: 30.5,
  ringInner: 27.7,
  dial: 28.5,
  crown: 7.0,
  hourHand: 8.5,
  minuteHand: 12.5,
  secondHand: 12.5,
} as const;

/** Crown at four o'clock, the SKX's signature. */
export const CROWN_ANGLE = 120;

/**
 * Every dimension the art needs, in millimetres, for one build.
 *
 * Built once per render so each part draws at its own stated size where a
 * vendor stated one and at the platform default where none did. `stated`
 * records which fields came from real data, purely so the verification
 * script can report coverage -- nothing in the art branches on it.
 */
export interface WatchMm {
  caseDiameter: number;
  lugWidth: number;
  lugToLug: number;
  dialAperture: number;
  insertOuter: number;
  insertInner: number;
  ringOuter: number;
  ringInner: number;
  crown: number;
  hourHand: number;
  minuteHand: number;
  secondHand: number;
  stated: string[];
}

/** Keeps a parsed value only when it is present and sane. */
function pick(value: number | undefined, fallback: number, stated: string[], label: string): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  stated.push(label);
  return value;
}

export interface MmInput {
  case?: RenderMm | null;
  insert?: RenderMm | null;
  ring?: RenderMm | null;
  crown?: RenderMm | null;
  hands?: RenderMm | null;
}

export function watchMm(input: MmInput): WatchMm {
  const stated: string[] = [];
  const caseDiameter = pick(input.case?.caseDiameter, DEFAULT_MM.caseDiameter, stated, "case");
  const lugWidth = pick(input.case?.lugWidth, DEFAULT_MM.lugWidth, stated, "lugWidth");
  const insertOuter = pick(input.insert?.outer, DEFAULT_MM.insertOuter, stated, "insertOuter");
  const insertInner = pick(input.insert?.inner, DEFAULT_MM.insertInner, stated, "insertInner");
  const ringOuter = pick(input.ring?.outer, DEFAULT_MM.ringOuter, stated, "ringOuter");
  const ringInner = pick(input.ring?.inner, DEFAULT_MM.ringInner, stated, "ringInner");

  return {
    caseDiameter,
    lugWidth,
    // The lugs reach a fixed 1.75mm past whatever case they are cut into.
    lugToLug: caseDiameter + 3.5,
    dialAperture: pick(input.case?.aperture, DEFAULT_MM.dialAperture, stated, "aperture"),
    // A bore can never be wider than the part it is cut in, whatever two
    // separately-parsed numbers happen to say.
    insertOuter,
    insertInner: Math.min(insertInner, insertOuter - 1),
    ringOuter,
    ringInner: Math.min(ringInner, ringOuter - 0.6),
    crown: pick(input.crown?.diameter, DEFAULT_MM.crown, stated, "crown"),
    hourHand: pick(input.hands?.hour, DEFAULT_MM.hourHand, stated, "hourHand"),
    minuteHand: pick(input.hands?.minute, DEFAULT_MM.minuteHand, stated, "minuteHand"),
    secondHand: pick(input.hands?.second, DEFAULT_MM.secondHand, stated, "secondHand"),
    stated,
  };
}

export const DEFAULT_WATCH_MM = watchMm({});

export function polar(radius: number, degreesFromTwelve: number): [number, number] {
  const rad = ((degreesFromTwelve - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
}

/** Point at (r, θ) with θ measured clockwise from twelve. Canvas pixels. */
export function at(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}
