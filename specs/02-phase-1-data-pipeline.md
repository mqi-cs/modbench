# Phase 1 — Data Pipeline

Turn four vendor feeds into a reviewed, family-tagged parts catalog. No UI in this phase.

**Prerequisites:** Phase 0 returned GO, and `01a-PHASE-0-FINDINGS.md` has been read. The singleton verification in that file must be resolved before writing code.

## v1 simplifications

Two deliberate reductions from the original spec. Both are temporary and tracked in `08-DEFERRED.md`.

- **SQLite, not Postgres.** Single file at `data/modbench.db` via `better-sqlite3`. No Docker, no daemon.
- **No LLM extraction step.** No `@anthropic-ai/sdk`, no `scripts/extract.ts`, no prompt files, no batching or retry logic. Parts are tagged by hand, or by Claude Code reading the raw feed JSON directly and writing tagged output.

Everything else — the schema, the review gate, the verification checks, and every pass measure — stands as written.

## Schema

Drizzle, in `lib/db/schema.ts`. The critical separation is **parts vs listings**: a part is a stable physical thing, a listing is one vendor's current price and stock for it. The same dial sold by three shops is one part and three listings.

SQLite has no native enum or jsonb. Use `text` columns with check constraints for enums, and `text` holding JSON for `attributes`. **Access every JSON column through one helper in `lib/db/json.ts`** so a later move to Postgres jsonb is a single-file change.

```
// Enum values (text + check constraint)
category:    'movement'|'case'|'dial'|'hands'|'bezel_insert'|'crystal'|'chapter_ring'|'crown'|'strap'
specSource:  'vendor-stated'|'family-inferred'|'manual'
reviewState: 'pending'|'approved'|'rejected'
confidence:  'high'|'medium'|'low'

// parts
id            text pk         // nanoid
category      category
family        text            // FK to families.key
name          text
brand         text nullable
attributes    text            // JSON, via lib/db/json.ts
specSource    specSource
confidence    confidence
evidence      text            // why this family was assigned
reviewState   reviewState     // only 'approved' rows are ever served
notes         text nullable
createdAt / updatedAt

// listings
id            text pk
partId        text → parts.id
vendorId      text → vendors.id
sourceUrl     text
priceMinor    integer         // integer minor units, never a float
currency      text            // 3-char
inStock       integer         // 0/1
lastCheckedAt integer         // unix ms
unique (partId, vendorId)

// vendors
id, key, name, baseUrl, country, shippingFlatMinor, expectedCurrency, feedType

// families
key, category, label, description

// family_exceptions        -- parts that deviate from their family
id, partId, ruleKey, severity, message

// rejected_parts           -- audit trail for anything excluded
id, vendorKey, sourceUrl, productName, reason, rawPayload, createdAt
```

`confidence` and `evidence` are on `parts` rather than a staging table, since without an extraction step there is nothing to stage. They carry the same audit purpose.

### `attributes` JSON by category

Keep it small. Only fields the compatibility rules or the UI actually read.

- **movement** — `caliber`, `hasDay` bool, `hasDate` bool, `dateWindowPosition` (`'3'|'4:30'|null`), `heightMm`
- **case** — `caseDiameterMm`, `lugWidthMm`, `dialApertureMm`, `crystalDiameterMm`, `requiresSpacerFor` string[]
- **dial** — `diameterMm`, `hasFeet` bool, `dateWindowPosition`, `hasDayWindow` bool, `styleTags` string[]
- **hands** — `lengthSetMm`, `styleTags` string[], `lumed` bool
- **bezel_insert** — `outerDiameterMm`, `material`, `styleTags` string[]

`styleTags` is a controlled vocabulary. Define it in `lib/db/style-tags.ts` and validate against it — Phase 6 depends on these being consistent. Examples: `sunburst`, `matte`, `textured`, `applied-indices`, `sword-hands`, `snowflake`, `dive-bezel`, `gmt`, `vintage-lume`.

## Seed data

Before any ingestion, hand-enter:

1. **`families`** — the six starting families from `00-PROJECT.md`, plus any confirmed by the Phase 0 audit.
2. **`vendors`** — the four vendors with `expectedCurrency` set explicitly. This is what the currency assertion checks against.
3. **`family_exceptions`** — the Lucius Atelier Ultra Thin case (Finding 1). Its message must be legible to a beginner: not "family override," but an explanation that despite the name, standard SKX013 parts will not fit this case.

