import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// Info only -- lumed vs non-lumed hands on a lumed vs non-lumed dial is a
// cosmetic mismatch (one glows in the dark, the other doesn't), never a
// fitment problem. Both sides' lumed flag is real title-parsed evidence
// (see scripts/backfill-attributes.ts's parseLumed -- "no lume" and
// "lume"/"bgw9"/"c3"/"luminous" are positive vendor statements, not a
// guess); when either side hasn't stated it, this simply doesn't fire,
// same as every other rule's "never guess" behaviour -- an info finding
// that might be wrong isn't worth surfacing the way a warning or error is.
export const lumeMismatch: Rule = {
  key: "lume-mismatch",
  appliesTo: ["hands", "dial"],
  evaluate(build, catalog): Finding[] {
    const hands = getPart(build, catalog, "hands");
    const dial = getPart(build, catalog, "dial");
    if (!hands || !dial) return [];

    const handsLumed = hands.attributes.lumed;
    const dialLumed = dial.attributes.lumed;
    if (typeof handsLumed !== "boolean" || typeof dialLumed !== "boolean") {
      // Was a silent no-op. Even at info severity, "we didn't check" and
      // "we checked and it's fine" must not look the same to the caller.
      return [
        {
          ruleKey: "lume-mismatch",
          severity: "info",
          message: `Can't confirm whether "${hands.name}" and "${dial.name}" match on lume -- at least one of the two doesn't state it. Lume only affects how the watch reads in the dark, never whether the parts fit, but a lumed dial under non-lumed hands (or the reverse) is a visible mismatch once the lights go off.`,
          slots: ["hands", "dial"],
        },
      ];
    }

    if (handsLumed !== dialLumed) {
      return [
        {
          ruleKey: "lume-mismatch",
          severity: "info",
          message: handsLumed
            ? `"${hands.name}" is lumed, but "${dial.name}" isn't -- the hands will glow in the dark and the dial markers won't, a visible mismatch once the lights go off. Purely cosmetic, doesn't affect fit.`
            : `"${dial.name}" is lumed, but "${hands.name}" aren't -- the dial markers will glow in the dark and the hands won't, a visible mismatch once the lights go off. Purely cosmetic, doesn't affect fit.`,
          slots: ["hands", "dial"],
        },
      ];
    }
    return [];
  },
};
