// Controlled vocabulary for `attributes.styleTags`. Phase 6 (natural-language
// and image search) depends on these staying a closed, consistent set — a
// tag outside this list must never reach an approved part. Extend this list
// deliberately; don't let a one-off vendor adjective slip in as a tag.

export const STYLE_TAGS = [
  "sunburst",
  "matte",
  "textured",
  "lacquer",
  "applied-indices",
  "printed-indices",
  "sword-hands",
  "dauphine-hands",
  "syringe-hands",
  "mercedes-hands",
  "snowflake",
  "dive-bezel",
  "gmt",
  "gmt-bezel",
  "vintage-lume",
  "no-lume",
  "sterile",
  "day-date",
  "date-only",
  "no-date",
  "field-style",
  "dress-style",
  "military-style",
  "chronograph-style",
  "explorer-style",
  "alpinist-style",
  "vintage-diver",
] as const;

export type StyleTag = (typeof STYLE_TAGS)[number];

const STYLE_TAG_SET: ReadonlySet<string> = new Set(STYLE_TAGS);

export function isStyleTag(value: string): value is StyleTag {
  return STYLE_TAG_SET.has(value);
}

/** Splits input tags into ones that are in the controlled vocabulary and ones that must be dropped. */
export function partitionStyleTags(candidates: readonly string[]): {
  valid: StyleTag[];
  dropped: string[];
} {
  const valid: StyleTag[] = [];
  const dropped: string[] = [];
  for (const c of candidates) {
    if (isStyleTag(c)) {
      valid.push(c);
    } else {
      dropped.push(c);
    }
  }
  return { valid, dropped };
}
