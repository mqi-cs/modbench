// Edge-facet primitive: the one place the illustrated preview decides how
// a surface catches light.
//
// Every part calls this rather than shading itself, which is the whole
// reason the assembly reads as one object. The technique came out of a
// run of side-by-side tests against the vendors' own photographs: a
// narrow bright strip along the silhouette where it faces the light, a
// narrow dark strip where it faces away, and a FLAT interior. Smooth
// ramps across the interior were tried first and read as matte plastic --
// polished steel concentrates its brightest values in narrow bands at
// chamfers, and it is that frequency, not the amplitude, that says metal.

import { C } from "./geometry";

/**
 * One light direction for every part on the watch.
 *
 * Top-left, in screen coordinates, expressed as the direction light
 * travels. Lives here rather than in ShadedParts so both that module and
 * this one can use it without importing each other in a cycle.
 */
export const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

/**
 * Facet width, in canvas pixels, CONSTANT everywhere.
 *
 * Tab 5 sized the strip as a fraction of each shape, which made it
 * thicken on the hour hand and thin to nothing on the seconds needle. A
 * real chamfer is a fixed physical width — roughly 0.15mm of polished
 * bevel whatever it is cut into — so it is an absolute here and every
 * caller uses this one number.
 */
export const FACET_PX = 3.2;

/** Where the light sits, as an angle clockwise from twelve. Top-left. */
export const LIT_FROM_TWELVE = 315;

/** How much of a circular rim counts as lit, and as shadowed. */
const ARC_SPAN = 78;

function pointOn(cx: number, cy: number, r: number, degFromTwelve: number): [number, number] {
  const a = ((degFromTwelve - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function arcPath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = pointOn(cx, cy, r, fromDeg);
  const [x2, y2] = pointOn(cx, cy, r, toDeg);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Edge facet on a circular rim: a bright arc where the rim turns toward
 * the light and a dark arc opposite it, both at constant width.
 *
 * `inner` flips which side of the rim is lit — the inside of a ring
 * catches light on the arc AWAY from the source, because you are seeing
 * the far wall of the bore.
 */
export function CircleFacet({
  cx = C,
  cy = C,
  r,
  bright,
  dark,
  width = FACET_PX,
  inner = false,
  opacity = 1,
}: {
  cx?: number;
  cy?: number;
  r: number;
  bright: string;
  dark: string;
  width?: number;
  inner?: boolean;
  opacity?: number;
}) {
  const lit = inner ? LIT_FROM_TWELVE + 180 : LIT_FROM_TWELVE;
  return (
    <g opacity={opacity} fill="none" strokeWidth={width} strokeLinecap="butt">
      <path d={arcPath(cx, cy, r, lit - ARC_SPAN, lit + ARC_SPAN)} stroke={bright} />
      <path d={arcPath(cx, cy, r, lit + 180 - ARC_SPAN, lit + 180 + ARC_SPAN)} stroke={dark} />
    </g>
  );
}

/**
 * Edge facet on an axis-aligned block: strips on the two sides facing the
 * light and the two facing away. Used for the lugs and the crown barrel,
 * which are the only rectilinear parts in the assembly.
 */
export function RectFacet({
  x,
  y,
  w,
  h,
  bright,
  dark,
  width = FACET_PX,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  bright: string;
  dark: string;
  width?: number;
}) {
  // Light from the top left, so top and left edges are lit.
  const litX = LIGHT.x < 0;
  const litY = LIGHT.y < 0;
  return (
    <g>
      <rect x={x} y={litY ? y : y + h - width} width={w} height={width} fill={bright} />
      <rect x={x} y={litY ? y + h - width : y} width={w} height={width} fill={dark} />
      <rect x={litX ? x : x + w - width} y={y} width={width} height={h} fill={bright} />
      <rect x={litX ? x + w - width : x} y={y} width={width} height={h} fill={dark} />
    </g>
  );
}

/** Lighten / darken a hex by mixing toward white or black. */
export function shift(hex: string, toward: "light" | "dark", t: number): string {
  const target = toward === "light" ? 255 : 0;
  const n = parseInt(hex.slice(1), 16);
  const ch = (sh: number) => Math.round((((n >> sh) & 255) * (1 - t) + target * t));
  return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("");
}

/** Bright/dark pair for a base colour, at the same contrast everywhere. */
export function facetPair(base: string, strength = 0.42): { bright: string; dark: string } {
  return { bright: shift(base, "light", strength), dark: shift(base, "dark", strength * 0.72) };
}

/**
 * Which flank of a part faces the light, given its own rotation.
 *
 * Returns -1..1; positive means the part's local +x side is lit. One
 * global light direction therefore produces a different highlight on
 * every hand, rather than the same canned strip stamped on each.
 */
export function litSideOf(angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180;
  return -(Math.cos(a) * LIGHT.x + Math.sin(a) * LIGHT.y);
}
