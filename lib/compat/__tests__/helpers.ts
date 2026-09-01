// Minimal hand-built fixtures for per-rule unit tests. Deliberately does
// NOT touch the database: a rule test should fail because the rule is
// wrong, not because the catalog changed underneath it.
import type { Build, CatalogListing, CatalogPart, CatalogSlice, SlotKey } from "../types";

let seq = 0;

export function part(slot: SlotKey, family: string, attributes: Record<string, unknown> = {}, over: Partial<CatalogPart> = {}): CatalogPart {
  return {
    id: `p${++seq}`,
    slot,
    family,
    name: over.name ?? `test-${slot}-${seq}`,
    attributes,
    specSource: over.specSource ?? "vendor-stated",
    confidence: over.confidence ?? "high",
    ...over,
  };
}

export function catalogOf(parts: CatalogPart[], extra: Partial<CatalogSlice> = {}): CatalogSlice {
  const byId: Record<string, CatalogPart> = {};
  for (const p of parts) byId[p.id] = p;
  return {
    parts: byId,
    familyExceptions: extra.familyExceptions ?? [],
    // Default: give every part one cheap, in-stock listing at one vendor,
    // so commerce rules don't fire incidentally in unrelated rule tests.
    listings:
      extra.listings ??
      parts.map<CatalogListing>((p) => ({ partId: p.id, vendorKey: "v1", priceMinorBase: 1000, shippingFlatMinor: 500, inStock: true })),
  };
}

export function buildOf(parts: CatalogPart[]): Build {
  const b: Build = { parts: {} };
  for (const p of parts) b.parts[p.slot] = p.id;
  return b;
}

export function keys(findings: { ruleKey: string }[]): string[] {
  return findings.map((f) => f.ruleKey);
}

export function severities(findings: { severity: string }[]): string[] {
  return findings.map((f) => f.severity);
}
