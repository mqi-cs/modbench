import type { Rule, Finding, SlotKey } from "../types";
import type { CatalogListing } from "../types";

function cheapestListing(listings: CatalogListing[]): CatalogListing | null {
  if (listings.length === 0) return null;
  return listings.reduce((best, l) => (l.priceMinorBase < best.priceMinorBase ? l : best));
}

export const stockAvailability: Rule = {
  key: "stock-availability",
  appliesTo: ["movement", "case", "dial", "hands", "bezelInsert", "bezel", "crystal", "chapterRing", "crown", "strap"],
  evaluate(build, catalog): Finding[] {
    const findings: Finding[] = [];
    for (const [slot, partId] of Object.entries(build.parts) as [SlotKey, string | undefined][]) {
      if (!partId) continue;
      const part = catalog.parts[partId];
      if (!part) continue;
      const listings = catalog.listings.filter((l) => l.partId === partId);
      const cheapest = cheapestListing(listings);
      if (!cheapest) {
        // Was a silent skip. A part with no listing data at all isn't
        // "in stock", it's unknown -- say so rather than leaving the
        // caller to assume it was checked.
        findings.push({
          ruleKey: "stock-availability",
          severity: "info",
          message: `No vendor listing data is available for "${part.name}", so its price and stock status couldn't be checked. Doesn't affect whether the parts fit -- but worth confirming it's actually orderable before planning the rest of the build around it.`,
          slots: [slot],
        });
        continue;
      }
      if (!cheapest.inStock) {
        const cheaperInStock = listings.find((l) => l.inStock);
        findings.push({
          ruleKey: "stock-availability",
          severity: "info",
          message: cheaperInStock
            ? `"${part.name}" is out of stock at its cheapest listed vendor -- it's available from another vendor for more, or you can wait for restock.`
            : `"${part.name}" is currently out of stock at every vendor listing it. Not a fitment problem, just worth checking before you commit the rest of the build around it.`,
          slots: [slot],
        });
      }
    }
    return findings;
  },
};
