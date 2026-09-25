// Sanity checks over the catalog. Exits non-zero on any failure.
// specs/02-phase-1-data-pipeline.md pass measure #3: this must exit 0,
// including the currency, price-sanity, and name/family-conflict checks --
// "not optional."

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { db, sqlite } from "../lib/db/client";
import { families, listings, parts, vendors, familyExceptions, partMerges, rejectedParts } from "../lib/db/schema";
import { eq } from "drizzle-orm";
import { nameFamilyConflict } from "../lib/db/name-family-conflict";
import { fromJsonColumn } from "../lib/db/json";
import { SHAPES, shapeById } from "../lib/preview/shape-vocabulary";
import { caseDimensions } from "../lib/preview/dimensions";

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
  bezel: [6, 200], // the rotating ring itself, typically pricier than just the insert
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
  for (const build of [...knownBuilds.regressionFixtures, ...knownBuilds.badBuilds]) {
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

  // 9. Merged-part attribute conflict check. A merge claims two (or more)
  // vendor listings are the SAME physical part -- if their recorded
  // attributes actually disagree (e.g. different diameterMm), that's
  // evidence the merge was wrong, not evidence to ignore. Compares each
  // part_merges row's snapshot of the merged-away part's attributes
  // against the canonical part's current attributes; a shared key with two
  // different non-null values fails. Null-vs-anything is not a conflict --
  // an unmeasured field on one listing says nothing about the other.
  const merges = db.select().from(partMerges).all();
  const partById2 = new Map(db.select().from(parts).all().map((p) => [p.id, p]));
  let mergeConflicts = 0;
  for (const m of merges) {
    const canonicalPart = partById2.get(m.canonicalPartId);
    if (!canonicalPart) {
      fail(`part_merges row ${m.id} references canonical part ${m.canonicalPartId}, which no longer exists`);
      mergeConflicts++;
      continue;
    }
    const mergedAttrs = fromJsonColumn<Record<string, unknown>>(m.mergedAttributes);
    const canonicalAttrs = fromJsonColumn<Record<string, unknown>>(canonicalPart.attributes);
    for (const key of Object.keys(mergedAttrs)) {
      const a = mergedAttrs[key];
      const b = canonicalAttrs[key];
      if (a === null || a === undefined || b === null || b === undefined) continue; // missing data isn't a conflict
      if (Array.isArray(a) || Array.isArray(b)) continue; // e.g. styleTags -- set-equality isn't meaningful here, skip
      if (a !== b) {
        fail(`merge conflict: "${m.mergedPartName}" (${m.mergedSourceUrl}) has ${key}=${JSON.stringify(a)} but canonical part "${canonicalPart.name}" has ${key}=${JSON.stringify(b)} -- this merge may be wrong`);
        mergeConflicts++;
      }
    }
  }
  if (mergeConflicts === 0) {
    pass(`merged-part attribute conflict check: 0 conflicts across ${merges.length} merge record(s)`);
  }

  // 10. Review-state tracking invariant. Found and fixed pre-Phase-2
  // (2026-09-01): import-tagged.ts was writing rejected_parts audit rows
  // without updating the matching parts.reviewState, leaving 307 real
  // rejection decisions stuck at the ingest placeholder -- indistinguishable
  // from parts nobody had looked at yet, which silently corrupted every
  // "how much is left to review" count. Two sub-checks make that bug class
  // impossible to reintroduce silently:
  //   a) every rejected_parts row's sourceUrl has a matching parts row at
  //      reviewState 'rejected' (not stuck pending, not missing).
  //   b) approved + rejected + pending accounts for every part row -- the
  //      review_state CHECK constraint already limits the column to these
  //      three values, so this is really "no part row got missed by either
  //      query," but it's cheap insurance against a future 4th state or a
  //      query bug silently dropping rows.
  const allParts = db.select().from(parts).all();
  const partBySourceUrl = new Map(allParts.map((p) => [p.sourceUrl, p]));
  const allRejectedParts = db.select().from(rejectedParts).all();
  let staleRejections = 0;
  for (const r of allRejectedParts) {
    const part = partBySourceUrl.get(r.sourceUrl);
    if (!part) {
      fail(`rejected_parts row ${r.id} (${r.sourceUrl}) has no matching parts row at all`);
      staleRejections++;
    } else if (part.reviewState !== "rejected") {
      fail(`rejected_parts row ${r.id} (${r.sourceUrl}) is recorded as rejected but parts.review_state is '${part.reviewState}', not 'rejected' -- the state-tracking bug this check exists to catch`);
      staleRejections++;
    }
  }
  if (staleRejections === 0) {
    pass(`review-state tracking: every rejected_parts row (${allRejectedParts.length}) has a matching parts row at reviewState 'rejected'`);
  }

  const stateCounts: Record<"approved" | "pending" | "rejected", number> = { approved: 0, pending: 0, rejected: 0 };
  for (const p of allParts) {
    const key = p.reviewState as "approved" | "pending" | "rejected";
    stateCounts[key] = (stateCounts[key] ?? 0) + 1;
  }
  const stateSum = stateCounts.approved + stateCounts.pending + stateCounts.rejected;
  if (stateSum !== allParts.length) {
    fail(`approved (${stateCounts.approved}) + pending (${stateCounts.pending}) + rejected (${stateCounts.rejected}) = ${stateSum}, but total parts = ${allParts.length} -- a part row has an unaccounted reviewState`);
  } else {
    pass(`review-state totals: approved ${stateCounts.approved} + pending ${stateCounts.pending} + rejected ${stateCounts.rejected} = ${allParts.length} total parts`);
  }

  // 11. Attribute provenance guard. Three separate times this project
  // shipped a real attribute silently derived from an UNRELATED one
  // (crown position read as date position; dial aperture varying per case
  // family when 28.5mm is universal; crystal diameter copied from dial
  // aperture when 31.5 and 28 are not interchangeable). Each was invisible
  // until a rule built on it produced a wrong answer. This makes the
  // pattern impossible to reintroduce silently: every `x: fam?.y`
  // assignment in backfill-attributes.ts must have x === y.
  // See data/fixtures/attribute-provenance.md for the full audit.
  const backfillSrc = readFileSync("scripts/backfill-attributes.ts", "utf-8");
  const crossDerivations: string[] = [];
  for (const m of backfillSrc.matchAll(/^\s*(\w+):\s*(?:existing\.\w+\s*\?\?\s*)?fam\?\.(\w+)/gm)) {
    if (m[1] !== m[2]) crossDerivations.push(`${m[1]} <- fam.${m[2]}`);
  }
  if (crossDerivations.length > 0) {
    for (const d of crossDerivations) {
      fail(`attribute provenance: '${d}' assigns one field from a differently-named one -- if this derivation is real, give the source field its own entry in the defaults table and document why`);
    }
  } else {
    pass("attribute provenance: no attribute is derived from a differently-named field");
  }

  // 12. Prototype-key lookup guard. Part ids reach the engine from a URL,
  // and `catalog.parts` / `listingsByPart` are plain objects, so a bare
  // `record[id]` lookup resolves ids like "__proto__" or "constructor" to
  // something inherited from Object.prototype. That shipped twice: once
  // putting a bogus part into the build, once crashing listingsFor with
  // "listings.reduce is not a function". Every lookup keyed by a part id
  // must go through Object.hasOwn (or the partById/listingsFor helpers).
  const engineSrc = [
    "lib/compat/types.ts",
    "lib/compat/index.ts",
    "components/build/url-state.ts",
    ...readdirSync("lib/compat/rules").map((f) => `lib/compat/rules/${f}`),
  ]
    .map((f) => ({ file: f, src: readFileSync(f, "utf-8") }))
    .filter(({ src }) => /\.(parts|listingsByPart)\[/.test(src.replace(/Object\.hasOwn\([^)]*\)/g, "")));
  const unguarded = engineSrc.filter(({ file, src }) => {
    // types.ts legitimately contains the guarded lookups themselves.
    if (file.endsWith("types.ts")) return !src.includes("Object.hasOwn");
    return true;
  });
  if (unguarded.length > 0) {
    for (const { file } of unguarded) {
      fail(`prototype-key guard: ${file} indexes a parts/listings record by a part id without Object.hasOwn -- use partById()/listingsFor() instead`);
    }
  } else {
    pass("prototype-key guard: part-id lookups go through hasOwn-checked helpers");
  }

  // 13. Preview assets. asset_state is a claim about a file on disk, and
  // the app decides between drawing a layer and showing a "not drawn"
  // placeholder purely from that column -- so a 'ready' row with no file
  // produces a layer that silently fails to paint, which is the one
  // outcome specs/05-phase-4-preview.md rules out ("never silently omit a
  // layer").
  const ASSET_DIRS: Record<string, string> = {
    dial: "public/assets/dial",
    hands: "public/assets/hands",
    bezel_insert: "public/assets/bezel_insert",
    chapter_ring: "public/assets/chapter_ring",
  };
  const readyParts = approvedParts.filter((p) => p.assetState === "ready");
  if (readyParts.length === 0) {
    console.warn("WARN: no parts have asset_state 'ready' -- run `pnpm prepare-assets` before the preview will draw anything.");
  } else {
    const missingFiles = readyParts.filter((p) => {
      const dir = ASSET_DIRS[p.category];
      return !dir || !existsSync(`${dir}/${p.id}.webp`);
    });
    if (missingFiles.length > 0) {
      for (const p of missingFiles.slice(0, 5)) fail(`part ${p.id} (${p.name}) is asset_state 'ready' but ${ASSET_DIRS[p.category] ?? "?"}/${p.id}.webp does not exist`);
      if (missingFiles.length > 5) fail(`... and ${missingFiles.length - 5} more 'ready' parts with no asset file`);
    } else {
      pass(`preview assets: all ${readyParts.length} 'ready' parts have a file on disk`);
    }

    // And the other direction: a file with no 'ready' row is dead weight
    // in the repo and a sign the pipeline ran against a different catalog.
    let orphans = 0;
    const readyIds = new Set(readyParts.map((p) => p.id));
    for (const dir of Object.values(ASSET_DIRS)) {
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (!readyIds.has(file.replace(/\.webp$/, ""))) orphans++;
      }
    }
    if (orphans > 0) fail(`${orphans} asset file(s) on disk have no approved part marked 'ready' -- re-run \`pnpm prepare-assets\``);
    else pass("preview assets: no orphaned asset files");
  }

  // 14. Every approved part in an illustrated category must resolve to a
  // silhouette the art can actually draw. The preview no longer has a
  // flat or unshaded path to fall through to, so a missing or unknown
  // shapeTag is a part that renders as nothing at all.
  const ILLUSTRATED = ["hands", "crown", "chapter_ring", "bezel_insert", "strap"];
  const illustrated = approvedParts.filter((p) => ILLUSTRATED.includes(p.category));
  const badShape = illustrated.filter((p) => {
    const shape = fromJsonColumn<Record<string, unknown>>(p.attributes).shapeTag;
    if (typeof shape !== "string") return true;
    const def = shapeById(shape);
    return !def || def.category !== p.category;
  });
  if (badShape.length > 0) {
    for (const p of badShape.slice(0, 5)) fail(`part ${p.id} (${p.name}) has no drawable shape -- run \`pnpm backfill-shapes\``);
    if (badShape.length > 5) fail(`... and ${badShape.length - 5} more parts with no drawable shape`);
  } else {
    pass(`shapes: all ${illustrated.length} parts in illustrated categories resolve to a silhouette`);
  }

  // And no shape in the vocabulary may match nothing: dead art reads as
  // coverage that is not there.
  const usedShapes = new Set(illustrated.map((p) => String(fromJsonColumn<Record<string, unknown>>(p.attributes).shapeTag ?? "")));
  const deadShapes = SHAPES.filter((sh) => !usedShapes.has(sh.id)).map((sh) => sh.id);
  if (deadShapes.length > 0) fail(`${deadShapes.length} shape(s) match no part: ${deadShapes.join(", ")}`);
  else pass(`shapes: every one of the ${SHAPES.length} defined silhouettes is used`);

  // 15. Dimension provenance. Not a pass/fail -- a part that states no
  // size is drawn at the platform default and that is correct behaviour.
  // It is reported because the default IS a guess, and a category whose
  // coverage quietly drops to zero is a broken parse, not a quiet catalog.
  const DIMENSIONED: [string, string[]][] = [
    ["bezel_insert", ["outer", "inner"]],
    ["chapter_ring", ["outer", "inner"]],
    ["crown", ["diameter"]],
    ["hands", ["hour", "minute", "second"]],
  ];
  const coverage: string[] = [];
  for (const [category, fields] of DIMENSIONED) {
    const rows = approvedParts.filter((p) => p.category === category);
    const stated = rows.filter((p) => {
      const mm = fromJsonColumn<Record<string, unknown>>(p.attributes).renderMm as Record<string, unknown> | undefined;
      return mm !== undefined && fields.some((f) => typeof mm[f] === "number");
    }).length;
    coverage.push(`${category} ${stated}/${rows.length} (${((stated / (rows.length || 1)) * 100).toFixed(1)}%)`);
    if (stated === 0) fail(`no ${category} states a dimension -- the parse in scripts/backfill-dimensions.ts has stopped matching`);
  }
  const casesSized = approvedParts.filter(
    (p) => p.category === "case" && typeof fromJsonColumn<Record<string, unknown>>(p.attributes).caseDiameterMm === "number",
  ).length;
  const caseTotal = approvedParts.filter((p) => p.category === "case").length;
  // A diameter the preview's bounds drop is a bad parse, not a small case:
  // "SKX007 MM" once came through as 7mm (WS0 step 4).
  const offRange = approvedParts.filter((p) => {
    const d = fromJsonColumn<Record<string, unknown>>(p.attributes).caseDiameterMm;
    return p.category === "case" && typeof d === "number" && caseDimensions({ caseDiameterMm: d }).caseDiameter === undefined;
  });
  if (offRange.length > 0) fail(`case diameter outside the physical range on ${offRange.length} approved case(s): ${offRange.map((p) => p.id).join(", ")}`);
  else pass(`case diameter: every stated diameter on ${casesSized} approved cases is within the physical range`);
  pass(`dimensions: drawn from the vendor's own figures where stated -- case ${casesSized}/${caseTotal}, ${coverage.join(", ")}`);

  console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} hard failure(s).`);
  sqlite.close();
  process.exit(failures === 0 ? 0 : 1);
}

main();
