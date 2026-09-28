import type { Rule, Finding, SlotKey } from "../types";
import { getPart } from "../types";

// NEW 2026-09-28 (WS2c follow-up, D19e). 16 namokimods cases have the bezel
// machined into the case: "comes with an integrated bezel and brushed
// rehaut" (NMK926 Nautilus), "Integrated Bezel and Chapter Ring (Rehaut)"
// (NMK926, 931, 936, 937, 938, 952), "Integrated Fixed Bezel" (NMK955, 958).
// Their compatibility lines name everything that does fit, and it's not an
// insert or a bezel: "Fits all SKX007 Crowns and SKX casebacks and is
// compatible with all our existing dials and hands" (NMK926, bad-024);
// "just pick your choice of dial and hands" (NMK936, 937, 952). The same
// vendor's other SKX cases say "Fits all SKX007 Crystals, Crowns, Bezels,
// Bezel Inserts and Chapter Rings". Family matching alone said an SKX007
// insert fits these cases.
export const integratedBezel: Rule = {
  key: "integrated-bezel",
  appliesTo: ["case", "bezelInsert", "bezel"],
  evaluate(build, catalog): Finding[] {
    const caseP = getPart(build, catalog, "case");
    if (!caseP || caseP.attributes.integratedBezel !== true) return [];
    const findings: Finding[] = [];
    for (const [slot, what] of [["bezelInsert", "bezel insert"], ["bezel", "bezel"]] as [SlotKey, string][]) {
      const p = getPart(build, catalog, slot);
      if (!p) continue;
      findings.push({
        ruleKey: "integrated-bezel",
        severity: "error",
        message: `"${caseP.name}" has its bezel built into the case, so there's nowhere to fit "${p.name}". The vendor lists what does fit -- crowns, casebacks, dials and hands -- and a separate ${what} isn't among them.`,
        slots: ["case", slot],
        fix: `Remove the ${what}: this case's bezel is part of the case.`,
      });
    }
    return findings;
  },
};
