import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// NEW 2026-09-28 (WS2c follow-up). 31 namokimods case listings state the
// chapter ring is machined into the case: "integrated brushed chapter ring
// (rehaut)", "integrated bezel and chapter ring (rehaut)". A separate ring
// on top of a rehaut has nowhere to sit.
//
// Only one line says so outright, and only that one may block:
//   "Fits all SKX007/SRPD parts including SKX007 bracelets except Chapter
//    Ring" -- NMK941 GMT Sub SKX007/SRPD Watch Case Mk 2 (bad-023).
// For the other 27 the clash is inferred from "integrated", so it warns.
export const integratedChapterRing: Rule = {
  key: "integrated-chapter-ring",
  appliesTo: ["case", "chapterRing"],
  evaluate(build, catalog): Finding[] {
    const caseP = getPart(build, catalog, "case");
    const ring = getPart(build, catalog, "chapterRing");
    if (!caseP || !ring || caseP.attributes.integratedChapterRing !== true) return [];
    const stated = caseP.attributes.separateChapterRingExcluded === true;
    return [
      {
        ruleKey: "integrated-chapter-ring",
        severity: stated ? "error" : "warning",
        message: stated
          ? `"${caseP.name}" has its chapter ring built into the case, and the vendor says it takes every SKX007 part except a chapter ring -- "${ring.name}" has nowhere to sit. The ring you see inside this case is part of the case itself (a rehaut), so a separate one isn't needed.`
          : `"${caseP.name}" has its chapter ring built into the case (a rehaut), so "${ring.name}" would sit on top of one that's already there. The vendor doesn't say outright that a separate ring won't fit, so check before ordering -- most likely you don't need it.`,
        slots: ["case", "chapterRing"],
        fix: "Remove the chapter ring: this case already has one.",
      },
    ];
  },
};
