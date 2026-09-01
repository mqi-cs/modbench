import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// REBUILT 2026-09-01 (Finding B). Where a date window ends up on the
// finished watch is a THREE-way result, not a movement-vs-dial comparison:
//
//   1. the movement's own factory date-wheel position. Caliber references:
//      "From the factory, the NH35A has the date at 3:00 or 6:00. The 3:00
//      date version is the most common."
//   2. the case's crown position, which rotates the whole movement within
//      the case and so moves where that factory position lands. DLW sells
//      NH36s as separate "3H crown case" and "3.8H crown case" SKUs for
//      exactly this reason.
//   3. where the dial's own cutout is cut. Caliber references again: "if
//      your watch has a date in a different location, say a tilted date at
//      4:00, then it means the watch manufacturer used an NH35A with a
//      3:00 date position and cutout the date window at the 4:00 position."
//
// So an error may only be raised when all three are known and they
// genuinely disagree. Anything less is warned about, never guessed --
// including the case where two of the three are known, which is where the
// previous version of this rule went wrong: it compared movement against
// dial alone and reported a confident mismatch that the case's crown
// position could have explained away.
//
// As of writing, no dial in the catalog has a verified date-aperture
// position (the one value that existed was crown-position language
// misread, and was removed), so in practice this rule warns rather than
// errors on every real build. That is the correct behaviour for the
// evidence available, not a gap: it becomes an error path the moment real
// dial-aperture data is sourced, with no change needed here.
export const dateWindowAlignment: Rule = {
  key: "date-window-alignment",
  appliesTo: ["dial", "movement", "case"],
  evaluate(build, catalog): Finding[] {
    const dial = getPart(build, catalog, "dial");
    const movement = getPart(build, catalog, "movement");
    if (!dial || !movement) return [];

    const caseP = getPart(build, catalog, "case");
    const movementPosition = movement.attributes.dateWindowPosition as string | null | undefined;
    const casePosition = caseP?.attributes.crownPosition as string | null | undefined;
    const dialPositions = dial.attributes.supportedDatePositions as string[] | null | undefined;
    const dialHasDate = dial.attributes.hasDateWindow;
    const movementHasDate = movement.attributes.hasDate;

    // Presence first, asymmetrically (same principle as day-window-presence).
    if (dialHasDate === false) {
      if (movementHasDate === true) {
        return [
          {
            ruleKey: "date-window-alignment",
            severity: "warning",
            message: `"${movement.name}" has a date function, but "${dial.name}" has no date aperture at all -- the date wheel just spins, invisible, behind solid dial. Nothing fails to fit, you're just not able to see or set the date; a clean, common choice if you wanted the sterile look anyway.`,
            slots: ["dial", "movement"],
          },
        ];
      }
      if (movementHasDate === null || movementHasDate === undefined) {
        return [
          {
            ruleKey: "date-window-alignment",
            severity: "warning",
            message: `"${dial.name}" has no date aperture, and whether "${movement.name}" has a date function isn't recorded. If it does, the date wheel will run unseen behind the dial -- harmless, but you'd be paying for a complication this dial can't show.`,
            slots: ["dial", "movement"],
          },
        ];
      }
      return []; // both confirmed dateless -- nothing to check
    }

    if (dialHasDate === null || dialHasDate === undefined) {
      return [
        {
          ruleKey: "date-window-alignment",
          severity: "warning",
          message: `Can't confirm whether "${dial.name}" has a date aperture, so it can't be checked against "${movement.name}"'s date wheel. A date window is a hole cut at a fixed spot on the dial -- if the movement's wheel doesn't sit under it, you see blank dial through the cutout and the date hidden elsewhere.`,
          slots: ["dial", "movement"],
        },
      ];
    }

    // Dial has a date aperture. Now the three-way position question.
    const known = movementPosition && casePosition && dialPositions;
    if (!known) {
      const missing: string[] = [];
      if (!movementPosition) missing.push(`"${movement.name}"'s factory date-wheel position`);
      if (!casePosition) missing.push(caseP ? `"${caseP.name}"'s crown position` : "the case's crown position (no case selected yet)");
      if (!dialPositions) missing.push(`"${dial.name}"'s date-aperture position`);
      return [
        {
          ruleKey: "date-window-alignment",
          severity: "warning",
          message: `Can't confirm the date lines up on this build -- ${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} stated. Where the date ends up depends on three things together: the movement's factory date-wheel position (an NH35 leaves the factory at 3 o'clock or 6 o'clock), the case's crown position (which rotates the whole movement inside the case), and where the dial's cutout is cut. Knowing two of the three isn't enough to call it either way, so this isn't guessed at.`,
          slots: caseP ? ["dial", "movement", "case"] : ["dial", "movement"],
        },
      ];
    }

    if (!dialPositions.includes(movementPosition)) {
      return [
        {
          ruleKey: "date-window-alignment",
          severity: "error",
          message: `"${movement.name}"'s date wheel sits at ${movementPosition} o'clock and "${caseP?.name}" puts the crown at ${casePosition} o'clock, but "${dial.name}"'s date cutout is cut for ${dialPositions.map((p) => `${p} o'clock`).join(" or ")}. The date window is a hole at a fixed spot on the dial face -- with the wheel landing somewhere else, you'll see blank dial where the cutout is and the date itself hidden behind solid dial.`,
          slots: ["dial", "movement", "case"],
        },
      ];
    }

    return [];
  },
};
