import { describe, expect, it } from "vitest";
import {
  candidateSource,
  colourAgreement,
  hexDistance,
  hexToBits,
  keywordOverlap,
  keywords,
  normaliseProductUrl,
  suggestMatches,
  type MatchablePart,
} from "../match";
import { HASH_BITS, bitsToHex, hamming, phash, IMAGE_SIDE } from "../phash";

describe("normaliseProductUrl", () => {
  it("treats the same product page written every way as one key", () => {
    const expected = "namokimods.com/products/watch-hands-mm1000-black-finish";
    for (const written of [
      "https://namokimods.com/products/watch-hands-mm1000-black-finish",
      "http://www.namokimods.com/products/watch-hands-mm1000-black-finish/",
      "namokimods.com/products/watch-hands-mm1000-black-finish?utm_source=reddit&variant=42",
      "https://NamokiMods.com/collections/hands/products/Watch-Hands-MM1000-Black-Finish#reviews",
    ]) {
      expect(normaliseProductUrl(written), written).toBe(expected);
    }
  });

  it("refuses anything that is not one product page, rather than guessing", () => {
    for (const bad of [
      "https://namokimods.com/collections/hands",
      "https://namokimods.com",
      "https://namokimods.com/search?q=mm1000",
      "not a url at all",
      "javascript:alert(1)",
      "",
    ]) {
      expect(normaliseProductUrl(bad), bad).toBeNull();
    }
  });
});

describe("keywords", () => {
  it("keeps model designators, which are the whole basis of a cross-vendor match", () => {
    // A filter on "letters then digits" would remove a vendor SKU and
    // also mm1000/skx007/nh35, which is the wrong trade.
    expect(keywords("H0558 MM1000 Style Hands Set - Polished Black")).toContain("mm1000");
    expect(keywords("NMK960 Sumo SKX007/SRPD Case")).toEqual(expect.arrayContaining(["skx007", "srpd", "sumo"]));
  });

  it("keeps the words that actually identify the part", () => {
    const w = keywords("Watch Hands: MM1000 Black Finish");
    expect(w).toContain("mm1000");
    expect(w).toContain("black");
    // "watch", "hands" and "finish" are noise on a hands listing.
    expect(w).not.toContain("watch");
    expect(w).not.toContain("finish");
  });

  it("scores two vendors' names for one part above two different parts", () => {
    const a = keywords("Watch Hands: MM1000 Black Finish");
    const same = keywords("H0558 MM1000 Style Hands Set - Polished Black");
    const other = keywords("Watch Hands: Snowflake Gold Finish");
    expect(keywordOverlap(a, same)).toBeGreaterThan(keywordOverlap(a, other));
  });
});

describe("colourAgreement", () => {
  it("is unknown when either side is untagged, never a guess", () => {
    expect(colourAgreement([], ["black"])).toBe("unknown");
    expect(colourAgreement(["black"], [])).toBe("unknown");
  });
  it("ignores tag order", () => {
    expect(colourAgreement(["black", "silver-tone"], ["silver-tone", "black"])).toBe("agree");
  });
  it("separates the same model in two finishes", () => {
    expect(colourAgreement(["silver-tone"], ["gold-tone"])).toBe("differ");
  });
});

describe("hex hashes", () => {
  it("round-trips through hex", () => {
    const bits = new Uint8Array(HASH_BITS);
    for (let i = 0; i < bits.length; i++) bits[i] = (i * 7) % 3 === 0 ? 1 : 0;
    expect(hexToBits(bitsToHex(bits))).toEqual(bits);
  });

  it("measures distance in hex exactly as in bits", () => {
    const a = new Uint8Array(HASH_BITS);
    const b = new Uint8Array(HASH_BITS);
    b[0] = 1;
    b[5] = 1;
    b[200] = 1;
    expect(hexDistance(bitsToHex(a), bitsToHex(b))).toBe(hamming(a, b));
    expect(hexDistance(bitsToHex(a), bitsToHex(b))).toBe(3);
  });

  it("returns null rather than a number when a hash is missing or malformed", () => {
    expect(hexDistance(null, "abc")).toBeNull();
    expect(hexDistance("abc", undefined)).toBeNull();
    expect(hexDistance("abc", "abcd")).toBeNull();
    expect(hexDistance("zzzz", "abcd")).toBeNull();
  });
});

