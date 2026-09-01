import type { Build, BuildResult, CatalogSlice, Finding, Rule } from "./types";
import { deriveTools } from "./tools";

import { movementCaseFit } from "./rules/movement-case-fit";
import { dialMovementFeet } from "./rules/dial-movement-feet";
import { dialCaseDiameter } from "./rules/dial-case-diameter";
import { handsMovementBore } from "./rules/hands-movement-bore";
import { dateWindowAlignment } from "./rules/date-window-alignment";
import { dayWindowPresence } from "./rules/day-window-presence";
import { insertCaseDiameter } from "./rules/insert-case-diameter";
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
  handsMovementBore,
  dateWindowAlignment,
  dayWindowPresence,
  insertCaseDiameter,
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
];

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

  return {
    findings,
    // No case in this catalog has real, evidenced requiresSpacerFor data
    // yet (scripts/backfill-attributes.ts's CASE_DEFAULTS leaves every
    // case's requiresSpacerFor at [] -- no spacer requirement has been
    // independently confirmed for any family this session). Per Amendment
    // A, this stays empty rather than guessed at; it becomes real the
    // moment real evidence is gathered and backfilled, with no change
    // needed here.
    requiredAdditions: [],
    requiredTools: deriveTools(build, catalog),
    status: statusFromFindings(findings),
  };
}

export type { Build, BuildResult, CatalogSlice, CatalogPart, CatalogFamilyException, CatalogListing, Finding, PartRef, Rule, Severity, SlotKey, ToolKey } from "./types";
export { getToolCostRange } from "./tools";
export { familyPlatform, platformsMatch, checkCaseShapeFit } from "./platform";
