// Server-side catalog assembly. Reads the DB and produces the plain
// CatalogSlice that lib/compat consumes, plus the extra display fields the
// UI needs (image, vendor URL, native price) which the engine deliberately
// doesn't take.
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { familyExceptions, listings, parts, vendors } from "./db/schema";
import { fromJsonColumn } from "./db/json";
import { encodePreviewable } from "./preview/previewable";
import { readFileSync } from "node:fs";
import type { CatalogSlice, SlotKey } from "./compat";

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

export interface VendorInfo {
  key: string;
  name: string;
  // Native, as the vendor charges it -- watchandstyle's is PHP 1500.00.
  shippingFlatMinor: number;
  currency: string;
  // The same figure converted to GBP with the fx-rates fixture, exactly as
  // listing prices are converted at ingest. Totals must sum this one:
  // summing the native minor units instead turns PHP 1500 into GBP 1500
  // and inflates a build total by ~£1,480.
  shippingMinorBase: number;
  fxRate: number;
}

// One listing as the UI shows it: the native price the vendor charges,
// the GBP figure we converted at ingest, and when the rate was taken.
export interface DisplayListing {
  partId: string;
  vendorKey: string;
  priceMinor: number;
  currency: string;
  priceMinorBase: number;
  fxRateDate: string | null;
  inStock: boolean;
  sourceUrl: string;
}

// Deliberately ships ONE copy of the listing data. The CatalogSlice that
// lib/compat needs (plus its by-part index) is derived on the client from
// `listings` + `vendors` -- serialising all three tripled the payload for
// no gain, since every field is recoverable from these two.
export interface CatalogPayload {
  parts: CatalogSlice["parts"];
  // Display only, keyed by part id -- kept OUT of CatalogSlice so
  // lib/compat can't see it and no rule can key off an image.
  images: Record<string, string>;
  // Which parts scripts/prepare-assets.ts produced a preview layer for,
  // as a base64 bitmask over the sorted part ids -- 0.45KB against the
  // 21.1KB the same 1,241 ids cost as an array. Decode with
  // decodePreviewable(). Display only, and kept out of CatalogSlice so
  // lib/compat cannot see it and no rule can key off it.
  previewable: string;
  familyExceptions: CatalogSlice["familyExceptions"];
  listings: DisplayListing[];
  vendors: VendorInfo[];
  fxAsOf: string | null;
}

export function loadCatalog(): CatalogPayload {
  const fx = JSON.parse(readFileSync("data/fixtures/fx-rates.json", "utf-8")) as {
    base: string;
    rates: Record<string, number>;
  };
  const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const allVendors = db.select().from(vendors).all();
  const vendorById = new Map(allVendors.map((v) => [v.id, v]));

  const sliceParts: CatalogSlice["parts"] = {};
  for (const p of approved) {
    const slot = CATEGORY_TO_SLOT[p.category];
    if (!slot) continue;
    sliceParts[p.id] = {
      id: p.id,
      slot,
      family: p.family,
      name: p.name,
      attributes: fromJsonColumn<Record<string, unknown>>(p.attributes),
      specSource: p.specSource as "vendor-stated" | "family-inferred" | "manual",
      confidence: p.confidence as "high" | "medium" | "low",
    };
  }

  const images: Record<string, string> = {};
  for (const p of approved) if (p.imageUrl && sliceParts[p.id]) images[p.id] = p.imageUrl;

  const previewable = encodePreviewable(
    Object.keys(sliceParts),
    approved.filter((p) => p.assetState === "ready" && sliceParts[p.id]).map((p) => p.id),
  );

  const rows = db.select().from(listings).all().filter((l) => sliceParts[l.partId] && l.priceMinorBase !== null);
  const displayListings: DisplayListing[] = rows.map((l) => {
    const v = vendorById.get(l.vendorId);
    return {
      partId: l.partId,
      vendorKey: v?.key ?? "unknown",
      priceMinor: l.priceMinor,
      currency: l.currency,
      priceMinorBase: l.priceMinorBase as number,
      fxRateDate: l.fxRateDate,
      inStock: Boolean(l.inStock),
      sourceUrl: l.sourceUrl,
    };
  });

  return {
    parts: sliceParts,
    previewable,
    familyExceptions: db
      .select()
      .from(familyExceptions)
      .all()
      .map((e) => ({
        partId: e.partId,
        ruleKey: e.ruleKey,
        severity: e.severity as "error" | "warning" | "info",
        message: e.message,
      })),
    images,
    listings: displayListings,
    vendors: allVendors.map((v) => {
      const rate = v.expectedCurrency === fx.base ? 1 : (fx.rates[v.expectedCurrency] ?? 1);
      return {
        key: v.key,
        name: v.name,
        shippingFlatMinor: v.shippingFlatMinor,
        currency: v.expectedCurrency,
        shippingMinorBase: Math.round(v.shippingFlatMinor / rate),
        fxRate: rate,
      };
    }),
    fxAsOf: rows.find((l) => l.fxRateDate)?.fxRateDate ?? null,
  };
}
