import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES, VERIFIED_RULES, evaluateBuild } from "../index";
import { withEvidence } from "../evidence";
import { buildCatalogSlice, resolveBuild } from "./test-catalog";

interface Fixture {
  id: string;
  expected: "not-blocked" | "blocked";
  parts: Record<string, string | null>;
  sourceQuote?: string;
  evidences?: string[];
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

// WS1 step 4: a rule may block only if a real bad build, quoted from the
// seller, stands behind it -- and every rule that stands behind a quoted
// bad build is allowed to block. VERIFIED_RULES and the fixtures must agree.
describe("evidence behind every blocking rule", () => {
  const quoted = fixtures.badBuilds.filter((f) => f.sourceQuote);

  it("every fixture that claims to evidence a rule quotes its source", () => {
    const unquoted = fixtures.badBuilds.filter((f) => f.evidences?.length && !f.sourceQuote).map((f) => f.id);
    expect(unquoted).toEqual([]);
  });

  it.each(quoted.filter((f) => f.evidences?.length))("$id is blocked by each rule it evidences", (fixture) => {
    const build = resolveBuild(fixture.parts, catalog);
    for (const key of fixture.evidences!) {
      const rule = RULES.find((r) => r.key === key);
      expect(rule, `unknown rule ${key}`).toBeDefined();
      const findings = rule!.evaluate(build, catalog).map((f) => withEvidence(rule!, f, build, catalog));
      expect(findings.some((f) => f.severity === "error"), `${key} does not block ${fixture.id}`).toBe(true);
    }
  });

  it("VERIFIED_RULES is exactly the set of rules with a quoted fixture", () => {
    const evidenced = new Set(quoted.flatMap((f) => f.evidences ?? []));
    expect([...VERIFIED_RULES].sort()).toEqual([...evidenced].sort());
  });

  it("only a verified finding ever blocks", () => {
    const tiers = fixtures.badBuilds.flatMap((f) =>
      evaluateBuild(resolveBuild(f.parts, catalog), catalog).findings.filter((x) => x.severity === "error").map((x) => x.tier),
    );
    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers.every((tier) => tier === "verified")).toBe(true);
  });
});
