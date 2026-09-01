import type { Rule, Finding, SlotKey } from "../types";

// Surfaces every family_exceptions row attached to a selected part
// verbatim -- these are hand-authored, reviewed exceptions (Amendment B,
// 01a-PHASE-0-FINDINGS.md: "the table is load-bearing rather than
// speculative... entered manually before any ingestion runs, with a
// beginner-legible message"), so this rule doesn't rewrite or summarise
// them, just carries the severity and message straight through. This is
// what makes bad-006 (the Ultra Thin case) block: its family_exceptions
// row is severity 'error'. It's also what makes ssk-gmt-crown's
// documented cross-compatibility show as an 'info' note rather than
// nothing, even though crown-case-fit's platform check alone can't know
// that exception exists.
export const familyException: Rule = {
  key: "family-exception",
  appliesTo: ["movement", "case", "dial", "hands", "bezelInsert", "bezel", "crystal", "chapterRing", "crown", "strap"],
  evaluate(build, catalog): Finding[] {
    const findings: Finding[] = [];
    for (const [slot, partId] of Object.entries(build.parts) as [SlotKey, string | undefined][]) {
      if (!partId) continue;
      const part = catalog.parts[partId];
      if (!part) continue;
      for (const exception of catalog.familyExceptions) {
        if (exception.partId !== partId) continue;
        findings.push({
          ruleKey: exception.ruleKey,
          severity: exception.severity,
          message: exception.message,
          slots: [slot],
        });
      }
    }
    return findings;
  },
};
