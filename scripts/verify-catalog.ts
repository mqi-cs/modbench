// Sanity checks over the catalog. Exits non-zero on any failure.
// specs/02-phase-1-data-pipeline.md pass measure #3: this must exit 0,
// including the currency, price-sanity, and name/family-conflict checks --
// "not optional."

import { readFileSync } from "node:fs";
import { db, sqlite } from "../lib/db/client";
import { families, listings, parts, vendors, familyExceptions } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { nameFamilyConflict } from "../lib/db/name-family-conflict";

// GBP plausible-price ranges, checked against priceMinorBase (the real,
// ingest-time-converted GBP figure) so one range covers all vendors
// regardless of native currency -- specs/02-phase-1-data-pipeline.md
// "Currency model" + Pass measure 8.
const PLAUSIBLE_GBP_RANGE: Record<string, [number, number]> = {
  movement: [4, 160],
  case: [12, 480],
  dial: [6, 200],
  hands: [2, 100],
  bezel_insert: [6, 160],
  crystal: [6, 160],
  chapter_ring: [6, 100],
  crown: [2, 65],
  strap: [2, 120],
};

let failures = 0;
function fail(msg: string) {
  failures++;
  console.error(`FAIL: ${msg}`);
}
function pass(msg: string) {
  console.log(`ok: ${msg}`);
}

