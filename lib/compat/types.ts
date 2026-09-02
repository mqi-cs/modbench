// Pure types for the compatibility engine. No imports from lib/db --
// see specs/03-phase-2-compat-engine.md: "The engine never queries the
// database. That is what makes it testable and what keeps it honest."
// CatalogSlice is plain data the caller assembles from the DB and passes
// in; lib/compat never sees a connection, a row object, or SQL.

export type Severity = "error" | "warning" | "info";

// Mirrors specs/02-phase-1-data-pipeline.md's CATEGORIES, redefined here
// (not imported from lib/db/schema) to keep this module free of any DB
// dependency. bezelInsert/chapterRing are camelCase here since these are
// Build slot keys, not DB column names.
export type SlotKey =
  | "movement"
  | "case"
  | "dial"
  | "hands"
  | "bezelInsert"
  | "bezel"
  | "crystal"
  | "chapterRing"
  | "crown"
  | "strap";

export interface Finding {
  ruleKey: string;
  severity: Severity;
  message: string; // plain language, addressed to a beginner, two layers (see 03-phase-2-compat-engine.md)
  slots: SlotKey[]; // which selections this concerns
  fix?: string; // what to do about it
}

export interface PartRef {
  slot: SlotKey;
  family: string;
  reason: string; // why this addition is required
}

export type ToolKey =
  | "blower"
  | "gloves"
  | "dust-cover"
  | "dial-feet-cutter"
  | "dial-dots"
  | "hand-press"
  | "hand-removal-levers"
  | "case-back-opener"
  | "movement-holder"
  | "spring-bar-tool"
  | "bezel-insert-tool";

export interface BuildResult {
  findings: Finding[];
  requiredAdditions: PartRef[]; // e.g. a movement spacer
  requiredTools: ToolKey[];
  status: "ok" | "ok-with-warnings" | "blocked";
}

// A build is a set of chosen part ids, one per slot at most. Slots the
// person hasn't filled in yet are simply absent -- rules must tolerate a
// partially-filled build without throwing (the property test enforces
// this over 1,000 random pairs).
export interface Build {
  parts: Partial<Record<SlotKey, string>>; // slot -> CatalogPart id
}

export interface CatalogPart {
  id: string;
  slot: SlotKey;
  family: string;
  name: string;
  attributes: Record<string, unknown>;
  specSource: "vendor-stated" | "family-inferred" | "manual";
  confidence: "high" | "medium" | "low";
}

export interface CatalogFamilyException {
  partId: string;
  ruleKey: string;
  severity: Severity;
  message: string;
}

export interface CatalogListing {
  partId: string;
  vendorKey: string;
  priceMinorBase: number;
  shippingFlatMinor: number;
  inStock: boolean;
}

export interface CatalogSlice {
  parts: Record<string, CatalogPart>; // keyed by id
  familyExceptions: CatalogFamilyException[];
  listings: CatalogListing[];
  // Optional precomputed index of listings by partId. Purely a
  // performance affordance: the two commerce rules otherwise scan the
  // whole listings array on every call, which the configurator does
  // hundreds of times per keystroke (once per candidate part in the
  // active slot). Still plain data supplied by the caller -- lib/compat
  // never builds or mutates it -- and every rule falls back to filtering
  // when it is absent, so behaviour is identical either way.
  listingsByPart?: Record<string, CatalogListing[]>;
}

// Every rule that needs a part's listings goes through here, so the
// indexed and unindexed paths can't drift apart.
export function listingsFor(catalog: CatalogSlice, partId: string): CatalogListing[] {
  const index = catalog.listingsByPart;
  // Object.hasOwn, not `?.[id] ??`: for an id like "constructor" a bare
  // lookup returns Object itself, which isn't nullish, so the fallback
  // never ran and .reduce was called on a function.
  if (index && Object.hasOwn(index, partId)) return index[partId] ?? [];
  return catalog.listings.filter((l) => l.partId === partId);
}

// The one safe way to resolve a part id against the catalog. Ids can come
// from a URL, so an id like "__proto__" must not resolve to something
// inherited from Object.prototype.
export function partById(catalog: CatalogSlice, partId: string): CatalogPart | null {
  if (!Object.hasOwn(catalog.parts, partId)) return null;
  return catalog.parts[partId] ?? null;
}

export interface Rule {
  key: string;
  appliesTo: SlotKey[];
  evaluate(build: Build, catalog: CatalogSlice): Finding[];
}

// Small helper every rule uses to look up a slot's selected part, if any.
// Centralised so "no part selected for this slot" and "part id doesn't
// resolve in the catalog" (which should never happen with a well-formed
// CatalogSlice, but the property test fuzzes exactly this) are handled
// identically everywhere -- a rule never crashes on either.
export function getPart(build: Build, catalog: CatalogSlice, slot: SlotKey): CatalogPart | null {
  const id = build.parts[slot];
  if (!id) return null;
  // Object.hasOwn rather than a bare lookup: `parts` is a plain object, so
  // ids like "__proto__" or "constructor" would otherwise resolve to
  // something inherited from Object.prototype and hand a rule an object
  // that isn't a part at all.
  return partById(catalog, id);
}
