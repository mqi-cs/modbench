import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// A dial larger than the case's own aperture physically rubs the case
// wall or won't seat flat -- an unambiguous error. A dial noticeably
// smaller leaves a visible gap around the edge; unsightly, but the dial
// still seats and the movement still runs, so that's a warning, not a
// block. The tolerance band (0.3mm over, 2mm under) is a real mechanical
// margin, not an arbitrary number: dial feet placement and case aperture
// both have manufacturing tolerance in this range in practice.
const OVERSIZE_TOLERANCE_MM = 0.3;
const VISIBLE_GAP_MM = 2;

export const dialCaseDiameter: Rule = {
  key: "dial-case-diameter",
  appliesTo: ["dial", "case"],
  evaluate(build, catalog): Finding[] {
    const dial = getPart(build, catalog, "dial");
    const caseP = getPart(build, catalog, "case");
    if (!dial || !caseP) return [];

    const dialMm = dial.attributes.diameterMm as number | null | undefined;
    const apertureMm = caseP.attributes.dialApertureMm as number | null | undefined;
    if (typeof dialMm !== "number" || typeof apertureMm !== "number") {
      return [
        {
          ruleKey: "dial-case-diameter",
          severity: "warning",
          message: `Can't confirm "${dial.name}" fits inside "${caseP.name}"'s dial aperture -- one of the two diameters isn't recorded for this specific listing. Dial size within the case opening is what keeps the dial from rubbing the case wall or leaving a visible gap, so it's worth checking the vendor's stated dimensions before ordering.`,
          slots: ["dial", "case"],
        },
      ];
    }

    if (dialMm > apertureMm + OVERSIZE_TOLERANCE_MM) {
      return [
        {
          ruleKey: "dial-case-diameter",
          severity: "error",
          message: `"${dial.name}" is ${dialMm}mm across, but "${caseP.name}"'s dial aperture is only ${apertureMm}mm -- the dial physically will not sit flat inside this case, it'll rub against the case wall or the aperture's inner lip. The dial has to be smaller than or equal to the opening it drops into, the same way a coaster has to be smaller than the cup it sits in.`,
          slots: ["dial", "case"],
        },
      ];
    }

    if (apertureMm - dialMm > VISIBLE_GAP_MM) {
      return [
        {
          ruleKey: "dial-case-diameter",
          severity: "warning",
          message: `"${dial.name}" is ${dialMm}mm across, noticeably smaller than "${caseP.name}"'s ${apertureMm}mm dial aperture -- it'll still seat and the movement will still run, but you'll see a visible gap around the edge of the dial once it's built. Not a fitment failure, just a cosmetic one worth knowing about before you order.`,
          slots: ["dial", "case"],
        },
      ];
    }

    return [];
  },
};
