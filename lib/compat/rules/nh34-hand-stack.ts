import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// Named `hands-movement-bore` until WS0 (2026-09-26); renamed because it checks NH34 hand-stack clearance, not a hand bore.

// REBUILT 2026-09-01. The original version of this rule errored on
// "NH34 GMT movement + hands not marked GMT", claiming the hands had
// "nowhere for that pinion to go, not even a loose press-fit". That is
// factually wrong, and it was blocking real, working builds.
//
// What the sources actually say (caliber references and vendor guides,
// checked independently):
//   - "Hands made for the NH35/36 will work for the NH34, though NH35/36
//     handsets don't usually include a GMT hand so you'll have to source
//     one separately." Standard hands DO mount.
//   - The NH34's hand post is ~0.4mm taller to carry the 24-hour hand,
//     "which may cause the seconds hand to bump on the crystal -- this can
//     be resolved by switching to a double domed crystal for extra
//     clearance."
//   - Lucius's own guide: "Not every case has the internal clearance for
//     NH34's GMT hand stack" -- and their Pilot 34mm "uses double-domed
//     sapphire for the extra 1mm of height needed to clear the NH34's GMT
//     hand stack".
//
// So the real failure mode is a CASE/CRYSTAL clearance question, not a
// hand-mounting one -- which is why this rule now reads the case and
// crystal slots as well. Two distinct findings come out of it:
//
//   1. Clearance: NH34 + a case/crystal not known to be double-domed ->
//      warning (the seconds hand may foul the crystal). Never an error:
//      whether it actually fouls depends on the specific case's internal
//      height, which no listing in this catalog states. If a double-domed
//      crystal IS present, the documented remedy is already in place and
//      nothing is emitted.
//   2. Missing GMT hand: NH34 + a hand set not marked GMT -> warning. The
//      build works; the 24-hour hand simply isn't there, so the GMT
//      complication you paid for can't be read. Same "wasted complication"
//      shape as day-window-presence, and warned for the same reason.
export const nh34HandStack: Rule = {
  key: "nh34-hand-stack",
  appliesTo: ["hands", "movement", "case", "crystal"],
  evaluate(build, catalog): Finding[] {
    const hands = getPart(build, catalog, "hands");
    const movement = getPart(build, catalog, "movement");
    if (!hands || !movement) return [];

    const findings: Finding[] = [];
    const caliber = movement.attributes.caliber;

    if (caliber === null || caliber === undefined) {
      // Previously this rule silently assumed "not an NH34" whenever the
      // caliber hadn't been parsed, which is a guess in the direction of
      // "everything is fine" -- the one direction the spec forbids.
      return [
        {
          ruleKey: "nh34-hand-stack",
          severity: "warning",
          message: `Can't confirm which caliber "${movement.name}" is, so the hand-fitting question can't be answered here. It matters mainly for the NH34: its hand post is about 0.4mm taller to carry the 24-hour hand, which can bring the seconds hand up against the crystal. Worth confirming the caliber on the vendor's listing before ordering hands.`,
          slots: ["hands", "movement"],
        },
      ];
    }

    if (caliber === "NH34") {
      if (hands.attributes.gmt !== true) {
        findings.push({
          ruleKey: "nh34-hand-stack",
          severity: "warning",
          message: `"${movement.name}" is an NH34 -- Seiko's GMT caliber, which drives a 4th, independently-set 24-hour hand. "${hands.name}" is a standard 3-hand set and doesn't include that hand. The set still mounts and the watch still runs; you just won't have a hand on the GMT pinion, so the second-time-zone function you paid the NH34 premium for can't be read.`,
          slots: ["hands", "movement"],
          fix: "Either add a GMT-labelled hand set for the NH34, or use a plain NH35 if you don't want the GMT function.",
        });
      }

      const caseP = getPart(build, catalog, "case");
      const crystal = getPart(build, catalog, "crystal");
      const doubleDomed =
        caseP?.attributes.hasDoubleDomedCrystal === true || (crystal ? /double.?dome/i.test(crystal.name) : false);
      if (!doubleDomed) {
        findings.push({
          ruleKey: "nh34-hand-stack",
          severity: "warning",
          message: `"${movement.name}" is an NH34, whose hand post sits about 0.4mm taller than an NH35's to carry the 24-hour hand. That extra height can bring the seconds hand up against the underside of the crystal in a case without enough internal clearance${caseP ? ` -- and "${caseP.name}" isn't listed as having a double-domed crystal` : ""}. The standard fix is a double-domed crystal, which buys roughly the extra millimetre the GMT hand stack needs.`,
          slots: crystal ? ["hands", "movement", "crystal"] : ["hands", "movement", "case"],
          fix: "Use a double-domed crystal, or confirm with the vendor that this case clears an NH34 hand stack.",
        });
      }
    }

    return findings;
  },
};
