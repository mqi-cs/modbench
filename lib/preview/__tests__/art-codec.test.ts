import { describe, expect, it } from "vitest";
import { ART_TAGS, decodeArt, encodeArt, type ArtEntry } from "../art-codec";

const ids = Array.from({ length: 200 }, (_, i) => `part-${String(i).padStart(3, "0")}`);

function sample(): Record<string, ArtEntry> {
  const out: Record<string, ArtEntry> = {};
  ids.forEach((id, i) => {
    if (i % 3 === 0) return; // a third are not drawn
    const entry: ArtEntry = { shape: `shape-${i % 7}`, tags: i % 5 === 0 ? [] : [ART_TAGS[i % ART_TAGS.length]!, ART_TAGS[(i + 3) % ART_TAGS.length]!] };
    // Most parts state nothing, and the few that do repeat each other --
    // which is the whole reason dimensions are interned rather than
    // carried per part.
    if (i % 4 === 0) entry.mm = { outer: 38, inner: 31.8 };
    if (i % 11 === 0) entry.mm = { hour: 8.5, minute: 12.5, second: 12.75 };
    out[id] = entry;
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
      expect(back[id]!.mm, id).toEqual(entry.mm);
    }
  });

  it("carries a part that has dimensions but no silhouette -- the case", () => {
    const art: Record<string, ArtEntry> = {
      [ids[0]!]: { shape: "", tags: [], mm: { caseDiameter: 42.5, lugWidth: 22, aperture: 28.5 } },
      [ids[1]!]: { shape: "hand-sword", tags: ["black"] },
    };
    const back = decodeArt(ids, encodeArt(ids, art));
    expect(back[ids[0]!]).toEqual({ shape: "", tags: [], mm: { caseDiameter: 42.5, lugWidth: 22, aperture: 28.5 } });
    expect(back[ids[1]!]!.shape).toBe("hand-sword");
  });

  it("interns dimensions rather than repeating them per part", () => {
    const encoded = encodeArt(ids, sample());
    // 200 parts, two distinct dimension sets between them.
    expect(encoded.d).toEqual(["038-131.8", "38.5-412.5-512.75"]);
  });

  it("does not depend on the order ids are given in", () => {
    const art = sample();
    expect(encodeArt([...ids].reverse(), art)).toEqual(encodeArt(ids, art));
  });

  it("reads a truncated or empty payload as 'not drawn', never as another part's shape", () => {
    expect(Object.keys(decodeArt(ids, undefined))).toEqual([]);
    expect(Object.keys(decodeArt(ids, { s: [], v: "" }))).toEqual([]);
    const full = encodeArt(ids, sample());
    const truncated = { s: full.s, d: full.d, v: full.v.split(",").slice(0, 20).join(",") };
    const back = decodeArt(ids, truncated);
    expect(Object.keys(back).length).toBeLessThan(Object.keys(sample()).length);
    // Whatever survives must still be correct, not shifted.
    const art = sample();
    for (const [id, entry] of Object.entries(back)) expect(entry.shape).toBe(art[id]!.shape);
  });

  it("drops a dimension whose dictionary entry is missing, rather than guessing", () => {
    const full = encodeArt(ids, sample());
    const back = decodeArt(ids, { s: full.s, v: full.v });
    for (const entry of Object.values(back)) expect(entry.mm).toBeUndefined();
    expect(Object.keys(back).length).toBeGreaterThan(100);
  });

  it("is dramatically smaller than the keyed map it replaces", () => {
    const art = sample();
    const encoded = encodeArt(ids, art);
    expect(JSON.stringify(encoded).length).toBeLessThan(JSON.stringify(art).length / 2);
  });
});
