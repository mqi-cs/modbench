import "server-only";
import { loadCatalog, type CatalogPayload } from "./catalog";
import { computeTotals, type BuildTotals } from "./pricing";
import { evaluateBuild, familyPlatform, type Build, type BuildResult, type CatalogSlice, type SlotKey } from "./compat";
import { decodePreviewable } from "./preview/previewable";
import { resolveLayers, type PreviewLayer } from "./preview/composite";
import { DEFAULT_PLATFORM, PLATFORM_GEOMETRY } from "./preview/layers";
import { SLOT_PARAM } from "../components/build/url-state";

// Everything a read-only build page needs, assembled once on the server.
// Shared by /b/[id] and /styles/[slug] so the two cannot drift: a style
// page and a saved build are the same object with different provenance.

export interface BuildView {
  build: Build;
  result: BuildResult;
  totals: BuildTotals;
  layers: PreviewLayer[];
  catalog: CatalogPayload;
  slice: CatalogSlice;
  /** Slot ids that could not be resolved, e.g. a fixture naming a stale part. */
  unresolved: SlotKey[];
}

export function catalogSlice(catalog: CatalogPayload): CatalogSlice {
  const shipping = new Map(catalog.vendors.map((v) => [v.key, v.shippingMinorBase]));
  const listings = catalog.listings.map((l) => ({
    partId: l.partId,
    vendorKey: l.vendorKey,
    priceMinorBase: l.priceMinorBase,
    shippingFlatMinor: shipping.get(l.vendorKey) ?? 0,
    inStock: l.inStock,
  }));
  const listingsByPart: Record<string, typeof listings> = {};
  for (const l of listings) (listingsByPart[l.partId] ??= []).push(l);
  return { parts: catalog.parts, familyExceptions: catalog.familyExceptions, listings, listingsByPart };
}

/** Resolves part NAMES to ids. Fixtures reference names because ids are regenerated on every rebuild. */
export function resolveByName(catalog: CatalogPayload, partNames: Partial<Record<SlotKey, string>>): { parts: Partial<Record<SlotKey, string>>; unresolved: SlotKey[] } {
  const byName = new Map(Object.values(catalog.parts).map((p) => [p.name, p.id]));
  const parts: Partial<Record<SlotKey, string>> = {};
  const unresolved: SlotKey[] = [];
  for (const [slot, name] of Object.entries(partNames) as [SlotKey, string][]) {
    const id = byName.get(name);
    if (id) parts[slot] = id;
    else unresolved.push(slot);
  }
  return { parts, unresolved };
}

export function buildView(parts: Partial<Record<SlotKey, string>>, unresolved: SlotKey[] = []): BuildView {
  const catalog = loadCatalog();
  const slice = catalogSlice(catalog);
  const build: Build = { parts };
  const result = evaluateBuild(build, slice);
  const totals = computeTotals(build, catalog.listings, catalog.vendors, result.requiredTools, true);

  const caseFamily = parts.case ? catalog.parts[parts.case]?.family : undefined;
  const platform = caseFamily ? familyPlatform(caseFamily) : null;
  const layers = resolveLayers({
    parts: parts as Partial<Record<string, string>>,
    previewable: decodePreviewable(Object.keys(catalog.parts), catalog.previewable),
    names: Object.fromEntries(Object.entries(catalog.parts).map(([id, p]) => [id, p.name])),
    platform: platform && platform in PLATFORM_GEOMETRY ? platform : DEFAULT_PLATFORM,
    hasCase: Boolean(parts.case),
  });

  return { build, result, totals, layers, catalog, slice, unresolved };
}

/**
 * The query string that reopens this build in the configurator.
 *
 * Uses the configurator's own SLOT_PARAM map rather than deriving names
 * from the slot keys: the two differ (bezelInsert is "insert",
 * chapterRing is "chapter"), and a link built from the wrong names would
 * open an empty configurator while looking perfectly valid.
 */
export function configuratorHref(parts: Partial<Record<SlotKey, string>>): string {
  const qs = new URLSearchParams();
  for (const [slot, id] of Object.entries(parts) as [SlotKey, string][]) {
    if (id) qs.set(SLOT_PARAM[slot], id);
  }
  return `/build?${qs.toString()}`;
}
