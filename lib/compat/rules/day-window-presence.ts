import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// The NH36 is the one NH-series caliber with a day wheel alongside the
// date wheel (Amendment: confirmed both by Lucius's own guide -- "NH36:
// three-hand day-date" -- and by Namoki separately selling an "NH36
// Intermediate Wheel for Day Corrector" spare part, evidence the day
// hardware is NH36-specific).
//
// Asymmetric by design (2026-09-01, after investigating the good-020 /
// bad-001 / bad-009 collision in known-builds.json): a day-date movement
// under a dial with no day aperture is a WARNING, not an error. Two
// independent vendor sources back this -- the NH36's own listing says "if
// your dial only shows the date (day wheel covered), the choice [of crown
// position] becomes less significant," and assemble.watch's own guide
// notes "the day display on the NH36 goes unused in a lot of builds."
// Nothing rubs, misaligns, or fails to fit; the day wheel just spins,
// invisible, behind solid dial. That's a real thing worth flagging (you
// paid for a complication you can't see or set), but it's not a fitment
// failure -- blocking it would be a false negative (correctly-working
// builds refused), which the project's own zero-*false-positive*
// standard doesn't require guarding against as strictly as an error would.
//
// The other direction stays an error: a dial cut with a day aperture over
// a movement with no day wheel shows an empty window onto the bare
// movement plate -- a real, visible defect, not a wasted feature.
export const dayWindowPresence: Rule = {
  key: "day-window-presence",
  appliesTo: ["dial", "movement"],
  evaluate(build, catalog): Finding[] {
    const dial = getPart(build, catalog, "dial");
    const movement = getPart(build, catalog, "movement");
    if (!dial || !movement) return [];

    const movementHasDay = movement.attributes.hasDay;
    const dialHasDay = dial.attributes.hasDayWindow;

    if (movementHasDay === true && dialHasDay === false) {
      return [
        {
          ruleKey: "day-window-presence",
          severity: "warning",
          message: `"${movement.name}" is a day-date movement -- it has a day wheel as well as a date wheel. "${dial.name}" has no day aperture, so that day wheel sits behind solid dial, invisible -- it still runs, nothing fails to fit, you just can't see or set it. A deliberate, common choice for a cleaner face; just know you're paying for a feature this dial won't show.`,
          slots: ["dial", "movement"],
        },
      ];
    }

    if (movementHasDay === false && dialHasDay === true) {
      return [
        {
          ruleKey: "day-window-presence",
          severity: "error",
          message: `"${dial.name}" has a day aperture cut for a day-date movement, but "${movement.name}" has no day wheel -- there's nothing to show through that cutout, so you'll see blank dial or the movement's bare mechanism through the window instead of a day name. Pick a day-date movement (an NH36) if you want to use this dial's day window.`,
          slots: ["dial", "movement"],
        },
      ];
    }

    if (movementHasDay === null || movementHasDay === undefined || dialHasDay === null || dialHasDay === undefined) {
      return [
        {
          ruleKey: "day-window-presence",
          severity: "warning",
          message: `Can't confirm whether "${movement.name}" and "${dial.name}" agree on having a day window -- day-date function isn't stated for one or both parts here. An NH36 has a day wheel that needs a matching aperture on the dial to be visible at all; worth checking both listings before ordering.`,
          slots: ["dial", "movement"],
        },
      ];
    }

    return [];
  },
};