## Scripts

All in `/scripts`, run by hand via `pnpm tsx`. None run in a request path.

### `scripts/ingest.ts`

1. For each vendor, fetch `/products.json` with pagination (`?page=n&limit=250`).
2. Rate-limit: one request per 2 seconds. Descriptive User-Agent with a contact URL.
3. Validate every payload with Zod. A shape change throws loudly rather than silently writing nulls.
4. Write raw responses to `data/raw/<vendor>-<ISO date>.json` **before any processing.** These files are what the tagging step reads.
5. Upsert `vendors` and `listings`. Create `parts` rows as `reviewState: 'pending'` with `confidence: 'low'` and empty attributes.

Flags: `--vendor=<key>`, `--dry-run`, `--prices-only` (refresh listings without touching parts).

### Tagging — manual, no script

Read `data/raw/*.json` and produce `data/tagged/<vendor>.json`: one entry per part with `family`, `attributes`, `specSource`, `confidence`, and `evidence`.

Rules, from `01a-PHASE-0-FINDINGS.md`:

- **Family must never be assigned from the product name alone.** Name-only evidence caps at `confidence: 'low'` and forces manual review. The Ultra Thin case is proof that vendor naming misleads.
- `specSource: 'vendor-stated'` only when `body_html` explicitly states the relevant convention or spec. Otherwise `family-inferred`.
- Returning `null` for an uncertain attribute is correct and preferred over a guess.
- A part that cannot be confidently placed in a family goes to `rejected_parts` with a reason. **An empty rejection table means the process is too permissive.**

Whether a human or Claude Code produces this file, the review step below is the gate and is not optional.

### `scripts/import-tagged.ts`

Reads `data/tagged/*.json`, validates against the schema with Zod, and writes into `parts` as `pending`. Rejects anything with an unknown family key or a style tag outside the controlled vocabulary.

### `scripts/review.ts`

Terminal review tool. For each pending part, print name, source URL, proposed family, attributes, evidence, and confidence — then accept, edit, or reject.

Mandatory review, regardless of confidence:
- Everything at `low` confidence
- Everything in `case` and `movement` categories, since those anchor every rule
- Anything flagged by the name/family conflict check

`high` confidence dials, hands, and inserts may be bulk-accepted with `--auto-accept-high`, but spot-check 10% by hand.

Accepting writes `reviewState: 'approved'`. Rejecting writes to `rejected_parts` with a reason.

### `scripts/verify-catalog.ts`

Exits non-zero on any failure:

- No approved part has a `family` absent from `families`
- No approved part has empty `attributes`
- Every approved part has at least one listing
- Every part referenced in `known-builds.json` resolves to an approved part
- **Name/family conflict check** — flag any part whose name contains `SKX007`, `SKX013`, `SRPD`, `NH35`, or `NH36` where that designation disagrees with its assigned family
- **Currency check** — every listing's currency matches its vendor's `expectedCurrency`
- **Price sanity** — every price within a plausible range for its category; no null or zero prices

The last three come directly from Phase 0 findings and are not optional.

## Constraints

- Prices are integer minor units. No floats anywhere near money.
- Only `reviewState: 'approved'` parts are exposed beyond the scripts.
- No `@anthropic-ai/sdk` dependency in this phase.
- No SQLite-specific SQL in queries. JSON access goes through `lib/db/json.ts`.
- If a vendor feed 404s or changes shape, fail that vendor loudly and continue with the others.
- No automated access to forums (see `01a-PHASE-0-FINDINGS.md`, Finding 3).

## Pass measure

1. **≥150 approved parts**, spanning at least 3 vendors and all of: movement, case, dial, hands, bezel insert.
2. **Every part from `known-builds.json`** resolves to an approved part.
3. `verify-catalog.ts` **exits 0**, including the currency, price sanity, and name/family conflict checks.
4. **Re-running `ingest.ts` is idempotent** — no duplicate parts or listings on a second run.
5. **`rejected_parts` is populated**, each entry with a human-readable reason.
6. **The Ultra Thin case is present as a `family_exceptions` row** and its message is legible to a beginner.
7. **Manual audit: 20 random approved parts checked against their `sourceUrl`. All 20 correct.** Any error means the review step is too loose — fix it before Phase 2. This measure is unchanged by the removal of the extraction step and matters more without it.
