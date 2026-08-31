import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// SQLite has no native enum. Every enum column is `text` + a CHECK
// constraint listing the same values as the TS union type below it, so a
// bad value throws at the database layer, not just at the TS layer.

export const CATEGORIES = [
  "movement",
  "case",
  "dial",
  "hands",
  "bezel_insert",
  "crystal",
  "chapter_ring",
  "crown",
  "strap",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const SPEC_SOURCES = ["vendor-stated", "family-inferred", "manual"] as const;
export type SpecSource = (typeof SPEC_SOURCES)[number];

export const REVIEW_STATES = ["pending", "approved", "rejected"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const EXCEPTION_SEVERITIES = ["error", "warning", "info"] as const;
export type ExceptionSeverity = (typeof EXCEPTION_SEVERITIES)[number];

function inList(column: string, values: readonly string[]): ReturnType<typeof sql> {
  const list = values.map((v) => `'${v}'`).join(", ");
  return sql.raw(`${column} IN (${list})`);
}

export const vendors = sqliteTable("vendors", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  country: text("country").notNull(),
  shippingFlatMinor: integer("shipping_flat_minor").notNull(),
  // What currency this vendor's /products.json is expected to report.
  // scripts/verify-catalog.ts asserts every listing's currency matches this,
  // per the watchandstyle currency bug found in Phase 0.
  expectedCurrency: text("expected_currency").notNull(),
  feedType: text("feed_type").notNull().default("shopify"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const families = sqliteTable("families", {
  key: text("key").primaryKey(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull(),
}, (table) => [
  check("families_category_check", inList("category", CATEGORIES)),
]);

export const parts = sqliteTable("parts", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  family: text("family").notNull().references(() => families.key),
  name: text("name").notNull(),
  brand: text("brand"),
  // JSON, category-specific shape — see specs/02-phase-1-data-pipeline.md.
  // Access only through lib/db/json.ts.
  attributes: text("attributes").notNull(),
  specSource: text("spec_source").notNull(),
  confidence: text("confidence").notNull(),
  // Why this family/attributes were assigned — required, since without an
  // LLM extraction step this is the only trace of the tagging reasoning.
  evidence: text("evidence").notNull(),
  reviewState: text("review_state").notNull().default("pending"),
  notes: text("notes"),
  sourceUrl: text("source_url").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  check("parts_category_check", inList("category", CATEGORIES)),
  check("parts_spec_source_check", inList("spec_source", SPEC_SOURCES)),
  check("parts_review_state_check", inList("review_state", REVIEW_STATES)),
  check("parts_confidence_check", inList("confidence", CONFIDENCE_LEVELS)),
  index("parts_family_idx").on(table.family),
  index("parts_review_state_idx").on(table.reviewState),
]);

export const listings = sqliteTable("listings", {
  id: text("id").primaryKey(),
  partId: text("part_id").notNull().references(() => parts.id),
  vendorId: text("vendor_id").notNull().references(() => vendors.id),
  sourceUrl: text("source_url").notNull(),
  priceMinor: integer("price_minor").notNull(), // native price, vendor's own currency, never touched by conversion
  currency: text("currency").notNull(), // 3-char, the vendor's own currency
  // GBP-converted fields -- specs/09-COMPETITIVE-CONTEXT.md + 02-phase-1-data-pipeline.md
  // "Currency model". Computed once at ingest from data/fixtures/fx-rates.json,
  // never at display/request time. Stored per listing (not looked up globally)
  // so historical prices stay accurate as the fixture's rates drift.
  priceMinorBase: integer("price_minor_base"), // converted to GBP, integer minor units
  fxRate: real("fx_rate"), // rate used, native -> GBP (GBP per 1 native unit)
  fxRateDate: text("fx_rate_date"), // ISO date of the rate used, for the "rates as of" line
  inStock: integer("in_stock").notNull(), // 0/1
  lastCheckedAt: integer("last_checked_at").notNull(), // unix ms
}, (table) => [
  unique("listings_part_vendor_unique").on(table.partId, table.vendorId),
  check("listings_currency_len_check", sql`length(${table.currency}) = 3`),
  check("listings_price_positive_check", sql`${table.priceMinor} > 0`),
]);

export const familyExceptions = sqliteTable("family_exceptions", {
  id: text("id").primaryKey(),
  partId: text("part_id").notNull().references(() => parts.id),
  ruleKey: text("rule_key").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
}, (table) => [
  check("family_exceptions_severity_check", inList("severity", EXCEPTION_SEVERITIES)),
]);

export const rejectedParts = sqliteTable("rejected_parts", {
  id: text("id").primaryKey(),
  vendorKey: text("vendor_key").notNull(),
  sourceUrl: text("source_url").notNull(),
  productName: text("product_name").notNull(),
  reason: text("reason").notNull(),
  rawPayload: text("raw_payload").notNull(), // JSON, via lib/db/json.ts
  createdAt: integer("created_at").notNull(),
});
