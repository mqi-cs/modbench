import type { Rule, Finding } from "../types";
import { getPart } from "../types";
import { familyPlatform } from "../platform";

// NEW 2026-09-28 (WS2c follow-up). Most cases don't say whether they need a
// chapter ring. Their listings say it's sold separately ("Complete your mod
// with the following parts: ... Chapter Rings", DLW; "Fits all SKX007
// Crystals, Bezels, Bezel Inserts and Chapter Rings", namokimods) or say
// nothing, but none says a ring is optional. Where a vendor does say, the
// answer can be "required" -- 22 luciusatelier cases, where the ring sets
// dial height (requires-chapter-ring). So a build without one gets one
// can't-confirm warning, never an error: missing data warns, it doesn't
// guess.
//
// Fires once per build, only when no ring is chosen and the case has none
// built in (and doesn't already require one -- that's requires-chapter-ring,
// whose findings become requiredAdditions).
export const chapterRingUnstated: Rule = {
  key: "chapter-ring-unstated",
  appliesTo: ["case", "chapterRing"],
  evaluate(build, catalog): Finding[] {
    const caseP = getPart(build, catalog, "case");
    if (!caseP || getPart(build, catalog, "chapterRing")) return [];
    const a = caseP.attributes;
    if (a.requiresChapterRing === true || a.integratedChapterRing === true) return [];
    const line = familyPlatform(caseP.family)?.toUpperCase();
    const ring = line ? `a chapter ring made for the ${line} line` : "a chapter ring made for this case";
    return [
      {
        ruleKey: "chapter-ring-unstated",
        severity: "warning",
        message: `This build has no chapter ring, and "${caseP.name}"'s listing doesn't say whether it needs one or comes with one. The chapter ring is the ring between the dial and the crystal. On some cases it's only trim; on others it holds the dial at the right height, and without it the hands can foul the crystal.`,
        slots: ["case", "chapterRing"],
        fix: `Add ${ring}, or ask the vendor whether this case needs one before you order.`,
      },
    ];
  },
};
