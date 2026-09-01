import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// REBUILT 2026-09-01 after the Phase 2 mechanism audit.
//
// This rule previously errored when an NH-family dial met a VK6x movement
// (or vice versa), claiming the two families use "a different clip
// standard" and that "the dial's feet posts won't land on this movement's
// mounting holes at all". That premise is false: caliber references state
// the VK63 shares the NH35's mounting dimensions AND dial feet positions
// with zero modifications required. Dial feet are not the NH-vs-VK
// constraint.
//
// The REAL constraint between the two families is subdial apertures. A
// VK6x is a chronograph (VK63: small seconds at 6, 60-minute counter at 9,
// 24-hour register at 3), so a VK6x dial has holes cut for subdial hands.
// That gives the same asymmetry day-window-presence has:
//
//   dial has subdial apertures + movement has no subdial pinions -> ERROR
//     (open holes onto the bare movement plate, a visible defect)
//   movement has chronograph pinions + plain dial with no apertures ->
//     WARNING (the chronograph function is simply invisible and unused --
//     wasted, not broken)
//
// The feetless case (nh3x-dial-feetless) stays a warning: gluing with dial
// dots is normal practice, not a failure.
function isChronographMovement(family: string): boolean {
  return family.startsWith("vk6x");
}

export const dialMovementFeet: Rule = {
  key: "dial-movement-feet",
  appliesTo: ["dial", "movement"],
  evaluate(build, catalog): Finding[] {
    const dial = getPart(build, catalog, "dial");
    const movement = getPart(build, catalog, "movement");
    if (!dial || !movement) return [];

    const findings: Finding[] = [];
    const hasSubdials = dial.attributes.hasSubdials;
    const movementIsChrono = isChronographMovement(movement.family);

    if (hasSubdials === true && !movementIsChrono) {
      findings.push({
        ruleKey: "dial-movement-feet",
        severity: "error",
        message: `"${dial.name}" is a chronograph dial -- it has subdial apertures cut into it for the small-seconds, minute-counter and 24-hour hands. "${movement.name}" has no subdial pinions to put in those holes, so you'd be looking straight through them at the bare movement plate. A chronograph dial needs a chronograph movement underneath it; the holes are cut for hands that this movement doesn't have.`,
        slots: ["dial", "movement"],
      });
    } else if (hasSubdials === false && movementIsChrono) {
      findings.push({
        ruleKey: "dial-movement-feet",
        severity: "warning",
        message: `"${movement.name}" is a mecaquartz chronograph, but "${dial.name}" is a plain dial with no subdial apertures -- the chronograph registers have nowhere to show, so the stopwatch function runs but stays invisible. Nothing fails to fit (the VK6x shares the NH-series mounting footprint and dial feet positions), you just won't be able to read the complication you're paying for.`,
        slots: ["dial", "movement"],
      });
    } else if (hasSubdials === null || hasSubdials === undefined) {
      findings.push({
        ruleKey: "dial-movement-feet",
        severity: "warning",
        message: `Can't confirm whether "${dial.name}" has chronograph subdial apertures cut in it -- that isn't recorded for this listing. It matters because subdial holes need matching pinions on the movement underneath; over a movement without them you'd see through the holes to the bare plate. Worth checking the vendor's photos before ordering.`,
        slots: ["dial", "movement"],
      });
    }

    const hasFeet = dial.attributes.hasFeet;
    if (hasFeet === false) {
      findings.push({
        ruleKey: "dial-movement-feet",
        severity: "warning",
        message: `"${dial.name}" has no feet -- the small posts that clip a dial onto the movement. You can glue it in place with dial dots, which most modders do, but you'll need to be careful about centring it, since nothing mechanically locates the dial for you once the feet are gone.`,
        slots: ["dial", "movement"],
        fix: "Add dial dots to your parts list, and take extra care centring the dial when gluing.",
      });
    } else if (hasFeet === null || hasFeet === undefined) {
      findings.push({
        ruleKey: "dial-movement-feet",
        severity: "warning",
        message: `Whether "${dial.name}" has mounting feet or needs gluing isn't confirmed in this listing -- most dials in its family do have feet, but this isn't guessed at, so check the vendor's photos or ask before ordering. If it turns out feetless, you'll want dial dots on hand.`,
        slots: ["dial"],
      });
    }

    return findings;
  },
};
