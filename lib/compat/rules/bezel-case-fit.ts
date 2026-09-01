import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { checkCaseShapeFit } from "../platform";

// NEW pre-Phase-2 (2026-09-01): `bezel` (the rotating ring assembly, as
// distinct from bezel_insert, the disc it holds) has no rule in the
// original 15-rule table -- it was added to the schema partway through
// Phase 1 once it was confirmed to be a real, sizeable category (see
// lib/db/schema.ts's CATEGORIES comment). A bezel ring threads or clips
// onto the case's own bezel mount, so it's exactly the same case-shape
// question as insert-case-diameter, chapter-ring-fit, and crown-case-fit
// -- error severity, since an unthreaded or wrong-diameter bezel simply
// will not turn or attach.
export const bezelCaseFit: Rule = {
  key: "bezel-case-fit",
  appliesTo: ["bezel", "case"],
  evaluate(build, catalog): Finding[] {
    const bezel = getPart(build, catalog, "bezel");
    const caseP = getPart(build, catalog, "case");
    if (!bezel || !caseP) return [];

    const fit = checkCaseShapeFit(caseP.family, bezel.family);
    if (fit.kind === "mismatch") {
      return [
        {
          ruleKey: "bezel-case-fit",
          severity: "error",
          message: `"${bezel.name}" is made for the ${fit.partPlatform} case line -- "${caseP.name}" is a ${fit.casePlatform} case, a different bezel mount. The bezel ring clips or threads onto a specific mount on the case topside; a mismatch means it won't seat, click, or turn correctly, not just look slightly off.`,
          slots: ["bezel", "case"],
        },
      ];
    }
    if (fit.kind === "unconfirmed") {
      return [
        {
          ruleKey: "bezel-case-fit",
          severity: "warning",
          message: `Can't confirm "${bezel.name}" fits "${caseP.name}" -- the case line one or both parts are scoped to isn't identified here. A bezel ring clips or threads onto a mount machined into the top of the case, and that mount is specific to the case line, so this is worth confirming on the vendor's listing rather than assuming.`,
          slots: ["bezel", "case"],
        },
      ];
    }
    return [];
  },
};
