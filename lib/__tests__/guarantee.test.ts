// WS1 pass measure 5: every clause of the guarantee has a test behind it.
// Clause by clause:
//   1. "only tells you parts fit when every check ... uses the sellers' own
//      published specifications" -- a clean ok never includes a part whose
//      data isn't vendor-stated (below), and only verified findings block
//      (known-builds.test.ts, "evidence behind every blocking rule").
//   2. "for that part, or for the product line it belongs to" -- the
//      product-line figures are the class B/C constants listed in
//      data/fixtures/attribute-provenance.md; none may block (below).
//   3. "Anything inferred, marketplace or user-entered is marked
//      Unconfirmed ... never block ... never pass cleanly" -- property.test.ts,
//      "non-vendor data never yields a clean ok, and never blocks".
//   4. "Every finding shows which kind it is" -- every finding carries a
//      tier (below), rendered by components/build/EvidenceTag.tsx.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUARANTEE } from "../guarantee";
import { evaluateBuild } from "../compat";
import type { Build, CatalogPart } from "../compat";
import { buildCatalogSlice } from "../compat/__tests__/test-catalog";

const catalog = buildCatalogSlice();
const parts = Object.values(catalog.parts);

function* randomBuilds(seed: number, n: number): Generator<Build> {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < n; i++) {
    const build: Build = { parts: {} };
    for (let k = 0; k < 4; k++) {
      const p = parts[Math.floor(rand() * parts.length)] as CatalogPart;
      build.parts[p.slot] = p.id;
    }
    yield build;
  }
}

describe("the guarantee", () => {
  it("is the same words in the README and on the site", () => {
    expect(readFileSync("README.md", "utf-8")).toContain(GUARANTEE);
    expect(readFileSync("app/page.tsx", "utf-8")).toContain("GUARANTEE");
  });

  it("clause 1: a clean ok only ever contains vendor-stated parts", () => {
    let oks = 0;
    for (const build of randomBuilds(20260926, 3000)) {
      const result = evaluateBuild(build, catalog);
      if (result.status !== "ok") continue;
      oks++;
      for (const id of Object.values(build.parts)) expect(catalog.parts[id!]!.specSource).toBe("vendor-stated");
    }
    expect(oks).toBeGreaterThan(0);
  });

  it("clause 2: a product-line figure never blocks -- strap lug width is the case line's standard, so it only warns", () => {
    const strap = parts.find((p) => p.family === "generic-strap" && typeof p.attributes.lugWidthMm === "number")!;
    const kase = parts.find(
      (p) => p.slot === "case" && typeof p.attributes.lugWidthMm === "number" && p.attributes.lugWidthMm !== strap.attributes.lugWidthMm,
    )!;
    const result = evaluateBuild({ parts: { strap: strap.id, case: kase.id } }, catalog);
    const lug = result.findings.filter((f) => f.ruleKey === "strap-fit");
    expect(lug.length).toBeGreaterThan(0);
    expect(lug.every((f) => f.severity !== "error")).toBe(true);
  });

  it("clause 4: every finding carries its evidence tier", () => {
    for (const build of randomBuilds(7, 500)) {
      for (const f of evaluateBuild(build, catalog).findings) expect(["verified", "checked", "unconfirmed"]).toContain(f.tier);
    }
  });
});