describe("phash", () => {
  const flat = (v: number) => new Uint8Array(IMAGE_SIDE * IMAGE_SIDE).fill(v);

  it("is invariant to overall brightness, which is the point of a median threshold", () => {
    const grad = new Uint8Array(IMAGE_SIDE * IMAGE_SIDE);
    const brighter = new Uint8Array(grad.length);
    for (let i = 0; i < grad.length; i++) {
      grad[i] = (i * 3) % 200;
      brighter[i] = Math.min(255, grad[i]! + 40);
    }
    expect(hamming(phash(grad), phash(brighter))).toBe(0);
  });

  it("separates different images", () => {
    const a = new Uint8Array(IMAGE_SIDE * IMAGE_SIDE);
    for (let i = 0; i < a.length; i++) a[i] = (i % IMAGE_SIDE) * 4;
    const b = new Uint8Array(IMAGE_SIDE * IMAGE_SIDE);
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(i / IMAGE_SIDE) * 4;
    expect(hamming(phash(a), phash(b))).toBeGreaterThan(20);
  });

  it("rejects a buffer of the wrong size instead of hashing rubbish", () => {
    expect(() => phash(flat(0).subarray(0, 10))).toThrow();
  });
});

describe("suggestMatches", () => {
  const part = (over: Partial<MatchablePart> & { id: string }): MatchablePart => ({
    name: "Watch Hands: MM1000 Black Finish",
    category: "hands",
    family: "nh3x-hands-standard",
    vendorKey: "namokimods",
    colours: ["black"],
    phash: null,
    ...over,
  });

  it("never suggests another listing from the same vendor", () => {
    const seed = part({ id: "a" });
    const sameVendor = part({ id: "b", name: "Watch Hands: MM1000 Black Lume Finish" });
    expect(suggestMatches([seed], [sameVendor])).toEqual([]);
  });

  it("never suggests across categories", () => {
    const seed = part({ id: "a" });
    const dial = part({ id: "b", vendorKey: "dlwwatches", category: "dial" });
    expect(suggestMatches([seed], [dial])).toEqual([]);
  });

  it("ranks an image match above a wording match", () => {
    const hashA = bitsToHex(new Uint8Array(HASH_BITS));
    const near = new Uint8Array(HASH_BITS);
    near[0] = 1;
    const seed = part({ id: "a", phash: hashA });
    const byImage = part({ id: "img", vendorKey: "dlwwatches", name: "Completely Different Words Here", phash: bitsToHex(near) });
    const byWords = part({ id: "words", vendorKey: "dlwwatches", name: "MM1000 Black Hands Set" });
    const out = suggestMatches([seed], [byWords, byImage]);
    expect(out[0]!.part.id).toBe("img");
    expect(out[0]!.reasons.join(" ")).toContain("images match to 1/256");
  });

  it("says out loud when the colour disagrees, rather than quietly ranking it", () => {
    const seed = part({ id: "a", colours: ["silver-tone"] });
    const gold = part({ id: "b", vendorKey: "dlwwatches", colours: ["gold-tone"], name: "MM1000 Hands Set Polished Gold" });
    const out = suggestMatches([seed], [gold]);
    expect(out[0]!.colour).toBe("differ");
    expect(out[0]!.reasons.some((r) => /DISAGREE/.test(r))).toBe(true);
  });

  it("returns nothing for an empty seed set", () => {
    expect(suggestMatches([], [part({ id: "a" })])).toEqual([]);
  });
});

describe("candidateSource", () => {
  it("marks the pairs both methods agree on, which is the strongest signal available", () => {
    expect(candidateSource(true, true)).toBe("both");
    expect(candidateSource(true, false)).toBe("user-link");
    expect(candidateSource(false, true)).toBe("phash");
  });
});
