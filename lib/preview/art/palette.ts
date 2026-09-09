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
 * Ordered so the first match wins. Colour tags are checked in this order
 * because a part tagged both "black" and "silver-tone" (a black hand set
 * with a steel frame) should draw as steel with black inlay, which is what
 * the hand art does with these two values.
 */
const TAG_COLOURS: [string, string][] = [
  ["gold-tone", "#b58c34"],
  ["silver-tone", "#c3c5c4"],
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
