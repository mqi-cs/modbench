import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// NEW 2026-09-28 (WS2c follow-up). Most cases don't say whether they need a
// chapter ring. Their listings say it's sold separately ("Complete your mod
// with the following parts: ... Chapter Rings", DLW; "Fits all SKX007
// Crystals, Bezels, Bezel Inserts and Chapter Rings", namokimods) or say
// nothing, but none says a ring is optional. Where a vendor does say, the
// answer can be "required" -- 22 luciusatelier cases, where the ring sets
// dial height (requires-chapter-ring). So a build without one gets a
// can't-confirm warning, never an error: missing data warns, it doesn't
// guess. Separate from requires-chapter-ring, whose findings become
// requiredAdditions.
export const chapterRingUnstated: Rule = {
  key: "chapter-ring-unstated",
  appliesTo: ["case", "chapterRing", "dial"],
  evaluate(build, catalog): Finding[] {
    const caseP = getPart(build, catalog, "case");
    if (!caseP || getPart(build, catalog, "chapterRing")) return [];
    const a = caseP.attributes;
    if (a.requiresChapterRing === true || a.integratedChapterRing === true) return [];
    // Same trigger as requires-chapter-ring: only once there's a dial to seat.
    const dial = getPart(build, catalog, "dial");
    if (!dial) return [];
    return [
      {
        ruleKey: "chapter-ring-unstated",
        severity: "warning",
        message: `Can't confirm whether "${caseP.name}" needs a chapter ring -- the vendor doesn't say, and this build has none. It's the ring between the dial and the crystal. On some cases it's only trim; on others it's what holds the dial at the right height, and without it the hands can foul the crystal.`,
        slots: ["case", "chapterRing"],
        fix: "Check the case listing or ask the vendor; add a chapter ring for this case's line if it needs one.",
      },
    ];
  },
};