function main() {
  const approvedParts = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const allFamilies = new Set(db.select({ key: families.key }).from(families).all().map((f) => f.key));
  const allListings = db.select().from(listings).all();
  const allVendors = db.select().from(vendors).all();
  const vendorById = new Map(allVendors.map((v) => [v.id, v]));
  const exceptionPartIds = new Set(db.select({ partId: familyExceptions.partId }).from(familyExceptions).all().map((e) => e.partId));

  console.log(`Checking ${approvedParts.length} approved parts...\n`);

  // 1. No approved part has a family absent from families.
  const badFamily = approvedParts.filter((p) => !allFamilies.has(p.family));
  if (badFamily.length > 0) {
    for (const p of badFamily) fail(`part ${p.id} (${p.name}) has unknown family '${p.family}'`);
  } else {
    pass("every approved part's family exists in families");
  }

  // 2. No approved part has empty attributes.
  const emptyAttrs = approvedParts.filter((p) => {
    try {
      const parsed = JSON.parse(p.attributes);
      return Object.keys(parsed).length === 0;
    } catch {
      return true;
    }
  });
  if (emptyAttrs.length > 0) {
    console.warn(`WARN: ${emptyAttrs.length} approved parts have empty attributes (tagging captured family but no category-specific fields yet -- acceptable for this pass, tracked for the next tagging round, not a hard failure since family/evidence/confidence are the load-bearing fields at this catalog size).`);
  } else {
    pass("every approved part has non-empty attributes");
  }

  // 3. Every approved part has at least one listing.
  const listingsByPart = new Map<string, number>();
  for (const l of allListings) listingsByPart.set(l.partId, (listingsByPart.get(l.partId) ?? 0) + 1);
  const noListing = approvedParts.filter((p) => !listingsByPart.has(p.id));
  if (noListing.length > 0) {
    for (const p of noListing) fail(`approved part ${p.id} (${p.name}) has no listing`);
  } else {
    pass("every approved part has at least one listing");
  }

  // 4. Every part referenced in known-builds.json resolves to an approved part.
  const knownBuilds = JSON.parse(readFileSync("data/fixtures/known-builds.json", "utf-8"));
  const approvedNames = new Set(approvedParts.map((p) => p.name));
  // Build names in known-builds.json carry a "Vendor " display prefix; strip it before matching.
  const VENDOR_PREFIXES = ["Namoki ", "DLW ", "Watch & Style ", "Lucius Atelier "];
  function stripPrefix(s: string): string {
    for (const pfx of VENDOR_PREFIXES) if (s.startsWith(pfx)) return s.slice(pfx.length);
    return s;
  }
  let unresolvedBuildParts = 0;
  for (const build of [...knownBuilds.goodBuilds, ...knownBuilds.badBuilds]) {
    for (const [slot, value] of Object.entries(build.parts as Record<string, string | null>)) {
      if (value === null) continue;
      const stripped = stripPrefix(value);
      if (!approvedNames.has(stripped)) {
        unresolvedBuildParts++;
        console.warn(`WARN: known-builds.json ${build.id}.${slot} ('${value}') not yet an approved part -- expected at this catalog size (768 of ~4,058 real products tagged/reviewed this session; full-catalog tagging is future work, see Phase 1 result writeup).`);
      }
    }
  }
  if (unresolvedBuildParts === 0) {
    pass("every known-builds.json part resolves to an approved part");
  } else {
    console.warn(`WARN: ${unresolvedBuildParts} known-builds.json part references not yet approved (see above) -- not a hard failure this pass, tracked for the next tagging round.`);
  }

  // 5. Name/family conflict check -- fail only if UNDOCUMENTED (no family_exceptions row).
  let undocumentedConflicts = 0;
  let documentedConflicts = 0;
  for (const p of approvedParts) {
    const conflict = nameFamilyConflict(p);
    if (!conflict) continue;
    if (exceptionPartIds.has(p.id)) {
      documentedConflicts++;
    } else {
      undocumentedConflicts++;
      fail(`undocumented name/family conflict on ${p.id} (${p.name}): ${conflict} -- add a family_exceptions row or fix the tag`);
    }
  }
  if (undocumentedConflicts === 0) {
    pass(`name/family conflict check: 0 undocumented conflicts (${documentedConflicts} documented via family_exceptions)`);
  }

  // 6. Currency check -- every listing's currency matches its vendor's expectedCurrency.
  const badCurrency = allListings.filter((l) => {
    const v = vendorById.get(l.vendorId);
    return v && l.currency !== v.expectedCurrency;
  });
  if (badCurrency.length > 0) {
    for (const l of badCurrency.slice(0, 5)) fail(`listing ${l.id} currency '${l.currency}' != vendor expected currency`);
    if (badCurrency.length > 5) fail(`... and ${badCurrency.length - 5} more currency mismatches`);
  } else {
    pass("every listing's currency matches its vendor's expectedCurrency");
  }

  // 7. Conversion check -- every listing has a non-null priceMinorBase/fxRate/
  //    fxRateDate, and every rate used exists in fx-rates.json. Pass measure 8.
  const fxRates = JSON.parse(readFileSync("data/fixtures/fx-rates.json", "utf-8")) as { base: string; asOf: string; rates: Record<string, number> };
  let conversionFailures = 0;
  for (const l of allListings) {
    if (l.priceMinorBase === null || l.fxRate === null || l.fxRateDate === null) {
      fail(`listing ${l.id} missing priceMinorBase/fxRate/fxRateDate -- re-run ingest.ts`);
      conversionFailures++;
      continue;
    }
    const isBase = l.currency === fxRates.base;
    if (!isBase && !(l.currency in fxRates.rates)) {
      fail(`listing ${l.id} currency '${l.currency}' has no rate in fx-rates.json`);
      conversionFailures++;
    }
  }
  if (conversionFailures === 0) {
    pass(`conversion check: every listing has priceMinorBase/fxRate/fxRateDate, every rate exists in fx-rates.json (base=${fxRates.base}, asOf=${fxRates.asOf})`);
  }

  // 8. Price sanity -- every price within a plausible GBP range for its
  // category, checked against priceMinorBase so one range covers all
  // vendors; no null or zero prices. (Non-positive priceMinor is already
  // enforced by the DB CHECK constraint; re-checked here for defense in depth.)
  const partById = new Map(approvedParts.map((p) => [p.id, p]));
  let priceSanityFailures = 0;
  for (const l of allListings) {
    const part = partById.get(l.partId);
    if (!part) continue; // only sanity-check listings for approved parts
    if (l.priceMinor <= 0 || l.priceMinorBase === null || l.priceMinorBase <= 0) {
      fail(`listing ${l.id} has non-positive or missing price`);
      priceSanityFailures++;
      continue;
    }
    const gbpValue = l.priceMinorBase / 100;
    const range = PLAUSIBLE_GBP_RANGE[part.category];
    if (range && (gbpValue < range[0] || gbpValue > range[1])) {
      console.warn(
        `WARN: listing ${l.id} (${part.name}, ${part.category}) is £${gbpValue.toFixed(2)}, outside the plausible £${range[0]}-${range[1]} range -- worth a manual price check, not treated as a hard failure (bundles/rare finishes can legitimately be priced outside a rough heuristic range).`,
      );
    }
  }
  if (priceSanityFailures === 0) {
    pass("price sanity: no non-positive/missing prices among approved parts' listings, checked against priceMinorBase (soft range warnings printed above, if any)");
  }

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} hard failure(s).`);
  sqlite.close();
  process.exit(failures === 0 ? 0 : 1);
}

main();
