// Case-shape compatibility is encoded in the family-key naming convention
// itself: every case-shape-dependent category's families are named
// "<platform>-<category-suffix>" (skx007-case, skx007-insert,
// skx007-chapter-ring, ...), where <platform> is the real physical case
// line. This is a direct consequence of the tagging convention adopted in
// scripts/tag-parts.ts and lib/db/name-family-conflict.ts this project
// already relies on (CASE_SHAPE_DEPENDENT_CATEGORIES) -- reusing it here
// rather than inventing a second compatibility scheme means the two stay
// in sync by construction.
//
// Categories NOT covered here (dial, hands, movement, and generic-strap)
// are not case-shape-tied: dial/hands compatibility is driven by the
// movement family (feet convention, pinion), and generic-strap fits by
// lug width regardless of case model (see the "generic-strap" family
// description in scripts/seed.ts).
const CASE_SHAPE_SUFFIXES = ["-case", "-insert", "-crystal", "-chapter-ring", "-crown", "-bezel", "-bracelet"];

// Extracts the platform prefix from a case-shape-dependent family key, or
// null if the family isn't platform-tied at all (generic-strap, every
// movement/dial/hands family). Two families with the same platform are
// built to the same physical interface; two different platforms are not,
// full stop -- a mismatch here is always a real, evidenced error, never a
// guess, because the platform *is* the evidence (it's how the part was
// tagged in the first place, per Amendment A: family is never assigned
// from the name alone without real vendor confirmation).
export function familyPlatform(family: string): string | null {
  for (const suffix of CASE_SHAPE_SUFFIXES) {
    if (family.endsWith(suffix)) return family.slice(0, -suffix.length);
  }
  return null;
}

// True only when both families resolve to a platform and they match.
// False for "no platform on one or both sides" too -- callers that want
// to distinguish "confirmed mismatch" from "can't confirm" (and emit an
// error vs a warning accordingly) should call familyPlatform() themselves
// rather than relying on this alone. See insert-case-diameter.ts for the
// canonical example.
export function platformsMatch(familyA: string, familyB: string): boolean {
  const a = familyPlatform(familyA);
  const b = familyPlatform(familyB);
  return a !== null && b !== null && a === b;
}

export type PlatformCheckResult =
  | { kind: "match" }
  | { kind: "mismatch"; casePlatform: string; partPlatform: string }
  | { kind: "unconfirmed" }; // one or both sides aren't platform-tagged at all

// The one comparison every case-shape rule (insert/crystal/chapter-ring/
// bezel/crown/bracelet) makes, factored out so all six stay in sync by
// construction instead of by six separately-maintained copies of the same
// branch. Callers supply their own beginner-facing message text per kind
// -- what differs between the rules is the noun and the physical
// consequence, not the comparison itself.
export function checkCaseShapeFit(caseFamily: string, partFamily: string): PlatformCheckResult {
  const casePlatform = familyPlatform(caseFamily);
  const partPlatform = familyPlatform(partFamily);
  if (casePlatform === null || partPlatform === null) return { kind: "unconfirmed" };
  if (casePlatform === partPlatform) return { kind: "match" };
  return { kind: "mismatch", casePlatform, partPlatform };
}
