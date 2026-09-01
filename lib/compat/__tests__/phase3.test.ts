// Phase 3 pass measures that can be asserted without a browser.
// Pass measures 2, 5, 7 (end-to-end build, URL round-trip, keyboard) are
// UI walkthroughs and are recorded in the Phase 3 report instead.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateBuild } from "../index";
import { computeTotals, findConsolidationSavings } from "../../pricing";
import { STARTER_BUILDS } from "../../../data/fixtures/starter-builds";
import { buildCatalogSlice, resolveBuild } from "./test-catalog";
import type { Build, SlotKey } from "../types";
import type { DisplayListing, VendorInfo } from "../../catalog";
import { db } from "../../db/client";
import { listings as listingsTable, parts as partsTable, vendors as vendorsTable } from "../../db/schema";
import { eq } from "drizzle-orm";

const catalog = buildCatalogSlice();
const byName = new Map(Object.values(catalog.parts).map((p) => [p.name, p.id]));

// Rebuild the display-listing view the UI uses, from the same DB.
const allVendors = db.select().from(vendorsTable).all();
const vendorById = new Map(allVendors.map((v) => [v.id, v]));
const approvedIds = new Set(
  db.select().from(partsTable).where(eq(partsTable.reviewState, "approved")).all().map((p) => p.id),
);
const displayListings: DisplayListing[] = db
  .select()
  .from(listingsTable)
  .all()
  .filter((l) => approvedIds.has(l.partId) && l.priceMinorBase !== null)
  .map((l) => ({
    partId: l.partId,
    vendorKey: vendorById.get(l.vendorId)?.key ?? "unknown",
    priceMinor: l.priceMinor,
    currency: l.currency,
    priceMinorBase: l.priceMinorBase as number,
    fxRateDate: l.fxRateDate,
    inStock: Boolean(l.inStock),
    sourceUrl: l.sourceUrl,
  }));
const fx = JSON.parse(readFileSync("data/fixtures/fx-rates.json", "utf-8")) as { base: string; rates: Record<string, number> };
const vendorInfos: VendorInfo[] = allVendors.map((v) => {
  const rate = v.expectedCurrency === fx.base ? 1 : (fx.rates[v.expectedCurrency] ?? 1);
  return {
    key: v.key,
    name: v.name,
    shippingFlatMinor: v.shippingFlatMinor,
    currency: v.expectedCurrency,
    shippingMinorBase: Math.round(v.shippingFlatMinor / rate),
    fxRate: rate,
  };
});

function resolveStarter(partNames: Partial<Record<SlotKey, string>>): Build {
  const parts: Build["parts"] = {};
  for (const [slot, name] of Object.entries(partNames) as [SlotKey, string][]) {
    const id = byName.get(name);
    if (id) parts[slot] = id;
  }
  return { parts };
}

describe("pass measure 1 — starter builds", () => {
  it.each(STARTER_BUILDS)("$name resolves fully and is not blocked", (starter) => {
    const build = resolveStarter(starter.partNames);
    // Every named part must resolve -- a starter build silently missing a
    // slot would look fine and teach the wrong thing.
    expect(Object.keys(build.parts).length).toBe(Object.keys(starter.partNames).length);
    const result = evaluateBuild(build, catalog);
    expect(result.status, JSON.stringify(result.findings.filter((f) => f.severity === "error"), null, 2)).not.toBe("blocked");
  });
});

describe("pass measure 3 — filtering is synchronous and fast", () => {
  it("re-evaluates every candidate in the largest category well under 50ms", () => {
    // The real worst case the UI hits: bezelInsert has the most parts, and
    // picking a case re-evaluates each one as a trial build.
    const caseId = byName.get("NMK960 Sumo SKX007/SRPD Case: Steel Finish")!;
    const base: Build = { parts: { case: caseId } };
    const candidates = Object.values(catalog.parts).filter((p) => p.slot === "bezelInsert");
    expect(candidates.length).toBeGreaterThan(300);

    const run = () => {
      for (const c of candidates) evaluateBuild({ parts: { ...base.parts, bezelInsert: c.id } }, catalog);
    };
    run(); // warm
    const start = performance.now();
    run();
    const elapsed = performance.now() - start;
    expect(elapsed, `re-filter of ${candidates.length} parts took ${elapsed.toFixed(1)}ms`).toBeLessThan(50);
  });
});

