import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { checkCaseShapeFit } from "../platform";

// A chapter ring sits loose inside the case, held by the dial and
// crystal rather than pressed or threaded -- a mismatch usually means it
// sits at the wrong height or shows a gap rather than fully blocking the
// build the way a wrong-size crystal or insert would. Per
// specs/03-phase-2-compat-engine.md's rule table, this stays a warning,
// not an error, for exactly that reason.
export const chapterRingFit: Rule = {
  key: "chapter-ring-fit",
  appliesTo: ["chapterRing", "case", "dial"],
  familyDecides: ["chapterRing", "case"],
  evaluate(build, catalog): Finding[] {
    const chapterRing = getPart(build, catalog, "chapterRing");
    const caseP = getPart(build, catalog, "case");
    if (!chapterRing || !caseP) return [];

    const fit = checkCaseShapeFit(caseP.family, chapterRing.family);
    if (fit.kind === "mismatch") {
      return [
        {
          ruleKey: "chapter-ring-fit",
          severity: "warning",
          message: `"${chapterRing.name}" is cut for the ${fit.partPlatform} case line -- "${caseP.name}" is a ${fit.casePlatform} case, a different inner diameter. A chapter ring sits loose inside the case rather than pressed or threaded, so a mismatch usually shows as a visible gap or an uneven sit rather than blocking the build outright, but it's worth checking before you order rather than finding out at assembly.`,
          slots: ["chapterRing", "case"],
        },
      ];
    }
    if (fit.kind === "unconfirmed") {
      return [
        {
          ruleKey: "chapter-ring-fit",
          severity: "warning",
          message: `Can't confirm "${chapterRing.name}" fits "${caseP.name}" -- the case line one or both parts are scoped to isn't identified here. A chapter ring sits loose between the dial and the crystal, located by the case's inner wall, so its diameter has to suit that specific case; a mismatch shows as a gap or an uneven sit rather than a hard failure.`,
          slots: ["chapterRing", "case"],
        },
      ];
    }
    return [];
  },
};
