import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// NEW 2026-09-01 (Phase 3 body_html mining pass). 26 luciusatelier case
// listings state that a chapter ring is not optional on that case:
//
//   "This case needs an SKX013 chapter ring to seat the dial correctly --
//    it is mandatory and never included."
//   "This case requires a SKX013-spec chapter ring to seat the dial
//    correctly -- without it, the dial sits too low and hands won't clear."
//
// The chapter ring is what sets dial height on these cases. Leave it out
// and the dial drops, and the hands foul the crystal -- a real physical
// failure, not a cosmetic gap, and the vendor names the consequence
// itself. "Never included" is the other half: a buyer who doesn't add one
// deliberately will not receive one.
//
// This is also the first rule to populate `requiredAdditions`, which the
// Phase 2 spec defines ("e.g. a movement spacer") but which no rule had
// evidence to fill until this pass -- a missing part is a different thing
// from an incompatible one, and the BuildResult shape already
// distinguishes them.
export const requiresChapterRing: Rule = {
  key: "requires-chapter-ring",
  appliesTo: ["case", "chapterRing", "dial"],
  evaluate(build, catalog): Finding[] {
    const caseP = getPart(build, catalog, "case");
    if (!caseP) return [];
    if (caseP.attributes.requiresChapterRing !== true) return [];

    const chapterRing = getPart(build, catalog, "chapterRing");
    if (chapterRing) return []; // requirement satisfied

    // Only fires once a dial is chosen: with no dial there is nothing to
    // seat, so the requirement isn't live yet and saying so would just be
    // noise on a half-built configuration.
    const dial = getPart(build, catalog, "dial");
    if (!dial) return [];

    return [
      {
        ruleKey: "requires-chapter-ring",
        severity: "error",
        message: `"${caseP.name}" needs a chapter ring and doesn't come with one -- the vendor states it's mandatory and never included. On this case the chapter ring is what holds the dial at the right height; without it "${dial.name}" sits too low and the hands won't clear the crystal. A chapter ring looks like trim, but on cases built this way it's a structural part of the stack, not decoration.`,
        slots: ["case", "chapterRing", "dial"],
        fix: "Add a chapter ring matching this case's line to the build.",
      },
    ];
  },
};
