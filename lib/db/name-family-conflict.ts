// Amendment C, 01a-PHASE-0-FINDINGS.md: "verify-catalog.ts flags any part
// whose name contains a case or movement designation (SKX007, SKX013,
// SRPD, NH35, NH36) that disagrees with its assigned family. Flagged parts
// go to manual review. This would have caught Ultra Thin automatically."
//
// Shared between scripts/review.ts (routes flagged parts to mandatory
// review) and scripts/verify-catalog.ts (fails the build if any APPROVED
// part still has an unresolved conflict). A flag is a signal, not a
// verdict -- lucius-ultra-thin-case is SUPPOSED to flag here; that's the
// whole point. A human approving it anyway (because they've read the
// family_exceptions row) is the correct outcome, not a bug in the check.

interface ConflictCheckable {
  name: string;
  family: string;
}

const MARKERS: { pattern: RegExp; expectedFamilyPrefix: string }[] = [
  { pattern: /skx007|srpd/i, expectedFamilyPrefix: "skx007-" },
  { pattern: /skx013/i, expectedFamilyPrefix: "skx013-" },
  { pattern: /\bnh35\b/i, expectedFamilyPrefix: "nh3x-" },
  { pattern: /\bnh36\b/i, expectedFamilyPrefix: "nh3x-" },
];

export function nameFamilyConflict(part: ConflictCheckable): string | null {
  for (const { pattern, expectedFamilyPrefix } of MARKERS) {
    if (pattern.test(part.name) && !part.family.startsWith(expectedFamilyPrefix)) {
      return `Name '${part.name}' matches ${pattern} but family is '${part.family}', not '${expectedFamilyPrefix}*'`;
    }
  }
  return null;
}
