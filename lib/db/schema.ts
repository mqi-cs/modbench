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
  "bezel", // the rotating bezel ring itself -- distinct from bezel_insert (the disc it holds).
  // Mates to the case, not the insert; added when clearing the Phase 1 tagging
  // backlog once it was clear this was a real, sizeable category (100+ SKUs
  // per vendor), not a handful of edge cases.
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

// Whether scripts/prepare-assets.ts produced a usable preview layer for
// this part. Display only, like image_url -- lib/compat never sees it and
// no compatibility rule may key off it. 'needs-manual' means the vendor's
// photograph was understood well enough to reject (a wrist shot, a colour
// grid, an insert photographed fitted to a whole watch) and a human would
// have to cut it out; 'unavailable' means it could not be fetched or
// decoded at all.
export const ASSET_STATES = ["ready", "needs-manual", "unavailable"] as const;
export type AssetState = (typeof ASSET_STATES)[number];

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
  // First image from the vendor's own feed. Display only -- lib/compat
  // never sees it, and no rule may key off it.
  imageUrl: text("image_url"),
  // Null until scripts/prepare-assets.ts has run over this part.
  assetState: text("asset_state"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  check("parts_category_check", inList("category", CATEGORIES)),
  check("parts_spec_source_check", inList("spec_source", SPEC_SOURCES)),
  check("parts_review_state_check", inList("review_state", REVIEW_STATES)),
  check("parts_confidence_check", inList("confidence", CONFIDENCE_LEVELS)),
  check("parts_asset_state_check", sql`${table.assetState} IS NULL OR ${table.assetState} IN ('ready', 'needs-manual', 'unavailable')`),
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

// Cross-vendor merges. Deliberately manual -- Investigation A found the
// deduplication problem in 09-COMPETITIVE-CONTEXT.md (784 parts, 784
// listings, a 1:1 ratio) and Investigation B's follow-up found the naive
// title-matching used to detect candidates is itself unreliable (false
// positives from shared marketing vocabulary, chaining). General automated
// deduplication is explicitly NOT built here -- each merge is a human
// judgment call, recorded with its reasoning. When a part is merged, its
// listings move onto the surviving (canonical) part and its own `parts`
// row is deleted -- this table is the permanent record of what that row
// was, so the merge is auditable after the row is gone.
export const partMerges = sqliteTable("part_merges", {
  id: text("id").primaryKey(),
  canonicalPartId: text("canonical_part_id").notNull().references(() => parts.id),
  mergedPartName: text("merged_part_name").notNull(), // the deleted part's name, for audit
  mergedSourceUrl: text("merged_source_url").notNull(), // retained even though the listing itself also carries it
  mergedVendorKey: text("merged_vendor_key").notNull(),
  mergedAttributes: text("merged_attributes").notNull(), // JSON snapshot at merge time, via lib/db/json.ts -- what verify-catalog.ts's conflicting-attributes check compares against the canonical part's current attributes
  reason: text("reason").notNull(), // why a human judged this the same physical part
  createdAt: integer("created_at").notNull(),
});

// Saved builds. specs/06-phase-5-sharing.md: "The full query-string URL is
// too long to paste into a Reddit comment."
//
// Immutable and anonymous by design -- there are no accounts, and opening
// a build in the configurator forks it into a fresh URL rather than
// mutating the original. That is what lets these be cached indefinitely.
export const builds = sqliteTable("builds", {
  // 8 chars, so the link is short enough to paste inline. Collision risk
  // is checked on insert rather than assumed away.
  id: text("id").primaryKey(),
  // JSON object of slot -> part id. Access only through lib/db/json.ts.
  slots: text("slots").notNull(),
  createdAt: integer("created_at").notNull(),
  viewCount: integer("view_count").notNull().default(0),
}, (table) => [
  check("builds_id_length_check", sql`length(${table.id}) = 8`),
]);

// Rate limiting for POST /api/builds, per specs/06-phase-5-sharing.md.
// In the database rather than in memory because the dev server and any
// serverless deployment both lose in-process state between requests, and
// a limiter that resets on every cold start is not a limiter.
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

// A perceptual hash per part that has a prepared asset.
//
// Kept in its own table rather than on parts.attributes for one concrete
// reason: lib/catalog.ts ships every approved part's attributes to the
// browser, and 1,218 sixty-four-character hashes is ~78KB of payload for
// something no page renders. Nothing user-facing reads this; it exists so
// cross-vendor match suggestions can be made server-side.
export const partHashes = sqliteTable("part_hashes", {
  partId: text("part_id").primaryKey().references(() => parts.id),
  // Hex, 256 bits, from lib/dedup/phash.ts over the normalised asset.
  phash: text("phash").notNull(),
  computedAt: integer("computed_at").notNull(),
});

export const MERGE_CANDIDATE_STATES = ["pending", "accepted", "rejected"] as const;
export type MergeCandidateState = (typeof MERGE_CANDIDATE_STATES)[number];

export const MERGE_CANDIDATE_SOURCES = ["user-link", "phash", "both"] as const;
export type MergeCandidateSource = (typeof MERGE_CANDIDATE_SOURCES)[number];

// A CLAIM that two or more listings are the same physical part. Never a
// merge.
//
// The distinction is the whole point of this table. A wrong merge asserts
// that two different parts are identical, which is a false positive of
// exactly the kind lib/compat exists to prevent -- and unlike a bad
// compatibility warning it is destructive, because merging deletes a parts
// row. So a submission lands here, a human reads it, and only then does
// scripts/review-merges.ts write part_merges. Nothing in this table is
// visible to the configurator, and lib/compat never sees it.
export const mergeCandidates = sqliteTable("merge_candidates", {
  id: text("id").primaryKey(),
  // Part ids claimed to be one part, JSON, sorted. Two or more.
  partIds: text("part_ids").notNull(),
  // Exactly what was pasted, including anything that did not resolve --
  // retained per the project rule that both source URLs are always kept.
  submittedUrls: text("submitted_urls").notNull(),
  unresolvedUrls: text("unresolved_urls").notNull(),
  source: text("source").notNull(),
  // Hamming distance over normalised assets, when both sides have one.
  phashDistance: integer("phash_distance"),
  // Whether the parts' colour style tags agree. The hash is greyscale and
  // cannot tell a silver hand set from the same model in gold.
  colourAgreement: text("colour_agreement"),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  reviewerNote: text("reviewer_note"),
  createdAt: integer("created_at").notNull(),
  reviewedAt: integer("reviewed_at"),
}, (table) => [
  check("merge_candidates_status_check", inList("status", MERGE_CANDIDATE_STATES)),
  check("merge_candidates_source_check", inList("source", MERGE_CANDIDATE_SOURCES)),
  index("merge_candidates_status_idx").on(table.status),
]);
