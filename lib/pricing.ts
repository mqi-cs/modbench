// Build totals and — the part that matters strategically — cross-vendor
// shipping consolidation. Per 09-COMPETITIVE-CONTEXT.md this is the
// headline feature, not one bullet of eight: it is the thing a
// single-vendor competitor structurally cannot do.
//
// Pure: takes plain data, returns plain data. No DB, no React.
import type { DisplayListing, VendorInfo } from "./catalog";
import type { Build, SlotKey, ToolKey } from "./compat";
import { getToolCostRange } from "./compat";

export interface VendorGroup {
  vendorKey: string;
  vendorName: string;
  items: { slot: SlotKey; partId: string; listing: DisplayListing }[];
  subtotalMinorBase: number;
  // GBP. Named for the field it came from; converted from the vendor's
  // native shipping charge in loadCatalog.
  shippingFlatMinor: number;
}

export interface ConsolidationSaving {
  slot: SlotKey;
  partId: string;
  fromVendor: string;
  toVendor: string;
  extraPartCostMinor: number; // what the swap costs on the part itself (may be negative)
  shippingSavedMinor: number; // the whole shipping charge that disappears
  netSavingMinor: number;
}

export interface BuildTotals {
  groups: VendorGroup[];
  partsSubtotalMinorBase: number;
  shippingTotalMinor: number;
  toolsMinorLow: number;
  toolsMinorHigh: number;
  grandTotalMinorLow: number;
  grandTotalMinorHigh: number;
  savings: ConsolidationSaving[];
}

// Cheapest in-stock listing for a part, falling back to cheapest overall
// so an out-of-stock part still prices (stock-availability reports it).
function bestListing(listings: DisplayListing[], partId: string): DisplayListing | null {
  const forPart = listings.filter((l) => l.partId === partId);
  if (forPart.length === 0) return null;
  const inStock = forPart.filter((l) => l.inStock);
  const pool = inStock.length > 0 ? inStock : forPart;
  return pool.reduce((best, l) => (l.priceMinorBase < best.priceMinorBase ? l : best));
}

export function computeTotals(
  build: Build,
  listings: DisplayListing[],
  vendors: VendorInfo[],
  tools: ToolKey[],
  includeTools: boolean,
): BuildTotals {
  const vendorByKey = new Map(vendors.map((v) => [v.key, v]));
  const chosen: { slot: SlotKey; partId: string; listing: DisplayListing }[] = [];
  for (const [slot, partId] of Object.entries(build.parts) as [SlotKey, string | undefined][]) {
    if (!partId) continue;
    const listing = bestListing(listings, partId);
    if (listing) chosen.push({ slot, partId, listing });
  }

  const byVendor = new Map<string, typeof chosen>();
  for (const c of chosen) {
    const arr = byVendor.get(c.listing.vendorKey) ?? [];
    arr.push(c);
    byVendor.set(c.listing.vendorKey, arr);
  }

  const groups: VendorGroup[] = [...byVendor.entries()]
    .map(([vendorKey, items]) => ({
      vendorKey,
      vendorName: vendorByKey.get(vendorKey)?.name ?? vendorKey,
      items,
      subtotalMinorBase: items.reduce((s, i) => s + i.listing.priceMinorBase, 0),
      shippingFlatMinor: vendorByKey.get(vendorKey)?.shippingMinorBase ?? 0,
    }))
    .sort((a, b) => b.subtotalMinorBase - a.subtotalMinorBase);

  const partsSubtotalMinorBase = groups.reduce((s, g) => s + g.subtotalMinorBase, 0);
  const shippingTotalMinor = groups.reduce((s, g) => s + g.shippingFlatMinor, 0);

  let toolsMinorLow = 0;
  let toolsMinorHigh = 0;
  if (includeTools) {
    for (const t of tools) {
      const r = getToolCostRange(t);
      toolsMinorLow += r.minGbp * 100;
      toolsMinorHigh += r.maxGbp * 100;
    }
  }

  return {
    groups,
    partsSubtotalMinorBase,
    shippingTotalMinor,
    toolsMinorLow,
    toolsMinorHigh,
    grandTotalMinorLow: partsSubtotalMinorBase + shippingTotalMinor + toolsMinorLow,
    grandTotalMinorHigh: partsSubtotalMinorBase + shippingTotalMinor + toolsMinorHigh,
    savings: findConsolidationSavings(groups, listings),
  };
}

// The differentiator. For every vendor contributing only a few items,
// check whether buying those same parts from a vendor already in the order
// costs less than the shipping charge it would remove. A vendor you're
// buying one £12 part from still costs a full shipping charge -- often
// more than the part.
export function findConsolidationSavings(groups: VendorGroup[], listings: DisplayListing[]): ConsolidationSaving[] {
  if (groups.length < 2) return [];
  const savings: ConsolidationSaving[] = [];

  for (const group of groups) {
    // A group with no items has no shipping to save and nothing to move.
    // Without this the availability loop below passes vacuously and the
    // suggestion references a part that isn't there.
    if (group.items.length === 0) continue;
    const otherVendors = groups.filter((g) => g.vendorKey !== group.vendorKey).map((g) => g.vendorKey);
    // Can every item from this vendor be bought from one single other
    // vendor already in the order? If so this vendor's shipping vanishes.
    for (const target of otherVendors) {
      let extra = 0;
      let allAvailable = true;
      const moves: ConsolidationSaving["slot"][] = [];
      for (const item of group.items) {
        const alt = listings.find((l) => l.partId === item.partId && l.vendorKey === target && l.inStock);
        if (!alt) {
          allAvailable = false;
          break;
        }
        extra += alt.priceMinorBase - item.listing.priceMinorBase;
        moves.push(item.slot);
      }
      if (!allAvailable) continue;
      const net = group.shippingFlatMinor - extra;
      if (net > 0) {
        const first = group.items[0]!;
        savings.push({
          slot: first.slot,
          partId: first.partId,
          fromVendor: group.vendorKey,
          toVendor: target,
          extraPartCostMinor: extra,
          shippingSavedMinor: group.shippingFlatMinor,
          netSavingMinor: net,
        });
        break; // one suggestion per vendor is enough; more is noise
      }
    }
  }

  return savings.sort((a, b) => b.netSavingMinor - a.netSavingMinor);
}
