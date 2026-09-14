// Compact encoding of "how each part is drawn".
//
// The obvious shape -- a map of part id to {shape, tags} -- costs 35.4KB
// gzipped, and almost all of it is the 1,769 nanoid keys: 21 random
// characters each, which gzip cannot compress. The payload already
// carries every part id in `parts`, so the ids are redundant. Indexing by
// the sorted id order instead drops the keys entirely.
//
// Same trick, and the same ordering rule, as previewable.ts: sorted ids,
// because sorting is deterministic on both sides and relying on object
// key order would couple the client to how the payload was serialised.
//
// Dimensions ride along the same way. There are only a few dozen distinct
// millimetre combinations across the whole catalog -- nearly every SKX
// insert that states a size states the same 38/31.8 -- so they are
// interned into a dictionary and referenced by index, which costs about
// a character per part instead of a JSON object per part.

import type { RenderMm } from "./dimensions";

/** The tags the art actually reads. Order is the bit order; append only. */
export const ART_TAGS = [
  "gold-tone", "silver-tone", "blue", "green", "red", "orange", "yellow",
  "brown", "cream", "white", "grey", "black", "two-tone-bezel", "aged-lume",
  // Appended, never reordered -- the position IS the bit.
  "rose-gold", "matte", "polished", "brushed",
] as const;

/** Dimension fields, in the order they are serialised. Append only. */
const MM_FIELDS = ["outer", "inner", "diameter", "hour", "minute", "second", "caseDiameter", "lugWidth", "aperture"] as const;

export interface ArtEntry {
  /** Empty for a part that carries dimensions but no silhouette -- the case. */
  shape: string;
  tags: string[];
  mm?: RenderMm;
}

export interface EncodedArt {
  /** Distinct silhouettes, referenced by index. */
  s: string[];
  /** Distinct dimension sets, referenced by index. Absent when none. */
  d?: string[];
  /** One field per sorted part id: "" when absent, else "<shape>[.<tagBits>][:<dimIdx>]". */
  v: string;
}

function encodeMm(mm: RenderMm | undefined): string | null {
  if (!mm) return null;
  const parts: string[] = [];
  for (const [i, field] of MM_FIELDS.entries()) {
    const v = mm[field];
    if (typeof v === "number" && Number.isFinite(v)) parts.push(`${i.toString(36)}${v}`);
  }
  return parts.length > 0 ? parts.join("-") : null;
}

function decodeMm(token: string | undefined): RenderMm | undefined {
  if (!token) return undefined;
  const out: RenderMm = {};
  for (const chunk of token.split("-")) {
    const field = MM_FIELDS[parseInt(chunk[0] ?? "", 36)];
    const value = Number(chunk.slice(1));
    if (field && Number.isFinite(value)) out[field] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function encodeArt(allIds: string[], art: Readonly<Record<string, ArtEntry>>): EncodedArt {
  const sorted = [...allIds].sort();
  const shapes: string[] = [];
  const dims: string[] = [];
  const fields = sorted.map((id) => {
    const entry = Object.hasOwn(art, id) ? art[id] : undefined;
    if (!entry) return "";

    let bits = 0;
    for (const [i, tag] of ART_TAGS.entries()) if (entry.tags.includes(tag)) bits |= 1 << i;

    let head = "";
    if (entry.shape) {
      let shapeIndex = shapes.indexOf(entry.shape);
      if (shapeIndex === -1) shapeIndex = shapes.push(entry.shape) - 1;
      head = bits === 0 ? String(shapeIndex) : `${shapeIndex}.${bits.toString(36)}`;
    } else if (bits !== 0) {
      // A case: no silhouette, but its finish tags still have to travel.
      head = `.${bits.toString(36)}`;
    }

    const mmToken = encodeMm(entry.mm);
    if (mmToken === null) return head;
    let dimIndex = dims.indexOf(mmToken);
    if (dimIndex === -1) dimIndex = dims.push(mmToken) - 1;
    return `${head}:${dimIndex}`;
  });
  return dims.length > 0 ? { s: shapes, d: dims, v: fields.join(",") } : { s: shapes, v: fields.join(",") };
}

export function decodeArt(allIds: string[], encoded: EncodedArt | undefined): Record<string, ArtEntry> {
  const out: Record<string, ArtEntry> = {};
  if (!encoded?.v) return out;
  const sorted = [...allIds].sort();
  const fields = encoded.v.split(",");
  for (const [i, id] of sorted.entries()) {
    const field = fields[i];
    if (!field) continue;
    const [head = "", dimRaw] = field.split(":");
    const mm = dimRaw === undefined ? undefined : decodeMm(encoded.d?.[Number(dimRaw)]);

    const [shapeIndex, bitsRaw] = head.split(".");
    const tagsOf = (raw: string | undefined) => {
      const bits = raw ? parseInt(raw, 36) : 0;
      return ART_TAGS.filter((_, bit) => bits & (1 << bit)) as unknown as string[];
    };

    // A case: finish tags and dimensions, but no silhouette. Written as a
    // leading dot, so the shape index parses as empty rather than as 0 --
    // which would have drawn every case as whatever shape happened to be
    // first in the dictionary.
    if (shapeIndex === "") {
      if (head !== "" || mm) out[id] = { shape: "", tags: tagsOf(bitsRaw), mm };
      continue;
    }
    const shape = encoded.s[Number(shapeIndex)];
    // A truncated or mismatched payload must read as "not drawn" rather
    // than as some other part's shape.
    if (!shape) continue;
    const tags = tagsOf(bitsRaw);
    out[id] = mm ? { shape, tags, mm } : { shape, tags };
  }
  return out;
}
