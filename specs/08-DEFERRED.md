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

**DO NOT DELETE THE PREPARED ASSETS (added 2026-09-14).** `public/assets/`
holds roughly 24MB of normalised hands, chapter-ring and bezel-insert
images that nothing in the app reads any more: the Phase 4 rollout
replaced photographic compositing with drawn silhouettes, and only dials
are still displayed as photographs. They look like dead weight and they
are not. They are the exact input this entry has been waiting for. Task 5
found perceptual hashing unreliable **because raw vendor photos vary in
background, lighting and crop**, and these assets are those same photos
with background removed, centred, and scaled to a fixed pixel radius from
the real-world diameter. Deleting them for tidiness re-blocks the
project's stated differentiator and costs a re-run of the whole asset
pipeline to undo. They also remain the fallback if a drawn silhouette
turns out to be wrong for some category. 24MB is not worth the risk.

**RETRIED 2026-09-14, and it worked — see
`data/fixtures/task5-retry-normalised.md`.** Re-running the hash over the
normalised assets un-inverted the ordering: the confirmed-different
chapter ring pair now sits at the 28th percentile of unrelated parts while
the likely-same dial pair sits at the 1.4th, where under raw photographs
the different pair scored *better* than the same one. Hands go from a best
distance of 94/256 to 4/256.

Three things qualify it, and all three are now recorded rather than
implicit:

1. **Only 62 of 145 pairs can be re-hashed.** Bezel inserts are 0 of 42,
   for the D9 reason — nobody photographs them alone. Cases, crystals and
   movements were never preview categories.
2. **The Task 4 crystal calibration pair cannot be recovered at all.**
   Both vendor photographs are oblique side-on shots that the pipeline
   rejects. Normalisation fixes the hash where it can run; it cannot fix
   photography that was never top-down.
3. **The hash is greyscale and therefore blind to finish.** The same hand
   set in silver and in gold scores 16/256. Distance alone would merge
   them. The shortlist is gated on distance AND colour-tag agreement.

Eleven pairs are now queued in `merge_candidates` for human review. None
is merged.

**AND A SECOND ROUTE, added the same day: user-submitted matches.**
`/submit-match` takes pasted vendor product links, resolves them, shows
what else in the catalog might be the same thing, and records a CANDIDATE.
Never a merge — `scripts/review-merges.ts` is the human gate, and it
writes `part_merges` through the same mechanics `merge-parts.ts` used, so
the conflicting-attributes check in verify-catalog covers it unchanged.
The two routes share one queue and a pair found by both is labelled
`source: 'both'`.

**SCOPE NARROWED, 2026-09-14. The remaining blocker is PHOTOGRAPHY, not
matching technique.** The hash works on normalised assets. What it cannot
do is run on categories nobody photographs top-down, which is D9's
problem, not a matching problem. So:

- **The submission path at `/submit-match` is now the PRIMARY mechanism.**
  A modder who knows two listings are the same part is better ground truth
  than any hash, and it works for every category including the ones with
  no assets at all.
- **pHash is a supplementary signal**, used to nominate candidates at
  scale and to corroborate a human claim (`source: 'both'`).
- **Do not invest further in pHash coverage or in chasing D9 photography**
  until the submission path has been in front of real users.

**DO NOT RELAX THE COLOUR-TAG GATE.** The hash is computed on greyscale
pixels and is therefore blind to finish. The same MM1000 hand set in
polished silver and in polished gold scores 16/256 -- well inside any
threshold worth using. Distance alone would merge them and assert that a
silver part and a gold part are one SKU: destructive, because merging
deletes a `parts` row, and exactly the false-positive class this project
exists to prevent. Candidates are gated on distance AND colour agreement,
and that gate is load-bearing.

**First review round, 2026-09-14: 3 merged, 8 rejected.** Eleven
candidates cleared distance <= 40 with agreeing colour tags; only three
survived looking at the two photographs side by side. Seven of the eight
rejections were LUME COLOUR -- cream patina against white C3, or a lume
insert present on one listing and not the other -- which the colour
vocabulary does not model at all, because `black` describes the frame. So
the realistic precision of the automated gate on hands is about 27%, and
human review is not a formality on top of it. If lume colour is ever
added to the vocabulary, most of those eight become decidable.

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

