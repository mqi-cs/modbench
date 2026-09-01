// Test-only infrastructure that reads the real, live catalog to build a
// CatalogSlice fixture for known-builds.test.ts. This file itself imports
// lib/db -- that's fine, it's test setup, not lib/compat's runtime code.
// evaluateBuild() and every rule still only ever see the plain
// CatalogSlice this produces, never a DB handle.
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { familyExceptions, listings, parts, vendors } from "../../db/schema";
import { fromJsonColumn } from "../../db/json";
import type { Build, CatalogSlice, SlotKey } from "../types";

const CATEGORY_TO_SLOT: Record<string, SlotKey> = {
  movement: "movement",
  case: "case",
  dial: "dial",
  hands: "hands",
  bezel_insert: "bezelInsert",
  bezel: "bezel",
  crystal: "crystal",
  chapter_ring: "chapterRing",
  crown: "crown",
  strap: "strap",
};

export function buildCatalogSlice(): CatalogSlice {
  const approvedParts = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const allExceptions = db.select().from(familyExceptions).all();
  const allListings = db.select().from(listings).all();
  const allVendors = db.select().from(vendors).all();
  const vendorById = new Map(allVendors.map((v) => [v.id, v]));

  const catalogParts: CatalogSlice["parts"] = {};
  for (const p of approvedParts) {
    const slot = CATEGORY_TO_SLOT[p.category];
    if (!slot) continue;
    catalogParts[p.id] = {
      id: p.id,
      slot,
      family: p.family,
      name: p.name,
      attributes: fromJsonColumn<Record<string, unknown>>(p.attributes),
      specSource: p.specSource as "vendor-stated" | "family-inferred" | "manual",
      confidence: p.confidence as "high" | "medium" | "low",
    };
  }

  const catalogFamilyExceptions: CatalogSlice["familyExceptions"] = allExceptions.map((e) => ({
    partId: e.partId,
    ruleKey: e.ruleKey,
    severity: e.severity as "error" | "warning" | "info",
    message: e.message,
  }));

  const catalogListings: CatalogSlice["listings"] = allListings
    .filter((l) => catalogParts[l.partId] && l.priceMinorBase !== null)
    .map((l) => {
      const vendor = vendorById.get(l.vendorId);
      return {
        partId: l.partId,
        vendorKey: vendor?.key ?? "unknown",
        priceMinorBase: l.priceMinorBase as number,
        shippingFlatMinor: vendor?.shippingFlatMinor ?? 0,
        inStock: Boolean(l.inStock),
      };
    });

  const listingsByPart: Record<string, typeof catalogListings> = {};
  for (const l of catalogListings) (listingsByPart[l.partId] ??= []).push(l);

  return { parts: catalogParts, familyExceptions: catalogFamilyExceptions, listings: catalogListings, listingsByPart };
}

// known-builds.json fixture parts carry a display vendor prefix ("Namoki
// ...", "DLW ...") that doesn't appear in parts.name -- same stripping
// convention scripts/verify-catalog.ts already uses (check #4).
const VENDOR_PREFIXES = ["Namoki ", "DLW ", "Watch & Style ", "Lucius Atelier "];
function stripPrefix(s: string): string {
  for (const pfx of VENDOR_PREFIXES) if (s.startsWith(pfx)) return s.slice(pfx.length);
  return s;
}

const FIXTURE_SLOT_TO_SLOT: Record<string, SlotKey> = {
  movement: "movement",
  case: "case",
  dial: "dial",
  hands: "hands",
  bezelInsert: "bezelInsert",
  bezel: "bezel",
  crystal: "crystal",
  chapterRing: "chapterRing",
  crown: "crown",
  strap: "strap",
};

// Resolves a known-builds.json fixture's { slot: "display name" } map to a
// real Build (slot -> part id), using the same CatalogSlice a real caller
// would pass to evaluateBuild. Throws loudly if a name doesn't resolve --
// a silent skip here would quietly shrink the fixture set instead of
// failing the test that's supposed to run all of it.
export function resolveBuild(fixtureParts: Record<string, string | null>, catalog: CatalogSlice): Build {
  const byName = new Map<string, string>();
  for (const part of Object.values(catalog.parts)) {
    byName.set(part.name, part.id);
  }

  const build: Build = { parts: {} };
  for (const [fixtureSlot, displayName] of Object.entries(fixtureParts)) {
    if (displayName === null) continue;
    const slot = FIXTURE_SLOT_TO_SLOT[fixtureSlot];
    if (!slot) throw new Error(`Unknown fixture slot '${fixtureSlot}'`);
    const stripped = stripPrefix(displayName);
    const id = byName.get(stripped);
    if (!id) throw new Error(`Fixture part '${displayName}' (stripped: '${stripped}') did not resolve to an approved part`);
    build.parts[slot] = id;
  }
  return build;
}
