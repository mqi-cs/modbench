import type { Rule, Finding } from "../types";
import type { CatalogListing } from "../types";
import { listingsFor } from "../types";

function cheapestListing(listings: CatalogListing[]): CatalogListing | null {
  if (listings.length === 0) return null;
  return listings.reduce((best, l) => (l.priceMinorBase < best.priceMinorBase ? l : best));
}

export const multiVendorShipping: Rule = {
  key: "multi-vendor-shipping",
  appliesTo: ["movement", "case", "dial", "hands", "bezelInsert", "bezel", "crystal", "chapterRing", "crown", "strap"],
  evaluate(build, catalog): Finding[] {
    const vendorsUsed = new Set<string>();
    let partsWithNoListing = 0;
    for (const partId of Object.values(build.parts)) {
      if (!partId) continue;
      const listings = listingsFor(catalog, partId);
      const cheapest = cheapestListing(listings);
      if (cheapest) vendorsUsed.add(cheapest.vendorKey);
      else partsWithNoListing++;
    }

    // Was a silent undercount: parts with no listing data simply didn't
    // contribute a vendor, so a genuinely 3-vendor build could look like a
    // 2-vendor one and this rule would say nothing at all.
    if (partsWithNoListing > 0) {
      return [
        {
          ruleKey: "multi-vendor-shipping",
          severity: "info",
          message: `Can't work out how many vendors this build spans -- ${partsWithNoListing} of the selected parts have no vendor listing data attached. Shipping consolidation is usually the biggest single lever on a cross-vendor build's total cost, so it's worth checking manually which vendors you'd actually be ordering from.`,
          slots: [],
        },
      ];
    }

    if (vendorsUsed.size >= 3) {
      return [
        {
          ruleKey: "multi-vendor-shipping",
          severity: "info",
          message: `This build spans ${vendorsUsed.size} vendors, so you're paying separate shipping to each one. Check whether a same-vendor swap for one or two parts (even at a slightly higher price) saves more in shipping than it costs -- consolidating orders is usually the single biggest lever on total cost for a cross-vendor build.`,
          slots: [],
        },
      ];
    }
    return [];
  },
};
