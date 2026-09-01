import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { checkCaseShapeFit } from "../platform";

// NEW pre-Phase-2 (2026-09-01): `crown` has no rule in the original
// 15-rule table -- one of the 14 new families added while clearing the
// Phase 1 tagging backlog. A crown threads into the case's own crown
// tube, so this is the same case-shape question as the other case-mounted
// parts. Note ssk-gmt-crown is a real, documented exception to plain
// platform matching (its own family_exceptions row: fits both SRPD/SKX007
// and SSK/Seiko-5-GMT builds, since those two case lines share the same
// crown tube size) -- the family-exception rule surfaces that row's
// message directly when this crown is selected, alongside whatever this
// rule concludes from platform matching alone. No known-builds.json
// fixture currently exercises an ssk-gmt-tagged part, so this asymmetry
// (this rule flagging a mismatch a human-documented exception says is
// fine) doesn't affect any pass measure; it's conservative rather than
// wrong -- see data/fixtures/catalog-gaps.md.
export const crownCaseFit: Rule = {
  key: "crown-case-fit",
  appliesTo: ["crown", "case"],
  evaluate(build, catalog): Finding[] {
    const crown = getPart(build, catalog, "crown");
    const caseP = getPart(build, catalog, "case");
    if (!crown || !caseP) return [];

    const fit = checkCaseShapeFit(caseP.family, crown.family);
    if (fit.kind === "mismatch") {
      return [
        {
          ruleKey: "crown-case-fit",
          severity: "error",
          message: `"${crown.name}" is threaded for the ${fit.partPlatform} case line -- "${caseP.name}" is a ${fit.casePlatform} case, a different crown tube. A crown screws into a specific thread pitch and tube diameter on the case; the wrong one simply won't thread in, or will thread in cross-wise and strip the tube.`,
          slots: ["crown", "case"],
        },
      ];
    }
    if (fit.kind === "unconfirmed") {
      return [
        {
          ruleKey: "crown-case-fit",
          severity: "warning",
          message: `Can't confirm "${crown.name}" fits "${caseP.name}"'s crown tube -- the case line one or both parts are scoped to isn't identified here. A crown screws into a tube with a specific thread pitch and diameter, and cross-threading the wrong one strips the tube rather than just sitting loose, so this is worth confirming before ordering.`,
          slots: ["crown", "case"],
        },
      ];
    }
    return [];
  },
};