describe("pass measure 6 — bad fixtures cannot be built through the UI", () => {
  const fixtures = JSON.parse(readFileSync("data/fixtures/known-builds.json", "utf-8")) as {
    badBuilds: { id: string; parts: Record<string, string | null> }[];
  };

  // The UI blocks at the point of selection: a part whose trial evaluation
  // produces an error for the active slot renders aria-disabled and cannot
  // be clicked. This asserts the same condition the UI keys off.
  it.each(fixtures.badBuilds)("$id has a slot that is unselectable given the rest of the build", (fixture) => {
    const full = resolveBuild(fixture.parts, catalog);
    const slots = Object.keys(full.parts) as SlotKey[];
    const blockedAtSelection = slots.some((slot) => {
      const rest: Build = { parts: { ...full.parts } };
      delete rest.parts[slot];
      const trial = evaluateBuild({ parts: { ...rest.parts, [slot]: full.parts[slot] } }, catalog);
      return trial.findings.some((f) => f.severity === "error" && f.slots.includes(slot));
    });
    expect(blockedAtSelection).toBe(true);
  });
});

describe("pass measure 8 — totals arithmetic", () => {
  it("parts + shipping + tools equals the grand total, with no float drift", () => {
    const build = resolveStarter(STARTER_BUILDS[2]!.partNames); // the 3-vendor field build
    const result = evaluateBuild(build, catalog);
    const t = computeTotals(build, displayListings, vendorInfos, result.requiredTools, true);

    expect(t.partsSubtotalMinorBase).toBe(t.groups.reduce((s, g) => s + g.subtotalMinorBase, 0));
    expect(t.shippingTotalMinor).toBe(t.groups.reduce((s, g) => s + g.shippingFlatMinor, 0));
    expect(t.grandTotalMinorLow).toBe(t.partsSubtotalMinorBase + t.shippingTotalMinor + t.toolsMinorLow);
    expect(t.grandTotalMinorHigh).toBe(t.partsSubtotalMinorBase + t.shippingTotalMinor + t.toolsMinorHigh);
    // Integer minor units throughout -- never a float.
    for (const v of [t.partsSubtotalMinorBase, t.shippingTotalMinor, t.grandTotalMinorLow, t.grandTotalMinorHigh]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  // Regression guard. Shipping is stored in each vendor's NATIVE minor
  // units (watchandstyle's is PHP 1500.00). Summing those into a GBP total
  // without converting turned a ~£18 shipping charge into £1,500 and
  // inflated a real build total by about £1,480 -- caught on screen during
  // the Phase 3 walkthrough, not by the arithmetic test above, which only
  // checked that the parts summed consistently.
  it("converts each vendor's shipping to GBP rather than summing native minor units", () => {
    const build = resolveStarter(STARTER_BUILDS[2]!.partNames);
    const result = evaluateBuild(build, catalog);
    const t = computeTotals(build, displayListings, vendorInfos, result.requiredTools, true);
    // No single vendor in this catalog ships for more than about GBP 20.
    for (const g of t.groups) {
      expect(g.shippingFlatMinor, `${g.vendorKey} shipping looks like unconverted native units`).toBeLessThan(5000);
    }
    expect(t.shippingTotalMinor).toBeLessThan(10000);
  });

  it("excluding tools removes exactly the tool cost", () => {
    const build = resolveStarter(STARTER_BUILDS[0]!.partNames);
    const result = evaluateBuild(build, catalog);
    const withTools = computeTotals(build, displayListings, vendorInfos, result.requiredTools, true);
    const without = computeTotals(build, displayListings, vendorInfos, result.requiredTools, false);
    expect(without.toolsMinorLow).toBe(0);
    expect(without.grandTotalMinorLow).toBe(withTools.grandTotalMinorLow - withTools.toolsMinorLow);
  });
});

describe("headline feature — shipping consolidation", () => {
  it("a saving is only offered when it is genuinely net-positive", () => {
    // Synthetic, so the arithmetic is checkable by hand rather than
    // dependent on whatever the catalog happens to contain today.
    const groups = [
      { vendorKey: "big", vendorName: "Big", items: [], subtotalMinorBase: 20000, shippingFlatMinor: 1200 },
      {
        vendorKey: "small",
        vendorName: "Small",
        items: [{ slot: "crown" as SlotKey, partId: "x", listing: { partId: "x", vendorKey: "small", priceMinor: 1000, currency: "SGD", priceMinorBase: 1000, fxRateDate: null, inStock: true, sourceUrl: "" } }],
        subtotalMinorBase: 1000,
        shippingFlatMinor: 1500,
      },
    ];
    const alts: DisplayListing[] = [
      { partId: "x", vendorKey: "small", priceMinor: 1000, currency: "SGD", priceMinorBase: 1000, fxRateDate: null, inStock: true, sourceUrl: "" },
      // Same part at Big for £4 more; dropping Small's £15 shipping nets £11.
      { partId: "x", vendorKey: "big", priceMinor: 1400, currency: "SGD", priceMinorBase: 1400, fxRateDate: null, inStock: true, sourceUrl: "" },
    ];
    const savings = findConsolidationSavings(groups, alts);
    expect(savings).toHaveLength(1);
    expect(savings[0]!.netSavingMinor).toBe(1100);
    expect(savings[0]!.shippingSavedMinor).toBe(1500);
    expect(savings[0]!.extraPartCostMinor).toBe(400);
  });

  it("offers nothing when the swap costs more than the shipping it saves", () => {
    const groups = [
      { vendorKey: "big", vendorName: "Big", items: [], subtotalMinorBase: 20000, shippingFlatMinor: 1200 },
      {
        vendorKey: "small",
        vendorName: "Small",
        items: [{ slot: "crown" as SlotKey, partId: "x", listing: { partId: "x", vendorKey: "small", priceMinor: 1000, currency: "SGD", priceMinorBase: 1000, fxRateDate: null, inStock: true, sourceUrl: "" } }],
        subtotalMinorBase: 1000,
        shippingFlatMinor: 500,
      },
    ];
    const alts: DisplayListing[] = [
      { partId: "x", vendorKey: "small", priceMinor: 1000, currency: "SGD", priceMinorBase: 1000, fxRateDate: null, inStock: true, sourceUrl: "" },
      { partId: "x", vendorKey: "big", priceMinor: 2000, currency: "SGD", priceMinorBase: 2000, fxRateDate: null, inStock: true, sourceUrl: "" },
    ];
    expect(findConsolidationSavings(groups, alts)).toHaveLength(0);
  });

  it("never suggests moving a part to a vendor that doesn't stock it", () => {
    const groups = [
      { vendorKey: "big", vendorName: "Big", items: [], subtotalMinorBase: 20000, shippingFlatMinor: 1200 },
      {
        vendorKey: "small",
        vendorName: "Small",
        items: [{ slot: "crown" as SlotKey, partId: "x", listing: { partId: "x", vendorKey: "small", priceMinor: 1000, currency: "SGD", priceMinorBase: 1000, fxRateDate: null, inStock: true, sourceUrl: "" } }],
        subtotalMinorBase: 1000,
        shippingFlatMinor: 5000,
      },
    ];
    const alts: DisplayListing[] = [
      { partId: "x", vendorKey: "small", priceMinor: 1000, currency: "SGD", priceMinorBase: 1000, fxRateDate: null, inStock: true, sourceUrl: "" },
    ];
    expect(findConsolidationSavings(groups, alts)).toHaveLength(0);
  });
});
