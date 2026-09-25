import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// WS1 step 3. dial-case-diameter compares a dial to the case it drops
// into; nothing compared it to the movement it sits on. The NH34/35/36/38
// take the 28.5mm standard dial. The skeleton NH70/71/72 are sold as "the
// movement is the dial" (Lucius, NH72) with a dial spacer, and no vendor
// here states what dial, if any, they take. Warn-only: no listing in the
// catalog states a dial/movement size mismatch, so nothing here may block.
// VK6x chronographs are dial-movement-feet's job.
const TAKES_28_5 = new Set(["NH34", "NH35", "NH36", "NH38"]);

export const dialMovementSize: Rule = {
  key: "dial-movement-size",
  appliesTo: ["dial", "movement"],
  evaluate(build, catalog): Finding[] {
    const dial = getPart(build, catalog, "dial");
    const movement = getPart(build, catalog, "movement");
    if (!dial || !movement || movement.family !== "nh3x-movement") return [];

    const caliber = movement.attributes.caliber as string | null | undefined;
    if (caliber && TAKES_28_5.has(caliber)) return [];

    if (caliber && caliber.startsWith("NH7")) {
      return [
        {
          ruleKey: "dial-movement-size",
          severity: "warning",
          message: `"${movement.name}" is a skeleton movement -- it is designed to be seen, and its sellers describe it as "the movement is the dial". Can't confirm that "${dial.name}" is the right size or thickness to sit on it: no seller here states a dial size for the ${caliber}. Check with the dial's seller before ordering.`,
          slots: ["dial", "movement"],
        },
      ];
    }
    return [
      {
        ruleKey: "dial-movement-size",
        severity: "warning",
        message: `Can't confirm "${dial.name}" is the right size for "${movement.name}" -- which caliber it is isn't recorded. Most NH movements take the standard 28.5mm dial, but the skeleton NH70/71/72 don't, so it's worth checking the movement's listing.`,
        slots: ["dial", "movement"],
      },
    ];
  },
};
