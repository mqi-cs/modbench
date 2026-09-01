import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// REBUILT 2026-09-01 after the Phase 2 mechanism audit falsified this
// rule's original premise.
//
// It previously errored when a VK6x mecaquartz movement met a non-VK6x
// case (or vice versa), claiming "two different watch architectures". That
// is not true. Caliber references give the VK63/VK64 a 29.1mm casing
// diameter and 5.10mm height against the NH35's 29.36mm and 5.32mm, and
// state the VK63 is compatible with cases designed for the NH35 with
// "mounting dimensions, dial feet positions, crown heights, and cannon
// requiring zero modifications". The VK is fractionally *thinner*, so it
// fits wherever an NH fits. An error there was a false block on a
// combination the industry treats as drop-in.
//
// What remains is the one claim that IS real and checkable: a movement
// spare part is not a movement. Everything else this rule could assert
// (which movements a given case rejects) has no evidence behind it in
// this catalog -- no case listing states a movement family it won't
// accept -- so it is not asserted at all rather than guessed.
export const movementCaseFit: Rule = {
  key: "movement-case-fit",
  appliesTo: ["movement", "case"],
  evaluate(build, catalog): Finding[] {
    const movement = getPart(build, catalog, "movement");
    if (!movement) return [];

    if (movement.family === "nh3x-movement-accessory") {
      return [
        {
          ruleKey: "movement-case-fit",
          severity: "error",
          message: `"${movement.name}" is a movement spare part (a rotor, wheel, spring, or similar), not a complete movement -- it installs onto an existing movement, it doesn't go in the movement slot on its own. Every build needs one complete, installable movement (an NH35, NH36, NH34, NH38, or VK6x) as its base; spare parts and decorative rotors are optional add-ons chosen separately.`,
          slots: ["movement"],
          fix: "Pick a complete movement (e.g. an NH35 or NH36 Automatic Movement) for this slot.",
        },
      ];
    }

    return [];
  },
};
