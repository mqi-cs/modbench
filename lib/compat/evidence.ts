import type { Build, CatalogSlice, EvidenceTier, Finding, Rule } from "./types";
import { getPart } from "./types";

// Rules backed by at least one real bad build whose sourceQuote is the
// seller's own words (data/fixtures/known-builds.json, `evidences`). Only
// these may block a build. known-builds.test.ts fails if this set and the
// fixtures disagree, in either direction.
//
// Not here, so their errors show as warnings (specs/08-DEFERRED.md D11):
//   date-window-alignment -- no dial in the catalog states its cutout
//     position, so no real bad build can be built for it yet.
//   dial-case-diameter -- every dial in the catalog is recorded at 28.5mm;
//     the two 29.5mm chronograph dials aren't yet recorded as such.
export const VERIFIED_RULES: ReadonlySet<string> = new Set([
  "bezel-case-fit",
  "bracelet-vendor-scope",
  "crown-case-fit",
  "crystal-case-fit",
  "day-window-presence",
  "dial-case-model-exclusion",
  "dial-movement-feet",
  "family-exception",
  "insert-case-fit",
  "insert-crystal-profile-fit",
  "movement-case-fit",
  "requires-chapter-ring",
  "strap-fit",
]);

// Sources whose every value is someone else's claim, not the vendor's.
const OUTSIDE_CATALOG = new Set(["marketplace-stated", "user-entered"]);

const CHECKED_NOTE =
  " (Shown as a warning, not a block: this check hasn't yet been confirmed by a real mismatched build with the seller's own words behind it.)";
const UNCONFIRMED_NOTE =
  " (Unconfirmed: this rests on information the seller didn't publish for this exact part, so it's a warning rather than a block.)";

// The one place a finding's tier is decided, and the only place a rule's
// error can be turned into a warning. Rules state what they found; this
// states how much that finding can be trusted.
export function withEvidence(rule: Rule, finding: Finding, build: Build, catalog: CatalogSlice): Finding {
  const unconfirmed = finding.slots.some((slot) => {
    const part = getPart(build, catalog, slot);
    if (!part) return false;
    if (OUTSIDE_CATALOG.has(part.specSource)) return true;
    return part.specSource === "family-inferred" && (rule.familyDecides?.includes(slot) ?? false);
  });
  const tier: EvidenceTier = unconfirmed ? "unconfirmed" : VERIFIED_RULES.has(rule.key) ? "verified" : "checked";
  if (finding.severity === "error" && tier !== "verified") {
    return { ...finding, severity: "warning", tier, message: finding.message + (tier === "unconfirmed" ? UNCONFIRMED_NOTE : CHECKED_NOTE) };
  }
  return { ...finding, tier };
}
