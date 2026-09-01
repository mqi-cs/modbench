import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { checkCaseShapeFit } from "../platform";

// NEW pre-Phase-2 (2026-09-01): `strap` has no rule in the original
// 15-rule table. Unlike the other case-mounted categories, strap splits
// into two real, differently-shaped families:
//
// - generic-strap: a plain spring-bar strap, deliberately NOT platform-
//   tied -- it fits any case at the matching lug width regardless of case
//   model (see scripts/tag-parts.ts's generic-strap push() calls, and
//   family_exceptions rule case-named-strap-is-lug-width-generic, which
//   documents real vendor evidence for exactly this: straps whose name
//   mentions a case model but whose own listing states a fixed lug width
//   and multi-case compatibility). Running these through the platform
//   check would misreport "can't confirm platform" for something that was
//   never meant to be platform-matched in the first place -- so this rule
//   deliberately skips the platform comparison for generic-strap and only
//   checks lug width where both sides have it recorded.
// - the *-bracelet families (skx007-bracelet, etc.): case-contoured
//   end-links, genuinely platform-tied the same way a crown or bezel is
//   (see resolveCaseModelPrefix's bracelet handling in tag-parts.ts:
//   "case-contoured end-links, not a generic lug-width strap").
export const strapFit: Rule = {
  key: "strap-fit",
  appliesTo: ["strap", "case"],
  evaluate(build, catalog): Finding[] {
    const strap = getPart(build, catalog, "strap");
    const caseP = getPart(build, catalog, "case");
    if (!strap || !caseP) return [];

    if (strap.family === "generic-strap") {
      const strapLug = strap.attributes.lugWidthMm as number | null | undefined;
      const caseLug = caseP.attributes.lugWidthMm as number | null | undefined;
      if (typeof strapLug === "number" && typeof caseLug === "number" && strapLug !== caseLug) {
        return [
          {
            ruleKey: "strap-fit",
            severity: "error",
            message: `"${strap.name}" is a ${strapLug}mm strap, but "${caseP.name}"'s lugs are ${caseLug}mm apart. Lug width is the one measurement a strap has to match exactly: the spring bar spans the gap between the lugs, so a strap cut narrower leaves the bar exposed and one cut wider won't go in at all. Unlike case model, this is the only thing that matters for a plain spring-bar strap -- match the width and it fits any case.`,
            slots: ["strap", "case"],
          },
        ];
      }
      if (typeof strapLug !== "number" || typeof caseLug !== "number") {
        // generic-strap genuinely is case-model-agnostic, but "fits at the
        // matching lug width" still needs the two widths to match. When
        // either is unrecorded, that's unchecked, not confirmed.
        return [
          {
            ruleKey: "strap-fit",
            severity: "warning",
            message: `Can't confirm "${strap.name}" fits "${caseP.name}"'s lugs -- the lug width isn't recorded for one or both. This kind of strap fits any case at the matching width regardless of case model, but the width itself still has to match: a 20mm strap won't span 22mm lugs.`,
            slots: ["strap", "case"],
          },
        ];
      }
      return []; // both widths known and equal -- a real, confirmed fit
    }

    const fit = checkCaseShapeFit(caseP.family, strap.family);
    if (fit.kind === "mismatch") {
      return [
        {
          ruleKey: "strap-fit",
          severity: "error",
          message: `"${strap.name}" has end-links contoured for the ${fit.partPlatform} case line -- "${caseP.name}" is a ${fit.casePlatform} case, a different case-shoulder profile. Unlike a spring-bar strap, a bracelet's end-links are shaped to hug one specific case; a mismatched pair leaves a visible gap at the lugs or simply won't sit flush.`,
          slots: ["strap", "case"],
        },
      ];
    }
    if (fit.kind === "unconfirmed") {
      return [
        {
          ruleKey: "strap-fit",
          severity: "warning",
          message: `Can't confirm "${strap.name}"'s end-links fit "${caseP.name}" -- the case line one or both parts are scoped to isn't identified here. A bracelet differs from a plain strap in exactly this way: its end-links are shaped to hug one specific case's shoulders, so matching lug width isn't enough on its own.`,
          slots: ["strap", "case"],
        },
      ];
    }
    return [];
  },
};
