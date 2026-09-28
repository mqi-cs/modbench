import { describe, expect, it } from "vitest";
import { evaluateBuild } from "../compat";
import { buildCatalogSlice } from "../compat/__tests__/test-catalog";
import type { Build } from "../compat/types";
import { assemblyPlan } from "../assembly";
import { FIRST_BUILD_MAX_PARTS, FIRST_BUILD_STYLES, firstBuildOptions, firstBuildSteps, isCaseComponent, isHandComponent, nextFirstBuildStep, suggestFirstBuild } from "../first-build";
import { isCaseback } from "../listing-text";
import { readFileSync } from "node:fs";
import { resolveScene, type RenderIndex } from "../render/scene";
import { printsFor } from "../render/prints";

describe("isHandComponent", () => {
  it("separates caps and lone hands from sets", () => {
    expect(isHandComponent("Second Hand Cap - Polished Black")).toBe(true);
    expect(isHandComponent("SKX - Seconds Hand - BGW9 Lume")).toBe(true);
    expect(isHandComponent("GMT Hand - Snowflake")).toBe(true);
    expect(isHandComponent("Watch Hands: Baton Black Finish + Red Seconds Hand")).toBe(false);
    expect(isHandComponent("Watch Hands: Syringe Silver")).toBe(false);
  });
});

describe("isCaseComponent / isCaseback", () => {
  it("keeps a case that lists its caseback or bezel, and drops the caseback sold alone", () => {
    for (const n of ["Case - SKX007 Sub - Polished Steel (With Case Back)", "NMK917 Pilot SRPE Watch Case Bundle w Coil Bezel: Polished Finish", "RC1427 SKX007 Replacement Case - Sandblasted Titanium - MM Bezel"]) {
      expect(isCaseComponent(n), n).toBe(false);
      expect(isCaseback(n), n).toBe(false);
    }
    for (const n of ["SKX Slim Caseback: Gold Finish", "C0367 SKX007 Sterile Case Back - NH Movement"]) {
      expect(isCaseComponent(n), n).toBe(true);
      expect(isCaseback(n), n).toBe(true);
    }
    expect(isCaseComponent("SKX007 Crystal Gasket")).toBe(true);
  });
});
import { deriveTools } from "../compat/tools";

const catalog = buildCatalogSlice();

