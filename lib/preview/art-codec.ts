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

/** The tags the art actually reads. Order is the bit order; append only. */
export const ART_TAGS = [
  "gold-tone", "silver-tone", "blue", "green", "red", "orange", "yellow",
  "brown", "cream", "white", "grey", "black", "two-tone-bezel", "aged-lume",
] as const;

export interface ArtEntry {
  shape: string;
  tags: string[];
}

export interface EncodedArt {
  /** Distinct silhouettes, referenced by index. */
  s: string[];
  /** One field per sorted part id: "" when not drawn, else "<shapeIdx>.<tagBits>". */
  v: string;
}

export function encodeArt(allIds: string[], art: Readonly<Record<string, ArtEntry>>): EncodedArt {
  const sorted = [...allIds].sort();
  const shapes: string[] = [];
  const fields = sorted.map((id) => {
    const entry = Object.hasOwn(art, id) ? art[id] : undefined;
    if (!entry) return "";
    let shapeIndex = shapes.indexOf(entry.shape);
    if (shapeIndex === -1) shapeIndex = shapes.push(entry.shape) - 1;
    let bits = 0;
    for (const [i, tag] of ART_TAGS.entries()) if (entry.tags.includes(tag)) bits |= 1 << i;
    return bits === 0 ? String(shapeIndex) : `${shapeIndex}.${bits.toString(36)}`;
  });
  return { s: shapes, v: fields.join(",") };
}

export function decodeArt(allIds: string[], encoded: EncodedArt | undefined): Record<string, ArtEntry> {
  const out: Record<string, ArtEntry> = {};
  if (!encoded?.v) return out;
  const sorted = [...allIds].sort();
  const fields = encoded.v.split(",");
  for (const [i, id] of sorted.entries()) {
    const field = fields[i];
    if (!field) continue;
    const [shapeIndex, bitsRaw] = field.split(".");
    const shape = encoded.s[Number(shapeIndex)];
    // A truncated or mismatched payload must read as "not drawn" rather
    // than as some other part's shape.
    if (!shape) continue;
    const bits = bitsRaw ? parseInt(bitsRaw, 36) : 0;
    const tags = ART_TAGS.filter((_, bit) => bits & (1 << bit));
    out[id] = { shape, tags: [...tags] };
  }
  return out;
}
