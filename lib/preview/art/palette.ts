// Colours for the illustrated preview.
//
// Part colour comes from the styleTags the search vocabulary already
// carries, so a "black ceramic" insert draws black without a second
// tagging pass. Steel tones are the values measured off a vendor
// photograph during the shading investigation, not picked by eye: the
// metal population in that photo ran #a9a9a9 to #eaeaea around a #b4b3b3
// median, and these sit inside it.

export const STEEL = {
  light: "#d2d2cf",
  body: "#bcbcb8",
  mid: "#a4a49f",
  dark: "#8a8a85",
  /** Measured median of the polished-steel population. */
  measured: "#b4b3b3",
  /** Measured black-lume median. Near-uniform in the photo, so drawn flat. */
  lume: "#2a2a2a",
} as const;

export const RECESS = "#3c3c3a";

/**
 * Chromatic colours, checked BEFORE the metal tones below.
 *
 * Order matters and this one is the fix for a real bug. Vendors name the
 * insert's material and its face in the same string -- "Steel Bezel
 * Insert: Nautical Blue" carries both `silver-tone` and `blue` -- and
 * with the metals checked first every such insert drew steel-coloured.
 * The face is what the preview shows, so the face colour wins; a part
 * with no chromatic tag still falls through to its metal tone.
 */
const TAG_COLOURS: [string, string][] = [
  ["blue", "#26406b"],
  ["green", "#22462f"],
  ["red", "#7d2129"],
  ["orange", "#c2611d"],
  ["yellow", "#cfa626"],
  ["brown", "#4d3728"],
  ["cream", "#e0d3b2"],
  ["white", "#eceae4"],
  ["grey", "#5d6064"],
  ["black", "#23252a"],
  ["gold-tone", "#b58c34"],
  ["silver-tone", "#c3c5c4"],
];

/** Body colour for a part, from its style tags. */
export function bodyColour(tags: readonly string[], fallback: string): string {
  for (const [tag, colour] of TAG_COLOURS) if (tags.includes(tag)) return colour;
  return fallback;
}

/** Metal tone for a part that is metal rather than coloured. */
export function metalColour(tags: readonly string[]): string {
  if (tags.includes("gold-tone")) return "#b58c34";
  if (tags.includes("black") && !tags.includes("silver-tone")) return "#3a3c40";
  return STEEL.measured;
}

/** Legible ink for markings printed on a given ground. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  return l > 0.55 ? "#26282c" : "#ececea";
}

/**
 * A four-tone metal ramp plus the contrast its finish implies.
 *
 * The case used to be drawn from the STEEL constants unconditionally, so
 * 130 PVD-black and 97 gold cases in the catalog all rendered as bare
 * steel -- a part shown in the wrong colour, on a tool whose claim is
 * accuracy. The ramp keeps the SAME relative light/body/mid/dark spacing
 * whatever the base colour, because that spacing is what the edge facets
 * are tuned against; only the hue moves.
 */
export interface MetalFamily {
  light: string;
  body: string;
  mid: string;
  dark: string;
  /** Facet contrast. Polished metal throws a harder edge than sandblasted. */
  facet: number;
}

function ramp(base: string, facet: number): MetalFamily {
  return {
    light: shiftHex(base, 255, 0.17),
    body: base,
    mid: shiftHex(base, 0, 0.1),
    dark: shiftHex(base, 0, 0.25),
    facet,
  };
}

function shiftHex(hex: string, target: number, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (sh: number) => Math.round((((n >> sh) & 255) * (1 - t) + target * t));
  return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("");
}

/**
 * Metal family for a case, bezel or bracelet, from its own finish tags.
 *
 * Order matters: `rose-gold` is checked before `gold-tone` because the
 * vendor string "Rose Gold Finish" contains "gold" and carries both tags.
 */
export function metalFamily(tags: readonly string[]): MetalFamily {
  // Sandblasted and matte cases scatter light; polished ones concentrate
  // it. Everything else sits between.
  const facet = tags.includes("polished") ? 0.5 : tags.includes("matte") ? 0.28 : tags.includes("brushed") ? 0.36 : 0.42;
  if (tags.includes("rose-gold")) return ramp("#b0846f", facet);
  if (tags.includes("gold-tone")) return ramp("#b6902f", facet);
  if (tags.includes("black")) return ramp("#3a3c40", facet);
  if (tags.includes("grey")) return ramp("#6e7175", facet);
  if (tags.includes("blue")) return ramp("#4a5a72", facet);
  return ramp(STEEL.measured, facet);
}
