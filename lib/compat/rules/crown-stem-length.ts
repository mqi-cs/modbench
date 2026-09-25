import type { Rule, Finding } from "../types";
import { getPart } from "../types";

// WS1 step 3: "can the tool say whether a stem needs cutting?" No -- no
// crown or case listing in the catalog states a stem length, so the most
// the engine can honestly do is say the check exists and can't be undone.
// Info only; it never blocks and never guesses a length.
export const crownStemLength: Rule = {
  key: "crown-stem-length",
  appliesTo: ["crown", "case"],
  evaluate(build, catalog): Finding[] {
    const crown = getPart(build, catalog, "crown");
    const caseP = getPart(build, catalog, "case");
    if (!crown || !caseP) return [];
    return [
      {
        ruleKey: "crown-stem-length",
        severity: "info",
        message: `No listing states the stem length for "${crown.name}" in "${caseP.name}". A replacement crown often has to have its stem cut to length for the case -- measure against the old stem first and cut a little at a time, because a stem cut too short can't be lengthened again.`,
        slots: ["crown", "case"],
      },
    ];
  },
};