describe("first-build mode, over the live catalog", () => {
  // Pass measure: every first-build suggestion has zero errors and at most
  // FIRST_BUILD_MAX_PARTS parts (target set before building: 6).
  for (const style of FIRST_BUILD_STYLES) {
    it(`${style.id}: every option offered at every step has zero errors`, () => {
      const build: Build = { parts: {} };
      for (let step = nextFirstBuildStep(build, catalog); step; step = nextFirstBuildStep(build, catalog)) {
        const { slot } = step;
        const options = firstBuildOptions(slot, build, catalog, style);
        expect(options.length, `no options for ${slot}`).toBeGreaterThan(0);
        for (const o of options) {
          const r = evaluateBuild({ parts: { ...build.parts, [slot]: o.partId } }, catalog);
          expect(r.findings.filter((f) => f.severity === "error"), `${slot}: ${o.name}`).toEqual([]);
        }
        build.parts[slot] = options[0]!.partId;
      }
      expect(evaluateBuild(build, catalog).status).not.toBe("blocked");
      expect(Object.keys(build.parts).length).toBeLessThanOrEqual(FIRST_BUILD_MAX_PARTS);
    });
  }

  it("the default suggestion for each style is complete and unblocked", () => {
    for (const style of FIRST_BUILD_STYLES) {
      const b = suggestFirstBuild(catalog, style);
      expect(Object.keys(b.parts).sort()).toEqual(firstBuildSteps(b, catalog).map((s) => s.slot).sort());
      expect(evaluateBuild(b, catalog).findings.some((f) => f.severity === "error")).toBe(false);
      // The limit is inclusive: the insert step takes a build to exactly 6.
      expect(Object.keys(b.parts)).toHaveLength(FIRST_BUILD_MAX_PARTS);
    }
  });

  it("asks for a chapter ring only when the case states it needs one, and then offers dials again", () => {
    // bad-022's case: "Chapter Rings SKX013-spec (required, sold separately)".
    const ringCase = Object.values(catalog.parts).find((p) => p.name === "SKX013 Watch Case - 38mm (DLC BLACK EDITION) [NH34-Ready]")!;
    expect(ringCase.attributes.requiresChapterRing).toBe(true);
    const style = FIRST_BUILD_STYLES[3]!;
    const build: Build = { parts: { case: ringCase.id } };
    expect(firstBuildSteps(build, catalog).map((s) => s.slot)).toContain("chapterRing");
    expect(firstBuildSteps({ parts: { case: suggestFirstBuild(catalog, style).parts.case } }, catalog).map((s) => s.slot)).not.toContain("chapterRing");
    for (let step = nextFirstBuildStep(build, catalog); step; step = nextFirstBuildStep(build, catalog)) {
      const top = firstBuildOptions(step.slot, build, catalog, style)[0];
      expect(top, `no options for ${step.slot}`).toBeDefined();
      build.parts[step.slot] = top!.partId;
    }
    expect(evaluateBuild(build, catalog).findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(Object.keys(build.parts)).toHaveLength(FIRST_BUILD_MAX_PARTS + 1); // the ring is the 7th part
  });

  // WS2c follow-up, Step 2: every prefix of the guided order, on the SKX
  // 42.5 case in both views, draws everything the case layer holds out --
  // so no holdout hole and no ring-less dial rim at any step.
  it("draws the dial, ring and insert at every step of the order on the SKX 42.5 case", () => {
    const index = JSON.parse(readFileSync("public/render/layers/index.json", "utf-8")) as RenderIndex;
    const sumo = Object.values(catalog.parts).find((p) => p.name === "NMK960 Sumo SKX007/SRPD Case: Steel Finish")!;
    expect(index.parts[sumo.id]?.key).toBe("case:round/42.5/22/28.5#steel");
    const attributes = (id: string) => catalog.parts[id]?.attributes;
    const build: Build = { parts: { case: sumo.id } };
    const prefixes: Build[] = [{ parts: { ...build.parts } }];
    for (let step = nextFirstBuildStep(build, catalog); step; step = nextFirstBuildStep(build, catalog)) {
      build.parts[step.slot] = firstBuildOptions(step.slot, build, catalog, FIRST_BUILD_STYLES[0]!)[0]!.partId;
      prefixes.push({ parts: { ...build.parts } });
    }
    expect(prefixes.map((p) => Object.keys(p.parts).length)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const { parts } of prefixes) {
      for (const view of ["hero", "top"] as const) {
        const s = resolveScene({ index, view, parts, prints: printsFor(parts, attributes, () => true), caseAttributes: attributes(sumo.id) });
        expect(s.ok, JSON.stringify(parts)).toBe(true);
        if (!s.ok) continue;
        const stems = new Set(s.layers.map((l) => (l.kind === "surface" ? l.stem : "")));
        for (const layer of ["dial", "ring", "insert"]) {
          expect([...stems].some((st) => Object.entries(index.jobs).some(([id, j]) => j.stem === st && id.startsWith(`${view}/surface/${layer}/case:round/42.5/`))), `${view} ${layer} ${JSON.stringify(parts)}`).toBe(true);
        }
      }
    }
  });

  it("offers only complete NH35/NH36 movements and complete cases, never components", () => {
    for (const style of FIRST_BUILD_STYLES) {
      const b = suggestFirstBuild(catalog, style);
      for (const o of firstBuildOptions("movement", { parts: { case: b.parts.case } }, catalog, style, 50)) {
        expect(["NH35", "NH36"]).toContain(catalog.parts[o.partId]!.attributes.caliber);
      }
      for (const o of firstBuildOptions("case", { parts: {} }, catalog, style, 50)) {
        expect(isCaseComponent(o.name), `a case component was offered as a case: ${o.name}`).toBe(false);
      }
      for (const o of firstBuildOptions("hands", { parts: { case: b.parts.case, movement: b.parts.movement } }, catalog, style, 50)) {
        expect(isHandComponent(o.name), `a hand component was offered as a set: ${o.name}`).toBe(false);
        expect(o.name, "GMT or chronograph hands on an NH35/NH36").not.toMatch(/\bgmt\b|\bnh34\b|\bchrono|\bvk\d*\b/i);
      }
    }
  });

  it("ranks a bracelet made for the chosen case's platform first, when one fits", () => {
    const b = suggestFirstBuild(catalog, FIRST_BUILD_STYLES[3]!);
    const straps = firstBuildOptions("strap", { parts: { ...b.parts, strap: undefined } }, catalog, FIRST_BUILD_STYLES[3]!);
    const firstUnmatched = straps.findIndex((s) => !s.matchedBracelet);
    const lastMatched = straps.map((s) => Boolean(s.matchedBracelet)).lastIndexOf(true);
    if (lastMatched >= 0 && firstUnmatched >= 0) expect(lastMatched).toBeLessThan(firstUnmatched);
  });
});

describe("assembly plan", () => {
  const build = suggestFirstBuild(catalog, FIRST_BUILD_STYLES[0]!);
  const plan = assemblyPlan(build, catalog, { grandTotalMinorLow: 10000, grandTotalMinorHigh: 12000 });

  it("flags stem cutting as irreversible whenever a movement goes into a case", () => {
    const stem = plan.steps.find((s) => s.id === "stem");
    expect(stem?.irreversible).toBe(true);
    // Nothing else in a standard build is irreversible; if that changes,
    // this list is the place to say so.
    expect(plan.steps.filter((s) => s.irreversible).map((s) => s.id)).toEqual(["stem"]);
  });

  it("has no stem step without both a movement and a case", () => {
    const { case: _c, ...rest } = build.parts;
    expect(assemblyPlan({ parts: rest }, catalog).steps.some((s) => s.id === "stem")).toBe(false);
  });

  it("orders the steps as a watch goes together", () => {
    const ids = plan.steps.map((s) => s.id);
    const order = ["workspace", "dial", "hands", "case-movement", "stem", "caseback", "strap"];
    expect(ids.filter((i) => order.includes(i))).toEqual(order.filter((i) => ids.includes(i)));
    expect(ids.indexOf("hands")).toBeLessThan(ids.indexOf("case-movement"));
  });

  it("every tool a step names is one deriveTools returns, and the costs add up", () => {
    const derived = new Set(deriveTools(build, catalog));
    for (const s of plan.steps) for (const t of s.tools) expect(derived.has(t), `${s.id}: ${t}`).toBe(true);
    expect(plan.tools.sort()).toEqual([...derived].sort());
    expect(plan.toolCostGbp.min).toBeGreaterThan(0);
    expect(plan.toolCostGbp.max).toBeGreaterThanOrEqual(plan.toolCostGbp.min);
    expect(plan.totalMinor).toEqual({ low: 10000, high: 12000 });
  });

  it("scores difficulty from what the build involves, 1 to 5", () => {
    expect(plan.difficulty).toBeGreaterThanOrEqual(1);
    expect(plan.difficulty).toBeLessThanOrEqual(5);
    expect(assemblyPlan({ parts: {} }, catalog).difficulty).toBe(1);
    expect(plan.difficultyReasons).toContain("hands");
  });

  it("is plain data, so it can be exported as a work order", () => {
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});
