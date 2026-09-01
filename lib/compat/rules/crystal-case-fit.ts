import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { checkCaseShapeFit } from "../platform";

export const crystalCaseFit: Rule = {
  key: "crystal-case-fit",
  appliesTo: ["crystal", "case"],
  evaluate(build, catalog): Finding[] {
    const crystal = getPart(build, catalog, "crystal");
    const caseP = getPart(build, catalog, "case");
    if (!crystal || !caseP) return [];

    const fit = checkCaseShapeFit(caseP.family, crystal.family);
    if (fit.kind === "mismatch") {
      return [
        {
          ruleKey: "crystal-case-fit",
          severity: "error",
          message: `"${crystal.name}" is cut for the ${fit.partPlatform} case line -- "${caseP.name}" is a ${fit.casePlatform} case, a different crystal diameter and height. A crystal is pressed into the case's own crystal seat; the wrong size either won't seat far enough to compress the gasket (a water-resistance failure) or won't fit into the opening at all.`,
          slots: ["crystal", "case"],
        },
      ];
    }
    if (fit.kind === "unconfirmed") {
      return [
        {
          ruleKey: "crystal-case-fit",
          severity: "warning",
          message: `Can't confirm "${crystal.name}" fits "${caseP.name}" -- the case model this crystal is scoped to isn't identified for one or both parts here. Worth checking the vendor's listing states which case line this crystal is made for before ordering.`,
          slots: ["crystal", "case"],
        },
      ];
    }
    return [];
  },
};
