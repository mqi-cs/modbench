// Pass measure 6: "evaluateBuild on a full 6-slot build completes in under
// 10ms, so the UI can call it on every keystroke."
import { describe, expect, it } from "vitest";
import { evaluateBuild } from "../index";
import type { Build, SlotKey } from "../types";
import { buildCatalogSlice } from "./test-catalog";

const catalog = buildCatalogSlice();

function firstPartInSlot(slot: SlotKey): string | undefined {
  return Object.values(catalog.parts).find((p) => p.slot === slot)?.id;
}

describe("performance", () => {
  it("evaluates a full build in well under 10ms", () => {
    // Every slot the catalog can fill, which is a harder case than the
    // 6-slot build the pass measure names.
    const slots: SlotKey[] = ["movement", "case", "dial", "hands", "bezelInsert", "bezel", "crystal", "chapterRing", "crown", "strap"];
    const build: Build = { parts: {} };
    for (const slot of slots) {
      const id = firstPartInSlot(slot);
      if (id) build.parts[slot] = id;
    }
    expect(Object.keys(build.parts).length).toBeGreaterThanOrEqual(6);

    evaluateBuild(build, catalog); // warm up, so we time steady-state not first-call JIT

    const runs = 200;
    const start = performance.now();
    for (let i = 0; i < runs; i++) evaluateBuild(build, catalog);
    const perCall = (performance.now() - start) / runs;

    expect(perCall, `evaluateBuild averaged ${perCall.toFixed(3)}ms per call`).toBeLessThan(10);
  });
});
