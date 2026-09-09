import { describe, expect, it } from "vitest";
import { ART_TAGS, decodeArt, encodeArt, type ArtEntry } from "../art-codec";

const ids = Array.from({ length: 200 }, (_, i) => `part-${String(i).padStart(3, "0")}`);

function sample(): Record<string, ArtEntry> {
  const out: Record<string, ArtEntry> = {};
  ids.forEach((id, i) => {
    if (i % 3 === 0) return; // a third are not drawn
    out[id] = { shape: `shape-${i % 7}`, tags: i % 5 === 0 ? [] : [ART_TAGS[i % ART_TAGS.length]!, ART_TAGS[(i + 3) % ART_TAGS.length]!] };
  });
  return out;
}

describe("art codec", () => {
  it("round-trips shapes and tags", () => {
    const art = sample();
    const back = decodeArt(ids, encodeArt(ids, art));
    expect(Object.keys(back).sort()).toEqual(Object.keys(art).sort());
    for (const [id, entry] of Object.entries(art)) {
      expect(back[id]!.shape, id).toBe(entry.shape);
      expect([...back[id]!.tags].sort(), id).toEqual([...entry.tags].sort());
    }
  });

  it("does not depend on the order ids are given in", () => {
    const art = sample();
    expect(encodeArt([...ids].reverse(), art)).toEqual(encodeArt(ids, art));
  });

  it("reads a truncated or empty payload as 'not drawn', never as another part's shape", () => {
    expect(Object.keys(decodeArt(ids, undefined))).toEqual([]);
    expect(Object.keys(decodeArt(ids, { s: [], v: "" }))).toEqual([]);
    const full = encodeArt(ids, sample());
    const truncated = { s: full.s, v: full.v.split(",").slice(0, 20).join(",") };
    const back = decodeArt(ids, truncated);
    expect(Object.keys(back).length).toBeLessThan(Object.keys(sample()).length);
    // Whatever survives must still be correct, not shifted.
    const art = sample();
    for (const [id, entry] of Object.entries(back)) expect(entry.shape).toBe(art[id]!.shape);
  });

  it("is dramatically smaller than the keyed map it replaces", () => {
    const art = sample();
    const encoded = encodeArt(ids, art);
    expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(art).length / 2);
  });
});
