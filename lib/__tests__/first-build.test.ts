import { describe, expect, it } from "vitest";
import { evaluateBuild } from "../compat";
import { buildCatalogSlice } from "../compat/__tests__/test-catalog";
import type { Build } from "../compat/types";
import { assemblyPlan } from "../assembly";
import { CASE_COMPONENT, FIRST_BUILD_MAX_PARTS, FIRST_BUILD_STEPS, FIRST_BUILD_STYLES, firstBuildOptions, isHandComponent, suggestFirstBuild } from "../first-build";

describe("isHandComponent", () => {
  it("separates caps and lone hands from sets", () => {
    expect(isHandComponent("Second Hand Cap - Polished Black")).toBe(true);
    expect(isHandComponent("SKX - Seconds Hand - BGW9 Lume")).toBe(true);
    expect(isHandComponent("GMT Hand - Snowflake")).toBe(true);
    expect(isHandComponent("Watch Hands: Baton Black Finish + Red Seconds Hand")).toBe(false);
    expect(isHandComponent("Watch Hands: Syringe Silver")).toBe(false);
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
      for (const { slot } of FIRST_BUILD_STEPS) {
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
      expect(Object.keys(b.parts).sort()).toEqual(FIRST_BUILD_STEPS.map((s) => s.slot).sort());
      expect(evaluateBuild(b, catalog).findings.some((f) => f.severity === "error")).toBe(false);
    }
  });

  it("offers only complete NH35/NH36 movements and complete cases, never components", () => {
    for (const style of FIRST_BUILD_STYLES) {
      const b = suggestFirstBuild(catalog, style);
      for (const o of firstBuildOptions("movement", { parts: { case: b.parts.case } }, catalog, style, 50)) {
        expect(["NH35", "NH36"]).toContain(catalog.parts[o.partId]!.attributes.caliber);
      }
      for (const o of firstBuildOptions("case", { parts: {} }, catalog, style, 50)) {
        expect(o.name, "a case component was offered as a case").not.toMatch(CASE_COMPONENT);
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