**RETRIED 2026-09-14, and it worked — see
`data/fixtures/task5-retry-normalised.md`.** Re-running the hash over the
normalised assets un-inverted the ordering: the confirmed-different
chapter ring pair now sits at the 28th percentile of unrelated parts while
the likely-same dial pair sits at the 1.4th, where under raw photographs
the different pair scored *better* than the same one. Hands go from a best
distance of 94/256 to 4/256.

Three things qualify it, and all three are now recorded rather than
implicit:

1. **Only 62 of 145 pairs can be re-hashed.** Bezel inserts are 0 of 42,
   for the D9 reason — nobody photographs them alone. Cases, crystals and
   movements were never preview categories.
2. **The Task 4 crystal calibration pair cannot be recovered at all.**
   Both vendor photographs are oblique side-on shots that the pipeline
   rejects. Normalisation fixes the hash where it can run; it cannot fix
   photography that was never top-down.
3. **The hash is greyscale and therefore blind to finish.** The same hand
   set in silver and in gold scores 16/256. Distance alone would merge
   them. The shortlist is gated on distance AND colour-tag agreement.

Eleven pairs are now queued in `merge_candidates` for human review. None
is merged.

**AND A SECOND ROUTE, added the same day: user-submitted matches.**
`/submit-match` takes pasted vendor product links, resolves them, shows
what else in the catalog might be the same thing, and records a CANDIDATE.
Never a merge — `scripts/review-merges.ts` is the human gate, and it
writes `part_merges` through the same mechanics `merge-parts.ts` used, so
the conflicting-attributes check in verify-catalog covers it unchanged.
The two routes share one queue and a pair found by both is labelled
`source: 'both'`.

**SCOPE NARROWED, 2026-09-14. The remaining blocker is PHOTOGRAPHY, not
matching technique.** The hash works on normalised assets. What it cannot
do is run on categories nobody photographs top-down, which is D9's
problem, not a matching problem. So:

- **The submission path at `/submit-match` is now the PRIMARY mechanism.**
  A modder who knows two listings are the same part is better ground truth
  than any hash, and it works for every category including the ones with
  no assets at all.
- **pHash is a supplementary signal**, used to nominate candidates at
  scale and to corroborate a human claim (`source: 'both'`).
- **Do not invest further in pHash coverage or in chasing D9 photography**
  until the submission path has been in front of real users.

**DO NOT RELAX THE COLOUR-TAG GATE.** The hash is computed on greyscale
pixels and is therefore blind to finish. The same MM1000 hand set in
polished silver and in polished gold scores 16/256 -- well inside any
threshold worth using. Distance alone would merge them and assert that a
silver part and a gold part are one SKU: destructive, because merging
deletes a `parts` row, and exactly the false-positive class this project
exists to prevent. Candidates are gated on distance AND colour agreement,
and that gate is load-bearing.

**First review round, 2026-09-14: 3 merged, 8 rejected.** Eleven
candidates cleared distance <= 40 with agreeing colour tags; only three
survived looking at the two photographs side by side. Seven of the eight
rejections were LUME COLOUR -- cream patina against white C3, or a lume
insert present on one listing and not the other -- which the colour
vocabulary does not model at all, because `black` describes the frame. So
the realistic precision of the automated gate on hands is about 27%, and
human review is not a formality on top of it. If lume colour is ever
added to the vocabulary, most of those eight become decidable.

**Guardrails that keep this cheap:**
- The standing unmatched-product-type report already does the finding; restoring this is "work the existing list," not "go looking again."
- Do not assign a family from a product name/title alone without the same evidence bar the rest of this catalog uses (Amendment A, `01a-PHASE-0-FINDINGS.md`) — several of the remaining SKUs (the lucius homage cases) are specifically flagged in catalog-gaps.md as needing real verification, not a guess.

---

## End-of-phase review — Phase 3 (2026-09-02)

Required by `00-PROJECT.md`: "Read `08-DEFERRED.md` at the end of each
phase. Simplifications nobody revisits become permanent by accident."
State of each restore signal now that the configurator ships:

