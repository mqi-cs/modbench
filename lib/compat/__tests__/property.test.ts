// Property test, per specs/03-phase-2-compat-engine.md: "for any two
// randomly selected parts from the catalog, evaluateBuild must not throw
// and must return a valid BuildResult. Missing attributes must degrade to
// a warning, never a crash and never a silent pass."
//
// Runs against the REAL catalog, so it fuzzes real attribute shapes
// (including every null and missing field the tagging pipeline actually
// produces) rather than shapes invented here.
import { describe, expect, it } from "vitest";
import { evaluateBuild } from "../index";
import type { Build, CatalogPart, SlotKey } from "../types";
import { buildCatalogSlice } from "./test-catalog";

const catalog = buildCatalogSlice();
const allParts = Object.values(catalog.parts);

// Deterministic PRNG so a failure is reproducible from the seed rather
// than being a one-off that vanishes on re-run.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VALID_STATUSES = new Set(["ok", "ok-with-warnings", "blocked"]);
const VALID_SEVERITIES = new Set(["error", "warning", "info"]);

describe("property: evaluateBuild over random part pairs", () => {
  it("never throws and always returns a valid BuildResult across 1,000 random pairs", () => {
    const rand = mulberry32(20260901);
    expect(allParts.length).toBeGreaterThan(100); // sanity: the catalog actually loaded

    for (let i = 0; i < 1000; i++) {
      const a = allParts[Math.floor(rand() * allParts.length)] as CatalogPart;
      const b = allParts[Math.floor(rand() * allParts.length)] as CatalogPart;
      const build: Build = { parts: {} };
      build.parts[a.slot] = a.id;
      build.parts[b.slot] = b.id; // may overwrite when both share a slot -- that's a real caller state too

      let result;
      try {
        result = evaluateBuild(build, catalog);
      } catch (err) {
        throw new Error(`evaluateBuild threw on iteration ${i} for ${a.name} (${a.slot}) + ${b.name} (${b.slot}): ${String(err)}`);
      }

      expect(VALID_STATUSES.has(result.status), `bad status "${result.status}" at iteration ${i}`).toBe(true);
      expect(Array.isArray(result.findings)).toBe(true);
      expect(Array.isArray(result.requiredTools)).toBe(true);
      expect(Array.isArray(result.requiredAdditions)).toBe(true);
      for (const f of result.findings) {
        expect(VALID_SEVERITIES.has(f.severity), `bad severity "${f.severity}" from ${f.ruleKey}`).toBe(true);
        expect(typeof f.message).toBe("string");
        expect(f.message.length).toBeGreaterThan(0);
        expect(Array.isArray(f.slots)).toBe(true);
      }
      // status must be consistent with the findings it came from
      const hasError = result.findings.some((f) => f.severity === "error");
      const hasWarning = result.findings.some((f) => f.severity === "warning");
      if (hasError) expect(result.status).toBe("blocked");
      else if (hasWarning) expect(result.status).toBe("ok-with-warnings");
      else expect(result.status).toBe("ok");
    }
  });

  it("degrades to a warning rather than a silent pass when a part has no attributes at all", () => {
    // The extreme missing-data case: every attribute absent. No rule may
    // conclude "fine" from this.
    const emptyDial: CatalogPart = { id: "empty-dial", slot: "dial", family: "nh3x-dial-standard", name: "attribute-less dial", attributes: {}, specSource: "family-inferred", confidence: "low" };
    const emptyMovement: CatalogPart = { id: "empty-mv", slot: "movement", family: "nh3x-movement", name: "attribute-less movement", attributes: {}, specSource: "family-inferred", confidence: "low" };
    const slice = { ...catalog, parts: { ...catalog.parts, [emptyDial.id]: emptyDial, [emptyMovement.id]: emptyMovement } };
    const build: Build = { parts: { dial: emptyDial.id, movement: emptyMovement.id } };

    const result = evaluateBuild(build, slice);
    expect(result.status).not.toBe("ok");
    expect(result.findings.some((f) => f.severity === "warning")).toBe(true);
  });

  it("treats inherited object keys as unresolvable rather than as parts", () => {
    // `catalog.parts` is a plain object, so a build referencing
    // "__proto__" or "constructor" used to resolve to something off
    // Object.prototype and hand rules an object that isn't a part.
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const build: Build = { parts: { dial: key } };
      expect(() => evaluateBuild(build, catalog)).not.toThrow();
      const result = evaluateBuild(build, catalog);
      // Nothing should claim to know anything about a non-part.
      expect(result.findings.every((f) => !f.message.includes("[object"))).toBe(true);
    }
  });

  it("handles an empty build and unresolvable part ids without throwing", () => {
    expect(() => evaluateBuild({ parts: {} }, catalog)).not.toThrow();
    const ghost: Build = { parts: { dial: "does-not-exist" as string } as Partial<Record<SlotKey, string>> };
    expect(() => evaluateBuild(ghost, catalog)).not.toThrow();
  });
});
