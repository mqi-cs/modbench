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

## D6 — Cross-platform compatibility (non-Seiko)

**Deferred from:** post-launch. Not in scope for phases 1–6.
**Why it matters:** every existing tool, including assemble.watch, is organised around one platform. Real cross-platform fits exist and nobody surfaces them — so a beginner never learns what their options actually are.

**Known facts to build on (collect more as you find them):**
- Aftermarket Vostok Amphibia bezels accept inserts at 31.5mm inner / 38mm outer — the same dimensions the SKX uses, opening the entire Seiko insert market to Vostok builders
- Modders build Casioaks using Seiko-vendor dials, chapter rings, hour markers and hands over an unchanged Casio GA-2100 module

**Restore when:** the Seiko catalog is stable and phases 1–5 have shipped. This compounds the multi-vendor advantage rather than replacing it.

**Guardrail — this is the part that matters now.** Two Phase 1 decisions could make this a schema rewrite rather than a re-tagging job:

1. **Family keys should eventually describe the physical interface, not the parent watch.** `skx007-crystal` bakes the platform into the identity, so a shared 31.5/38mm insert would need duplicating per platform. The long-term shape is a family keyed on dimensions — insert OD/ID, dial diameter and feet spacing, pinion bore — with **platform as a separate label**.
2. **Compatibility must be an explicit dimensional match**, never an implicit property of "the Seiko ecosystem." If it is implicit, cross-platform fits cannot be expressed at all.

Do not restructure now. Just avoid foreclosing it.

**Also:** keep `data/fixtures/cross-platform-notes.md` and add any genuine cross-platform fact found while reading forums for fixtures. It costs nothing now and becomes the seed catalog for this expansion.

---

## D7 — Cross-vendor deduplication

**Cut in:** Phase 1 (parked after Investigation A/B and the Task 5 perceptual-hash check).
**Why:** Investigation A found the 1:1 parts:listings ratio (784:784, later 3,224:3,222) means cross-vendor deduplication isn't happening at all — every vendor's copy of a part is its own separate `parts` row. Text-based candidate matching (145 mutual-best-match pairs) turned out to be unreliable on its own (Investigation A: chaining artifacts, shared marketing vocabulary producing false positives). Task 5 tried perceptual hashing on the raw vendor photos as the next check and found *that* unreliable too: on manual inspection of 3 pairs across the distance range, a confirmed-different pair (chapter ring with GMT markers vs. a blank one) scored a *lower* (more "similar") distance than two pairs that looked like the same or plausibly the same part on direct visual inspection. The hash was tracking photography style (background, lighting, crop) rather than the object, because none of these images have been normalized.

**Restore when:** Phase 4 hits its 70% asset-ready threshold. Phase 4's `prepare-assets.ts` already builds exactly what this needs — background removed, centred, scaled to a fixed pixel radius from the real-world diameter (`05-phase-4-preview.md`) — for a completely different reason (the visual preview canvas). Re-running perceptual hashing on those normalized assets, once they exist, is then nearly free: the preprocessing step that was missing in Task 5 will already have been paid for by Phase 4. Attempting it standalone now (building a bespoke background-removal/normalization pipeline just to validate 145 candidate pairs) is a week spent answering a question that becomes close to free in a few phases.

**Cost to restore:** Low, if Phase 4's asset pipeline generalises the way it's meant to. Re-run the Task 5 pHash comparison against `data/assets/<category>/<partId>.png` instead of raw vendor CDN URLs; expect the ranking to actually track visual similarity once background/lighting/crop are no longer part of the signal.

**Escalation (added 2026-09-01, end of Phase 3):** this is no longer only
a data-quality deferral. Phase 3 shipped vendor grouping and the shipping-
consolidation engine, and both are inert without it: 4,055 of 4,056 parts
have a single listing, so there is never a second vendor to consolidate
to. The headline pass measure in `04-phase-3-configurator.md` is blocked
on this entry. Restoring D7 is what turns the project's stated
differentiator from working code into a working feature.

**Guardrails that keep this cheap:**
- The 145 candidate pairs (Investigation A, `data/fixtures/investigation-a-cross-vendor-overlap.md`) and the Task 5 negative result (`data/fixtures/task5-perceptual-hash-check.md`, `phash-raw-results.json`) are the input set for the retry — don't regenerate the candidate list from scratch, re-check it against normalized images.
- `part_merges` (schema + `scripts/merge-parts.ts` + the verify-catalog.ts conflicting-attributes check) already exists from the one manual merge done in Task 4 (SRP Turtle sapphire crystal) — restoring dedup is "run more merges through the existing mechanism," not "build the mechanism."
- Do not build a general automated-merge rule before this restores. Every merge stays a reviewed, reasoned decision (per `09-COMPETITIVE-CONTEXT.md`) even once image comparison is reliable enough to nominate candidates with more confidence.

---

## D8 — Untagged catalog remainder (small vendor-specific product_types)

**Cut in:** Phase 1 (pre-Phase-2 cleanup pass, 2026-09-01).
**Why:** After closing the 134-part gap and the two rounds of fixes the new unmatched-product-type report (`data/tagged/`, `data/fixtures/unmatched-product-types.json`, regenerated by every `scripts/tag-parts.ts` run) turned up, ~98 real SKUs remain untagged: real parts with no case-model marker the tagger's keyword resolver recognizes (e.g. luciusatelier's "GS Watch Case"/"Explorer Watch Case" homage-case line, "Oyster Bracelet" with no case reference), plus a long tail of small, single- or few-SKU product_types (springbars, clasps, buckles, end-links, spare parts) not worth a bespoke tagger branch each. Full inventory, reasoning per cluster, and what's already excluded elsewhere: `data/fixtures/catalog-gaps.md`.

**Restore when:** revisiting full-catalog tagging coverage (this session tagged the majority of the 4 vendors' real catalogs, not 100%), or when any single cluster in catalog-gaps.md grows large enough to be worth its own tagger branch (the Handcrafted Series line and the casebacks both started this size before being closed this session).

**Cost to restore:** Low per cluster — each one in catalog-gaps.md is either a mechanical branch addition (same pattern as every gap closed this session) or a small, scoped family-evidence-gathering exercise (e.g. verifying the luciusatelier homage-case line shares real dimensions before seeding a family for it, same rigor as `family-audit.csv`/`singleton-verification.md`).

**Guardrails that keep this cheap:**
- The standing unmatched-product-type report already does the finding; restoring this is "work the existing list," not "go looking again."
- Do not assign a family from a product name/title alone without the same evidence bar the rest of this catalog uses (Amendment A, `01a-PHASE-0-FINDINGS.md`) — several of the remaining SKUs (the lucius homage cases) are specifically flagged in catalog-gaps.md as needing real verification, not a guess.

---

## Adding to this file

When cutting anything, add an entry with the same five fields: what, why, restore signal, cost, and any guardrails that keep the cost low. An entry with no restore signal is not deferred work — it is a decision, and it belongs in `00-PROJECT.md` instead.
