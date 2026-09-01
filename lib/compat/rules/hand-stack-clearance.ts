import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// Hands that are too long for the dial/chapter-ring stack drag on the
// chapter ring or touch the crystal -- a real, reported failure mode (see
// data/fixtures -- the bad-009 fixture's real-world source post describes
// exactly this: "the second hand touching the crystal when the case back
// was fully screwed down"). No hand-length data has been gathered for
// this catalog yet (lib/compat/rules -- attributes.lengthSetMm is
// currently always null across every approved hands part; see
// scripts/backfill-attributes.ts), so this rule can only warn that it
// can't confirm clearance, never assert a real mismatch -- exactly the
// "never guess, emit a warning saying so" behaviour
// specs/03-phase-2-compat-engine.md requires when a rule lacks the
// evidence to determine an answer.
export const handStackClearance: Rule = {
  key: "hand-stack-clearance",
  appliesTo: ["hands", "chapterRing", "dial"],
  evaluate(build, catalog): Finding[] {
    const hands = getPart(build, catalog, "hands");
    const chapterRing = getPart(build, catalog, "chapterRing");
    if (!hands || !chapterRing) return []; // no chapter ring in the build at all -- nothing to clear

    const lengthSetMm = hands.attributes.lengthSetMm;
    if (lengthSetMm === null || lengthSetMm === undefined) {
      return [
        {
          ruleKey: "hand-stack-clearance",
          severity: "warning",
          message: `Can't confirm "${hands.name}" clears "${chapterRing.name}" once the case back is screwed down -- hand length isn't recorded for this listing, and a hand that's even slightly too long can drag on the chapter ring or touch the crystal. Worth a dry-fit before final assembly if you're unsure.`,
          slots: ["hands", "chapterRing"],
        },
      ];
    }

    return [];
  },
};
