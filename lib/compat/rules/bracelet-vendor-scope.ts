import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// NEW 2026-09-01 (Phase 3 body_html mining pass). 20 luciusatelier
// bracelet listings carry a constraint stronger than any the engine could
// previously express:
//
//   "Fits Lucius Atelier cases only. The end-links are shaped to our case
//    profiles -- this bracelet does not fit generic 20mm lugs or OEM
//    [cases]"
//
// Every other case-shape rule in this engine matches on case LINE
// (skx007-*, skx013-*). That is not enough here: this is scoped to one
// VENDOR's cases, so a genuine SKX013 case from namokimods or an OEM
// Seiko SKX013 -- correct line, correct 20mm lug width -- is still
// excluded. Matching families would pass it; matching lug width would
// pass it; only the vendor scope catches it.
//
// Determining the case's vendor from listing data is the caller's job
// (CatalogSlice carries listings with vendorKey). When the case has no
// listing the rule warns rather than assuming -- the usual fail-safe.
export const braceletVendorScope: Rule = {
  key: "bracelet-vendor-scope",
  appliesTo: ["strap", "case"],
  evaluate(build, catalog): Finding[] {
    const strap = getPart(build, catalog, "strap");
    const caseP = getPart(build, catalog, "case");
    if (!strap || !caseP) return [];

    const scopedTo = strap.attributes.vendorScopedTo as string | null | undefined;
    if (!scopedTo) return [];

    const caseVendors = catalog.listings.filter((l) => l.partId === caseP.id).map((l) => l.vendorKey);
    if (caseVendors.length === 0) {
      return [
        {
          ruleKey: "bracelet-vendor-scope",
          severity: "warning",
          message: `"${strap.name}" only fits cases from one specific maker, and which maker "${caseP.name}" comes from isn't recorded here. Unlike a plain strap, this bracelet's end-links are cut to that maker's own case profiles -- so matching the case line and the lug width isn't enough on its own.`,
          slots: ["strap", "case"],
        },
      ];
    }

    if (!caseVendors.includes(scopedTo)) {
      return [
        {
          ruleKey: "bracelet-vendor-scope",
          severity: "error",
          message: `"${strap.name}" fits only that maker's own cases -- its listing says so directly, and "${caseP.name}" isn't one of them. The end-links are shaped to one maker's case profiles, so even a case of the same line with the same lug width leaves a gap at the lugs or won't seat flush. This is narrower than the usual case-model constraint: here the maker matters, not just the model.`,
          slots: ["strap", "case"],
          fix: "Pair this bracelet with a case from the same maker, or pick a spring-bar strap, which fits on lug width alone.",
        },
      ];
    }

    return [];
  },
};
