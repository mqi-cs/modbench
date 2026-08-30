# Phase 1 — Data Pipeline

Turn four vendor feeds into a reviewed, family-tagged parts catalog. No UI in this phase.

**Prerequisite:** Phase 0 returned GO.

## Schema

Drizzle, in `lib/db/schema.ts`. The critical separation is **parts vs listings** — a part is a stable physical thing, a listing is one vendor's current price and stock for it. The same dial sold by three shops is one part and three listings.

```ts
// Enums
category:    'movement'|'case'|'dial'|'hands'|'bezel_insert'|'crystal'|'chapter_ring'|'crown'|'strap'
specSource:  'vendor-stated'|'family-inferred'|'manual'
reviewState: 'pending'|'approved'|'rejected'

// parts
id            uuid pk
category      category
family        text            // FK to families.key
name          text
brand         text nullable
attributes    jsonb           // category-specific, see below
specSource    specSource
reviewState   reviewState     // only 'approved' rows are ever served
notes         text nullable
createdAt / updatedAt

// listings
id            uuid pk
partId        uuid → parts.id
vendorId      uuid → vendors.id
sourceUrl     text
priceMinor    integer         // integer minor units, never a float
currency      char(3)
inStock       boolean
lastCheckedAt timestamptz
unique (partId, vendorId)

// vendors
id, key, name, baseUrl, country, shippingFlatMinor, currency, feedType

// families
key           text pk
category      category
label         text
description   text

// family_exceptions        -- parts that deviate from their family
id, partId, ruleKey, severity, message

// rejected_parts           -- audit trail for anything excluded
id, vendorKey, sourceUrl, productName, reason, rawPayload jsonb, createdAt
```

### `attributes` jsonb by category

Keep it small. Only fields the compatibility rules or the UI actually read.

- **movement** — `caliber`, `hasDay` bool, `hasDate` bool, `dateWindowPosition` (`'3'|'4:30'|null`), `heightMm`
- **case** — `caseDiameterMm`, `lugWidthMm`, `dialApertureMm`, `crystalDiameterMm`, `requiresSpacerFor` string[]
- **dial** — `diameterMm`, `hasFeet` bool, `dateWindowPosition`, `hasDayWindow` bool, `styleTags` string[]
- **hands** — `lengthSetMm`, `styleTags` string[], `lumed` bool
- **bezel_insert** — `outerDiameterMm`, `material`, `styleTags` string[]

`styleTags` is a controlled vocabulary — define it in `lib/db/style-tags.ts` and validate against it. Phase 6 depends on these being consistent. Examples: `sunburst`, `matte`, `textured`, `applied-indices`, `sword-hands`, `snowflake`, `dive-bezel`, `gmt`, `vintage-lume`.

## Scripts

All in `/scripts`, all run by hand via `pnpm tsx`. None of these run in a request path.

### `scripts/ingest.ts`

1. For each vendor, fetch `/products.json` with pagination (`?page=n&limit=250`).
2. Rate-limit: one request per 2 seconds. Descriptive User-Agent with a contact URL.
3. Validate every payload with Zod. A shape change should throw loudly, not silently write nulls.
4. Write raw responses to `data/raw/<vendor>-<ISO date>.json` before any processing. Cheap, and it means you can re-run extraction without re-fetching.
5. Upsert `vendors` and `listings`. Create `parts` rows in `reviewState: 'pending'`.

Flags: `--vendor=<key>`, `--dry-run`, `--prices-only` (refresh listings without touching parts).

### `scripts/extract.ts`

For every `pending` part, ask Claude to propose a family, attributes, and style tags from the product title, `product_type`, tags, and `body_html`.

- Batch 20 parts per call.
- Response must be JSON only, validated with Zod. Retry once on a parse failure, then mark the part for manual review.
- Require a `confidence` field of `high` | `medium` | `low` and a one-line `reasoning`.
- Write results to a `part_extractions` staging table. **Never write directly to `parts`.**

The prompt must state that returning `null` for an uncertain field is the correct behaviour and is preferred over a guess. Include 3–5 worked examples drawn from the Phase 0 family audit.

### `scripts/review.ts`

A terminal review tool. For each staged extraction, print the product name, source URL, the proposed family and attributes, the model's reasoning and confidence — then accept, edit, or reject.

- Everything at `low` confidence goes to review.
- Everything in the `case` and `movement` categories goes to review regardless of confidence, since those anchor every rule.
- `high` confidence dials, hands, and inserts may be bulk-accepted with `--auto-accept-high`, but spot-check 10% by hand.

Accepting writes to `parts` with `reviewState: 'approved'`. Rejecting writes to `rejected_parts` with a reason.

### `scripts/verify-catalog.ts`

Sanity checks, exits non-zero on failure:
- No approved part has a `family` absent from `families`
- No approved part has an empty `attributes`
- Every approved part has at least one listing
- Every part referenced in `known-builds.json` resolves to an approved part

## Constraints

- Prices are integer minor units. No floats anywhere near money.
- Only `reviewState: 'approved'` parts are ever exposed beyond the scripts.
- The extraction prompt lives in `scripts/prompts/extract.ts` as a versioned constant, not inline.
- If a vendor feed 404s or changes shape, fail that vendor loudly and continue with the others.

## Pass measure

1. **≥150 approved parts** in the database, spanning at least 3 vendors and all of: movement, case, dial, hands, bezel insert.
2. **Every part from `known-builds.json`** resolves to an approved part.
3. `verify-catalog.ts` **exits 0**.
4. **Re-running `ingest.ts` is idempotent** — no duplicate parts or listings created on a second run.
5. **`rejected_parts` is populated** and each entry has a human-readable reason. An empty rejection table means the pipeline is accepting things it shouldn't.
6. Manual audit: pull 20 approved parts at random, check each against its `sourceUrl`. **All 20 correct.** Any error here means the review step is too loose — fix it before Phase 2.