| Entry | Signal | Status |
|---|---|---|
| **D7** cross-vendor dedup | Phase 4 asset threshold | **Escalated — now blocking.** Phase 3 shipped the consolidation engine and it is inert without this. See the entry above and `04-phase-3-configurator.md`. |
| **D3** responsive build pages | "the first shared link goes out" | **Armed.** Phase 3 built the shareable URL — every build is now a link, and the stated acquisition channels (r/watchmodding, r/SeikoMods) are mobile-heavy. The signal is no longer hypothetical; it fires the first time someone posts a build. Scope stays as written: the read-only build page, not the configurator. |
| **D1** Postgres | "catalog passes ~5,000 parts" | Not yet — **4,056**. Close enough to keep an eye on; nothing to do. |
| **D2** LLM extraction | "past ~500 parts, or a fifth vendor" | **Numerically tripped (4,056) but the rationale has been superseded.** The deterministic tagger didn't just prove tractable, it proved *diagnostic*: reading the feeds by rule surfaced the crown-vs-date conflation, three false-premise rules, and two whole failure classes hiding in `body_html`. An extraction model would likely have reproduced the vendors' own phrasing without noticing any of it. Restore this for *volume* if a fifth vendor lands — not as an upgrade in data quality. |
| **D4** scheduled ingestion | stale prices users notice | Not yet. Prices are 2 days old. |
| **D5** second preview case family | Phase 4 threshold | Phase 4. |
| **D6** cross-platform | phases 1–5 shipped | Not yet. |
| **D8** untagged remainder | cluster grows | Unchanged: 86 unmatched, down from 98 (the Lucius bracelets were closed by the Phase 3 mining pass). |

## Adding to this file

When cutting anything, add an entry with the same five fields: what, why, restore signal, cost, and any guardrails that keep the cost low. An entry with no restore signal is not deferred work — it is a decision, and it belongs in `00-PROJECT.md` instead.

---

## D9 — Bezel insert product photography (raised Phase 4)

**Status:** blocked on the vendors, same channel as D7.

Namoki (237 approved inserts) and DLW (250) do not publish a photograph of
a bezel insert on its own. Namoki renders each insert already fitted to a
complete watch; DLW shoots them on wrists and props. Between them that is
487 of 681 inserts — 71.5% of the category — with no recoverable
top-down image, which is what holds the Phase 4 preview's insert layer at
27.5% ready and puts pass measure 2 out of reach by arithmetic rather than
by effort (see specs/05-phase-4-preview.md).

**The ask:** a flat, top-down photograph of the insert alone on a plain
backdrop — exactly what watchandstyle and Lucius Atelier already publish,
and what puts them at 98% and 77%.

**Why it is worth asking:** it is the single highest-leverage unblock left
in the catalog. Nothing else would move a headline number by 30 points.
Bundle it with the D7 dial-date-position request rather than sending two
separate emails.

**Superseded in part (2026-09-14):** inserts are now DRAWN, not
photographed, so this no longer gates the preview and pass measure 2 is
closed by a different route. What survives is the D7 dependency: a
top-down insert photograph is still the normalised input cross-vendor
deduplication needs, and 487 inserts without one is still 487 parts that
cannot be matched by image. Keep the ask; drop the urgency.

**Explicitly not the route:** extracting the annulus from Namoki's fitted
renders. Their templates are consistent enough that masking a radius band
would half-work today, and would break silently when they re-render.
Worse, the arithmetic says even a perfect extraction leaves the measure
unmet, so it would buy a fragile dependency for a number that still fails.

---

## D10 — WS0 leftovers (raised 2026-09-26)

**a. Resolved 2026-09-26 — the 25 mis-parsed case diameters.**
`parseMmFromTitle` read "SKX007 MM" as 7mm, "NMK908 MM300" as 8mm and
"NMK934 MM300" as 34mm. Fixed in `scripts/backfill-attributes.ts`, and the
25 rows set to the skx007-case value (42.5mm) by a targeted update of
`caseDiameterMm` only -- re-running `backfill-attributes` alone wipes
`shapeTag`/`styleTags`/`renderMm`, and the rest of the chain does not
reproduce the committed database from a checkout without raw feeds.
`verify-catalog` now fails on any approved case outside 30–48mm. Kept here
because that check cannot catch an in-range misparse like NMK934; only the
parser fix does.

