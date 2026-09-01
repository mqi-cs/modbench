import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// NEW 2026-09-01, from the same vendor-warning-text mining pass as
// insert-crystal-profile-fit.
//
// Some dials name case models they will NOT fit, in their own listing:
//   "Fit Models SNK803, SNK805, SNK807, SNK809, SKX007, SKX009, SKX011 and
//    more / Not compatible with SKX013, SKX015 and SKX017"
//   -- luciusatelier, SEIKO SNKK87 / SNKL15 / SNKL23 dial listings
//
// Nothing else in the engine can see this. All three dials are tagged
// nh3x-dial-standard, a MOVEMENT-family family that carries no case-model
// constraint at all by design (dials mount to the movement, not the case),
// so family/platform matching correctly ignores the case -- and would pass
// this pairing silently. Dial diameter can't catch it either: these are
// ordinary 28.5mm dials, the same as every other dial in the catalog. The
// exclusion exists because of the case's internal chapter-ring/aperture
// geometry, which no dimension in this schema captures.
//
// So this rule exists to carry the vendor's own stated exclusion through
// to the build, and nothing more. It errors only on an explicit,
// vendor-stated exclusion -- never on absence of a compatibility claim,
// which would turn "not mentioned" into "not compatible" and block most of
// the catalog.
export const dialCaseModelExclusion: Rule = {
  key: "dial-case-model-exclusion",
  appliesTo: ["dial", "case"],
  evaluate(build, catalog): Finding[] {
    const dial = getPart(build, catalog, "dial");
    const caseP = getPart(build, catalog, "case");
    if (!dial || !caseP) return [];

    const excluded = dial.attributes.incompatibleCaseFamilies as string[] | null | undefined;
    if (!Array.isArray(excluded) || excluded.length === 0) return []; // no exclusion stated -- not the same as "confirmed compatible", but nothing to report

    if (excluded.includes(caseP.family)) {
      return [
        {
          ruleKey: "dial-case-model-exclusion",
          severity: "error",
          message: `"${dial.name}"'s own listing states it does not fit this case line -- "${caseP.name}" is exactly the model the vendor rules out. It's a standard 28.5mm dial and it will sit on the movement fine, so nothing about its size or feet gives this away; the incompatibility is in how this particular case's chapter ring and aperture are shaped around the dial. This is the vendor's own warning, not an inference from the part's family.`,
          slots: ["dial", "case"],
          fix: "Use a dial the vendor lists as fitting this case line, or a case from a line this dial's listing names as compatible.",
        },
      ];
    }

    return [];
  },
};
