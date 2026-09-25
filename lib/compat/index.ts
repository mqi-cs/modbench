import type { Build, BuildResult, CatalogSlice, Finding, Rule } from "./types";
import { deriveTools } from "./tools";
import { familyPlatform } from "./platform";
import { partById } from "./types";

import { movementCaseFit } from "./rules/movement-case-fit";
import { dialMovementFeet } from "./rules/dial-movement-feet";
import { dialCaseDiameter } from "./rules/dial-case-diameter";
import { nh34HandStack } from "./rules/nh34-hand-stack";
import { dateWindowAlignment } from "./rules/date-window-alignment";
import { dayWindowPresence } from "./rules/day-window-presence";
import { insertCaseFit } from "./rules/insert-case-fit";
import { crystalCaseFit } from "./rules/crystal-case-fit";
import { chapterRingFit } from "./rules/chapter-ring-fit";
import { handStackClearance } from "./rules/hand-stack-clearance";
import { familyException } from "./rules/family-exception";
import { unverifiedPart } from "./rules/unverified-part";
import { lumeMismatch } from "./rules/lume-mismatch";
import { stockAvailability } from "./rules/stock-availability";
import { multiVendorShipping } from "./rules/multi-vendor-shipping";
import { bezelCaseFit } from "./rules/bezel-case-fit";
import { crownCaseFit } from "./rules/crown-case-fit";
import { strapFit } from "./rules/strap-fit";
import { insertCrystalProfileFit } from "./rules/insert-crystal-profile-fit";
import { dialCaseModelExclusion } from "./rules/dial-case-model-exclusion";
import { requiresChapterRing } from "./rules/requires-chapter-ring";
import { braceletVendorScope } from "./rules/bracelet-vendor-scope";

// Registration order is cosmetic, not load-bearing -- rules are
// order-independent by construction (each reads only Build/CatalogSlice,
// never another rule's output), per
// specs/03-phase-2-compat-engine.md's constraint. 15 from the original
// table, 3 new (bezel-case-fit, crown-case-fit, strap-fit) for the bezel
// category and case-shape-dependent strap families that table didn't
// cover -- see the rule files' own comments for why each was needed.
export const RULES: Rule[] = [
  movementCaseFit,
  dialMovementFeet,
  dialCaseDiameter,
  nh34HandStack,
  dateWindowAlignment,
  dayWindowPresence,
  insertCaseFit,
  crystalCaseFit,
  chapterRingFit,
  handStackClearance,
  familyException,
  unverifiedPart,
  lumeMismatch,
  stockAvailability,
  multiVendorShipping,
  bezelCaseFit,
  crownCaseFit,
  strapFit,
  insertCrystalProfileFit,
  dialCaseModelExclusion,
  requiresChapterRing,
  braceletVendorScope,
];

// The chapter-ring family a case implies, used to tell the caller WHICH
// chapter ring to add rather than just that one is missing. Falls back to
// the case's own platform prefix, which is how every case-shape family in
// this catalog is named (see lib/compat/platform.ts).
function caseFamilyFor(build: Build, catalog: CatalogSlice): string {
  const caseId = build.parts.case;
  const caseP = caseId ? partById(catalog, caseId) : null;
  if (!caseP) return "chapter-ring";
  const platform = familyPlatform(caseP.family);
  return platform ? `${platform}-chapter-ring` : "chapter-ring";
}

function statusFromFindings(findings: Finding[]): BuildResult["status"] {
  if (findings.some((f) => f.severity === "error")) return "blocked";
  if (findings.some((f) => f.severity === "warning")) return "ok-with-warnings";
  return "ok";
}

// The one entry point lib/compat exports. Pure: no DB, no network, no
// LLM, no reading another rule's output. A rule that throws is a bug in
// that rule, not something evaluateBuild tries to paper over -- letting
// it propagate is what the property test (lib/compat/__tests__/property.test.ts)
// exists to catch during development, before it ever reaches a real build.
export function evaluateBuild(build: Build, catalog: CatalogSlice): BuildResult {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    findings.push(...rule.evaluate(build, catalog));
  }

  // requiredAdditions is derived from findings that carry a `fix` naming
  // a part the build is missing, rather than being computed separately --
  // that way a rule states its requirement once and can't drift out of
  // sync with the addition it implies. Currently only
  // requires-chapter-ring produces one (26 luciusatelier cases state a
  // chapter ring is "mandatory and never included"); no case in this
  // catalog has evidenced requiresSpacerFor data, so no spacer additions
  // are emitted -- per Amendment A that stays empty rather than guessed.
  const requiredAdditions: BuildResult["requiredAdditions"] = findings
    .filter((f) => f.ruleKey === "requires-chapter-ring")
    .map(() => ({
      slot: "chapterRing" as const,
      family: caseFamilyFor(build, catalog),
      reason: "This case does not seat the dial at the right height without a chapter ring, and does not include one.",
    }));

  return {
    findings,
    requiredAdditions,
    requiredTools: deriveTools(build, catalog),
    status: statusFromFindings(findings),
  };
}

export type { Build, BuildResult, CatalogSlice, CatalogPart, CatalogFamilyException, CatalogListing, Finding, PartRef, Rule, Severity, SlotKey, ToolKey } from "./types";
export { getToolCostRange } from "./tools";
export { familyPlatform, platformsMatch, checkCaseShapeFit } from "./platform";
