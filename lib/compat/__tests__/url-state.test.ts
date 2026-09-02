// Pass measure 5: "copy the URL, open in a new tab, get the identical
// build" -- which is a round-trip property, so it's tested as one against
// the real catalog rather than only clicked through by hand.
import { describe, expect, it } from "vitest";
import { buildFromParams, droppedSlots, paramsFromBuild, SLOT_PARAM } from "../../../components/build/url-state";
import { buildCatalogSlice } from "./test-catalog";
import type { Build, SlotKey } from "../types";

const catalog = buildCatalogSlice();
const parts = catalog.parts;

function someIdIn(slot: SlotKey): string {
  const p = Object.values(parts).find((x) => x.slot === slot);
  if (!p) throw new Error(`no approved part in slot ${slot}`);
  return p.id;
}

describe("URL round-trip", () => {
  it("survives a full build unchanged", () => {
    const original: Build = {
      parts: {
        movement: someIdIn("movement"),
        case: someIdIn("case"),
        dial: someIdIn("dial"),
        hands: someIdIn("hands"),
        bezelInsert: someIdIn("bezelInsert"),
        crystal: someIdIn("crystal"),
      },
    };
    const restored = buildFromParams(new URLSearchParams(paramsFromBuild(original)), parts);
    expect(restored).toEqual(original);
  });

  it("survives every slot at once", () => {
    const original: Build = { parts: {} };
    for (const slot of Object.keys(SLOT_PARAM) as SlotKey[]) original.parts[slot] = someIdIn(slot);
    const restored = buildFromParams(new URLSearchParams(paramsFromBuild(original)), parts);
    expect(restored).toEqual(original);
  });

  it("round-trips an empty build to an empty query string", () => {
    expect(paramsFromBuild({ parts: {} })).toBe("");
    expect(buildFromParams(new URLSearchParams(""), parts)).toEqual({ parts: {} });
  });

  it("drops an unknown part id instead of crashing, and reports it", () => {
    const params = new URLSearchParams("movement=doesNotExist123");
    expect(buildFromParams(params, parts)).toEqual({ parts: {} });
    expect(droppedSlots(params, parts)).toEqual(["movement"]);
  });

  it("rejects a malformed id before using it as a lookup key", () => {
    // Zod gate: path traversal, prototype pollution attempts, oversized
    // input. None of these should reach the catalog lookup.
    for (const bad of ["../../etc/passwd", "__proto__", "a b c", "x".repeat(200), "<script>"]) {
      const params = new URLSearchParams([["movement", bad]]);
      expect(buildFromParams(params, parts)).toEqual({ parts: {} });
      expect(droppedSlots(params, parts)).toEqual(["movement"]);
    }
  });

  it("keeps the valid slots when only one is bad", () => {
    const goodCase = someIdIn("case");
    const params = new URLSearchParams([
      ["movement", "notARealId"],
      ["case", goodCase],
    ]);
    expect(buildFromParams(params, parts)).toEqual({ parts: { case: goodCase } });
    expect(droppedSlots(params, parts)).toEqual(["movement"]);
  });

  it("ignores unrelated query params", () => {
    const id = someIdIn("dial");
    const params = new URLSearchParams([
      ["dial", id],
      ["utm_source", "reddit"],
      ["ref", "abc"],
    ]);
    expect(buildFromParams(params, parts)).toEqual({ parts: { dial: id } });
    expect(droppedSlots(params, parts)).toEqual([]);
  });

  it("reports nothing dropped when a slot is simply absent", () => {
    expect(droppedSlots(new URLSearchParams(""), parts)).toEqual([]);
  });
});
