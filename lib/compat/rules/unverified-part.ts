import type { Rule, Finding, SlotKey } from "../types";

// Amendment D, 01a-PHASE-0-FINDINGS.md: specSource 'family-inferred' means
// tagged by convention without direct vendor confirmation for this
// specific SKU -- not wrong, just not independently checked. Surfacing it
// here is what "the unverified-part warning rule" (Amendment D's own
// wording) exists to do.
export const unverifiedPart: Rule = {
  key: "unverified-part",
  appliesTo: ["movement", "case", "dial", "hands", "bezelInsert", "bezel", "crystal", "chapterRing", "crown", "strap"],
  evaluate(build, catalog): Finding[] {
    const findings: Finding[] = [];
    for (const [slot, partId] of Object.entries(build.parts) as [SlotKey, string | undefined][]) {
      if (!partId) continue;
      const part = catalog.parts[partId];
      if (!part) continue;
      if (part.specSource === "family-inferred") {
        findings.push({
          ruleKey: "unverified-part",
          severity: "warning",
          message: `"${part.name}" was tagged by family convention, not confirmed against this specific listing's own spec sheet -- the family it belongs to is real and well-established, but this exact SKU hasn't been individually double-checked. It's very likely fine; worth a quick look at the vendor's own page before ordering if you want to be certain.`,
          slots: [slot],
        });
      }
    }
    return findings;
  },
};
