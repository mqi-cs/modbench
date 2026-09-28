import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveScene, type RenderIndex } from "../../render/scene";
import { SLOT_PARAM } from "../../../components/build/url-state";
import type { SlotKey } from "../../compat";

// A submitted (byo_) part is never in the render index, so the 3D preview
// can't draw it. Checked against the committed index, slot by slot: the
// picture must say so rather than silently leave the part out.
const index = JSON.parse(readFileSync("public/render/layers/index.json", "utf8")) as RenderIndex;
const realCase = Object.keys(index.parts).find((id) => index.parts[id]!.key.startsWith("case:round/42.5/"))!;
const slots = Object.keys(SLOT_PARAM) as SlotKey[];

describe("3D preview with a bring-your-own part", () => {
  for (const slot of slots.filter((s) => s !== "case" && s !== "movement")) {
    it(`labels a submitted ${slot} as not previewed, in both views`, () => {
      for (const view of ["hero", "top"] as const) {
        const s = resolveScene({ index, view, parts: { case: realCase, [slot]: `byo_${slot}` }, prints: {} });
        expect(s.ok).toBe(true);
        if (!s.ok) return;
        expect(s.labels.filter((l) => l.endsWith(" not previewed: not in the render index"))).toHaveLength(1);
      }
    });
  }

  it("falls back to the diagram, with the reason, for a submitted case", () => {
    expect(resolveScene({ index, view: "hero", parts: { case: "byo_case" }, prints: {} })).toEqual({ ok: false, reason: "case not in the render index" });
  });

  it("draws no movement for anyone, submitted or not: it sits inside the case", () => {
    const s = resolveScene({ index, view: "hero", parts: { case: realCase, movement: "byo_movement" }, prints: {} });
    expect(s.ok && s.labels.some((l) => l.includes("not previewed"))).toBe(false);
  });
});
