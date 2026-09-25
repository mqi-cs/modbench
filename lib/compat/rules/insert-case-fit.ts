import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { checkCaseShapeFit } from "../platform";

// Named `insert-case-diameter` until WS0 (2026-09-26); renamed because it compares case lines, not diameters.

export const insertCaseFit: Rule = {
  key: "insert-case-fit",
  appliesTo: ["bezelInsert", "case"],
  familyDecides: ["bezelInsert", "case"],
  evaluate(build, catalog): Finding[] {
    const insert = getPart(build, catalog, "bezelInsert");
    const caseP = getPart(build, catalog, "case");
    if (!insert || !caseP) return [];

    const fit = checkCaseShapeFit(caseP.family, insert.family);
    if (fit.kind === "mismatch") {
      return [
        {
          ruleKey: "insert-case-fit",
          severity: "error",
          message: `"${insert.name}" is sized for the ${fit.partPlatform} case line -- "${caseP.name}" is a ${fit.casePlatform} case, a different bezel diameter. A bezel insert is a snug press-fit ring; one cut for a different case line will either not seat in the bezel channel at all, or sit loose and rattle if it's undersized. If this case has no insert listed for it in its own line, it may not take a rotating insert at all.`,
          slots: ["bezelInsert", "case"],
        },
      ];
    }
    if (fit.kind === "unconfirmed") {
      return [
        {
          ruleKey: "insert-case-fit",
          severity: "warning",
          message: `Can't confirm "${insert.name}" fits "${caseP.name}"'s bezel -- the case model this insert is scoped to isn't identified for one or both parts here. Worth checking the vendor's listing states which case line this insert is made for.`,
          slots: ["bezelInsert", "case"],
        },
      ];
    }
    return [];
  },
};
