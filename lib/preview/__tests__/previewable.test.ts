import { describe, expect, it } from "vitest";
import { decodePreviewable, encodePreviewable } from "../previewable";

const ids = Array.from({ length: 300 }, (_, i) => `part-${String(i).padStart(3, "0")}`);

describe("previewable bitmask", () => {
  it("round-trips an arbitrary subset", () => {
    const ready = ids.filter((_, i) => i % 7 === 0 || i % 11 === 3);
    expect([...decodePreviewable(ids, encodePreviewable(ids, ready))].sort()).toEqual([...ready].sort());
  });

  it("round-trips the empty and full sets", () => {
    expect(decodePreviewable(ids, encodePreviewable(ids, [])).size).toBe(0);
    expect(decodePreviewable(ids, encodePreviewable(ids, ids)).size).toBe(ids.length);
  });

  it("does not depend on the order ids are given in", () => {
    const shuffled = [...ids].reverse();
    const ready = [ids[0]!, ids[42]!, ids[299]!];
    expect(encodePreviewable(shuffled, ready)).toBe(encodePreviewable(ids, ready));
    expect([...decodePreviewable(shuffled, encodePreviewable(ids, ready))].sort()).toEqual([...ready].sort());
  });

  it("reads a truncated or empty mask as 'no asset', never as 'asset exists'", () => {
    // Failing safe matters here: a false positive draws a layer that then
    // silently fails to paint, which is exactly what the placeholder path
    // exists to prevent.
    expect(decodePreviewable(ids, "").size).toBe(0);
    const full = encodePreviewable(ids, ids);
    const truncated = full.slice(0, 8);
    expect(decodePreviewable(ids, truncated).size).toBeLessThan(ids.length);
  });

  it("is dramatically smaller than the list it replaces", () => {
    const ready = ids.filter((_, i) => i % 3 === 0);
    expect(encodePreviewable(ids, ready).length).toBeLessThan(JSON.stringify(ready).length / 10);
  });
});
