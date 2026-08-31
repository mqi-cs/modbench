# Deferred Work

Things cut from v1 that need to come back. Each entry records what was cut, why, what signal means it's time to restore it, and what restoring it costs.

**Review this file at the end of every phase.** Simplifications that nobody revisits become permanent by accident, and two of these are load-bearing if the project ever runs anywhere other than one laptop.

---

## D1 — Postgres instead of SQLite

**Cut in:** Phase 1
**Why:** A few hundred rows and one user. A database server earns nothing and costs setup friction.

**Restore when any of these is true:**
- The site is deployed somewhere with concurrent writers
- Ingestion moves from manual to scheduled
- The catalog passes ~5,000 parts and query performance is measurably bad
- You want real full-text search over part names and style tags

**Cost to restore:** Low if the guardrails held. Drizzle's schema syntax is nearly identical. The work is converting text-JSON columns to `jsonb`, text-plus-check enums to native enums, and integer booleans to real ones.

**Guardrails that keep this cheap — enforce them in review:**
- All JSON column access goes through `lib/db/json.ts`
- No SQLite-specific SQL anywhere in queries
- No raw SQL outside the migrations directory

---

## D2 — LLM-assisted extraction

**Cut in:** Phase 1
**Why:** Removes the SDK, prompt files, batching, and retry logic from the phase. At v1 catalog size, hand-tagging is tractable and produces better data.

**Restore when:**
- The catalog is growing faster than you can hand-tag — realistically past ~500 parts, or when adding a fifth vendor
- You want to re-tag the whole catalog after adding new attribute fields
- Vendors add products often enough that manual tagging becomes the bottleneck on freshness

**Cost to restore:** Moderate. The original spec is preserved below and the schema already accommodates it — `confidence` and `evidence` exist on `parts` for exactly this reason.

**Original design, for when it returns:**
- `scripts/extract.ts` batches 20 parts per call
- Output is JSON only, Zod-validated, retried once on parse failure, then flagged for manual review
- Requires `confidence` (`high`/`medium`/`low`) and a one-line `reasoning` per part
- Writes to a `part_extractions` staging table, **never directly to `parts`**
- The prompt lives in `scripts/prompts/extract.ts` as a versioned constant, not inline
- The prompt states that returning `null` for an uncertain field is correct and preferred over a guess
- Includes 3–5 worked examples from the Phase 0 family audit

**Non-negotiable when restored:** every constraint from `01a-PHASE-0-FINDINGS.md` still applies. Family is never assigned from a product name alone, and `scripts/review.ts` remains the gate. Extraction proposes; a human approves. If restoring extraction tempts you to weaken the review step, that is the moment the zero-false-positive guarantee dies.

---

## D3 — Responsive build pages

**Cut in:** Phase 5
**Why:** Desktop-first was a deliberate decision. The configurator is genuinely a desktop interaction.

**Restore when:** the first shared link goes out. Acquisition runs through Reddit and YouTube comments, which are overwhelmingly mobile, so every shared link currently lands a phone user on a desktop layout.

**Cost to restore:** Low, and much lower than making the configurator itself responsive. `/b/[id]` is a read-only view — preview image, parts list, total, one button. Scope this to the build page and the style pages only. The configurator stays desktop.

**This is the first thing to revisit after launch.**

---

## D4 — Scheduled ingestion

**Cut in:** Phase 1
**Why:** A human between the scrape and the database is a feature while the catalog is young.

**Restore when:** price and stock data is stale enough that users notice, and the review process has been stable long enough that you trust it unattended.

**Cost to restore:** Low for prices, high for parts. Split the job: `--prices-only` can run scheduled and safely, since it touches no compatibility data. New-part ingestion should stay manual for far longer, because that path is where a bad family tag would enter the catalog.

---

## D5 — Second case family in the preview

**Cut in:** Phase 4
**Why:** Scoped to `skx007-case` to make the asset pipeline tractable.

**Restore when:** the SKX007 preview reaches the 70% asset-ready threshold and holds. Adding SKX013 is then mostly drawing one more case base.

**Cost to restore:** An afternoon of illustration plus a re-run of `prepare-assets.ts`, assuming the pipeline generalised. If it did not generalise, that is worth knowing before the catalog grows further.

---

## Adding to this file

When cutting anything, add an entry with the same five fields: what, why, restore signal, cost, and any guardrails that keep the cost low. An entry with no restore signal is not deferred work — it is a decision, and it belongs in `00-PROJECT.md` instead.