**b. Three bad-build fixtures have no vendor quote** (bad-007, bad-008,
bad-010). See `data/fixtures/bad-build-sources.md`. *Restore signal:*
vendor text that states the incompatibility, or a decision to drop them.
*Cost:* the headline count is 6 quoted, not 9.

**c. `srpe-case` family constant is 43.8mm**; the DLW SRPE GS EVO listing
states 38mm. Preview-only today. *Restore signal:* WS1 audit of family
constants.

**d. Resolved 2026-09-26 (WS2b) — an insert with no stated outer diameter
drew at 38mm**, overhanging a 37.8mm case. `watchMm` now falls back to case
diameter − 4.5mm (38.0 on the stock 42.5 SKX, 33.3 on a 37.8 case), the rule
the 3D renderer already used. Test in `lib/preview/__tests__/dimensions.test.ts`.

---

## D11 — WS1 leftovers (raised 2026-09-26)

**a. `date-window-alignment` can find errors but may not block yet**
(`lib/compat/evidence.ts`). No dial in the catalog states its cutout
position, so no real bad build exists. *Cost:* its errors show as Checked
warnings (0 raw errors on today's catalog). *Restore signal:* a dial with a
stated cutout position, then a quoted fixture. *Guardrail:*
`known-builds.test.ts` fails if a rule enters `VERIFIED_RULES` without a
quoted fixture. *Resolved 2026-09-26 for `dial-case-diameter`:* the Panda and
Skipper dials now carry their stated 29.5mm, and bad-021 (Panda in the RC0973
SRPE case, "Can only accommodate 28.5mm dials") backs it.

**b. Resolved 2026-09-26 — movement calibers and crown variants applied.**
A targeted update set `caliber`, `hasDay`, `hasDate`, `heightMm` and
`crownPosition` on 23 approved movement-slot parts (10 complete movements, 13
NH36A spare wheels, matching how the backfill already treats spares), exactly
as `scripts/backfill-attributes.ts` now derives them.

**c. 26 Lucius "SKX Crown II" crowns block on SKX007 cases** although their
listings say "For the SKX013 & SKX007": tagged `skx013-crown`, and a family
has one case line. 26 × 278 SKX007 cases = 7,228 false blocks (never a false
fit). *Restore signal:* a per-part list of extra case lines the listing
names, read by `crown-case-fit`.

**d. `marketplace-stated` and `user-entered` exist in the engine only.**
`SpecSource` and the evidence policy handle them; `lib/db/schema.ts`'s
`SPEC_SOURCES` check constraint does not, because no such rows exist until
WS4. *Restore signal:* WS4 stores its first bring-your-own part.

**e. The shop pitch** (WS1 step 7's third home for the guarantee) doesn't
exist yet. *Restore signal:* WS7. Use `lib/guarantee.ts`.

---

## D12 — WS2b leftovers (raised 2026-09-26)

**a. One Blender process per render job.** Scene build (~10s) costs more
than the render (~5s at 256 spp + OIDN; WS2a). *Cost:* about two-thirds of
runner wall time. *Restore signal:* the full manifest takes too long to
rebuild (168 jobs today). *Fix:* build each case shape once and render its
layers in one process.

**b. One modelled shape per slot; 741 of 2,868 keyed parts are drawn with
the nearest one and marked `approximated`** (owner's decision, 2026-09-26:
nearest shape, labelled). By count: `ring-plain` 308 → angled ring;
`crown-smooth` 115, `crown-chunky` 35, `crown-coin` 31, `crown-onion` 9,
`crown-bolt` 4 → knurled; `hand-three-lobe` 54, `hand-dauphine` 39,
`hand-baton` 32, `hand-faceted` 20, `hand-arrow` 12, `hand-cathedral` 7,
`hand-syringe` 7, `hand-pencil` 4 → sword; `insert-slope` 29 → flat;
`strap-bracelet` 21 → mesh; `strap-band` not named leather or rubber 14 →
rubber. *Guardrail:* the index carries `approximated` and `actualShape` per
part; WS2c step 8 must label them. *Restore signal:* model a shape, add its
key in `lib/render/shape-keys.ts`; the manifest renders only what's new.

**c. Stated part sizes aren't applied in 3D.** Insert, chapter ring, hands
and crown are drawn at fixed modal sizes (insert sized from the case);
`renderMm` is ignored. *Cost:* e.g. 12 inserts stating 33.6mm draw at the
case's bezel size. *Restore signal:* renderer takes those sizes as
parameters; they then join the shape key.

**d. 25 approved cases not renderable.** SRP Turtle 4, VK63/64 3, Namoki N4
3 (need their own outline; plan: paid setup job) and 15 Lucius Ultra Thin
(no stated lug width or aperture). *Restore signal:* a pilot shop needs one
of them, or Lucius dimensions stated.

**e. Neutral renders bake prototype textures** from the gitignored
`scripts/3d-test/out/` (dial cut-out, insert/ring/date prints). A fresh
checkout can't run `scripts/render/run.ts` until the prototype's texture
scripts have run; the runner fails loudly naming the missing files.
*Restore signal:* WS2c (appearance moves to the browser).

**f. Four of the six case shapes render wrong.** The renderer's fixed
constants were only ever checked on the 42.5mm SKX. On `case:round/36`,
`/37.8`, `/38` (SKX013, 50 cases) the insert vanishes and on `/39.5`
(Alpinist-style, 9) it is a sliver: its outer follows the case (−4.5mm) but
its bore is fixed at 31.8mm, while SKX013 inserts state 33.6/27.6. The 36mm
case layer also shows a boolean hole through the front flank (hidden behind
the strap when stacked). 42.5 and 43.8 look right. *Guardrail:* don't show
these four shapes to users until fixed. *Restore signal:* D12c (stated or
case-scaled insert bore) plus a per-case-shape visual check; WS2c's "SKX
shape family end to end" measure covers it.

---

## D13 — WS3 leftovers (raised 2026-09-26)

**a. WS3 step 1 deferred (owner, 2026-09-26): crystal pre-installed, stem
included, sold as a kit.** No listing text is on this machine: `data/raw/`
is empty and `data/tagged/` carries names and parsed attributes only. First-build
mode therefore can't prefer kits with a fitted crystal, and the tool list
can't drop the crystal press for them. "Matched bracelet" works without it:
straps whose family shares the case's platform rank first. *Restore signal:*
fetch the vendors' feeds into `data/raw/` (no DB write), parse the four
attributes, then a targeted, owner-approved update.

**b. Case `crownPosition` is the family value on all 321 cases that have
one (3.8)**, including cases named "3 O'clock" (e.g. RC0494 … SKX Conversion
Case). So nothing can pick the right "@ 4H crown" / 3.8 movement variant for
a case. *Guardrail:* first-build mode offers only standard NH35/NH36
variants (no crownPosition). *Restore signal:* per-case crown position read
from the listing name.

**c. Engine gaps found by first-build mode** — builds that evaluate with no
error but aren't a watch a beginner can assemble: a caseback, gasket or tube
in the case slot (`CASE_COMPONENT`); a hand cap or lone seconds/GMT hand in
the hands slot; GMT or VK chronograph hands on an NH35/NH36. First-build
mode excludes them (`lib/first-build.ts`); the full configurator still
offers them as compatible. *Restore signal:* rules that say a component
isn't the part the slot needs, with fixtures.

**d. Pass measure 3 (three first-time builders complete the flow) needs
people**, not code. *Restore signal:* owner runs the session and records
where they hesitate.

---

## Not deferred — decisions, recorded here so they are not re-opened as work

These have no restore signal. They are listed only because each looks like
an open TODO to someone reading the phase specs, and each is not.

- **Route B (full facet geometry) — closed, 2026-09-14.** It refines edge
  fidelity, which is already Route A's strength, and does nothing for the
  flat interiors that are the actual remaining gap. If the preview is
  pushed further the next thing to try is interior surface character, and
  that is a new investigation rather than a revival of this one. Reasoning
  in `05-phase-4-preview.md`.
- **The dial stays a photograph.** Not an unfinished part of the drawn
  rollout. `05-phase-4-preview.md`.
- **`attributes.lengthSetMm` stays null** even though hand lengths are now
  parseable from listing text. `hand-stack-clearance` keys off it, and a
  dimension mined from marketing prose is good enough to draw with and not
  good enough to assert a fit from. The drawn size lives in
  `attributes.renderMm`, which `lib/compat` never reads.
