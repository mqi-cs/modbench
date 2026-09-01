import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateBuild } from "../index";
import { buildCatalogSlice, resolveBuild } from "./test-catalog";

interface Fixture {
  id: string;
  expected: "not-blocked" | "blocked";
  parts: Record<string, string | null>;
}

const fixtures = JSON.parse(readFileSync("data/fixtures/known-builds.json", "utf-8")) as {
  regressionFixtures: Fixture[];
  badBuilds: Fixture[];
};

const catalog = buildCatalogSlice();

// regressionFixtures (formerly "goodBuilds") test INTERNAL CONSISTENCY,
// not verified reality -- each is one real anchor product surrounded by
// four family-consistent parts chosen to exercise the engine, not a build
// someone confirmed working. They catch regressions; they are not evidence
// that a combination has been built. See 03-phase-2-compat-engine.md.
describe("regression fixtures", () => {
  it.each(fixtures.regressionFixtures)("$id is not blocked", (fixture) => {
    const build = resolveBuild(fixture.parts, catalog);
    const result = evaluateBuild(build, catalog);
    expect(result.status, JSON.stringify(result.findings, null, 2)).not.toBe("blocked");
  });

});

// badBuilds are the zero-false-positive evidence, and the only fixtures
// that test the claim that matters. Every one must trace to vendor text
// stating the incompatibility about these specific parts.
describe("bad builds", () => {
  it.each(fixtures.badBuilds)("$id is blocked", (fixture) => {
    const build = resolveBuild(fixture.parts, catalog);
    const result = evaluateBuild(build, catalog);
    expect(result.status).toBe("blocked");
    const errors = result.findings.filter((f) => f.severity === "error");
    expect(errors.length, "a blocked build must have at least one error finding").toBeGreaterThan(0);
  });
});
