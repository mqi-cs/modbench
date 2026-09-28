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

## D14 — WS2c leftovers (raised 2026-09-27)

**a. Whole-build p99 over threshold on two of three builds** (V1 41, V2 34
against ≤ 30; MAD passes on all three). The error sits on the polished
hands, darker than the full render. *Restore signal:* a visible difference
reported, or time to trace the hands layer's shadow-catcher lighting.

**b. Strap colour isn't applied.** Straps are finished renders per build
(six shapes), drawn in their default colours; labelled "shape only, colour
not shown". *Restore signal:* UV-mapped strap passes like the printed layers.

**c. Insert, chapter ring and date wheel use generic generated prints** by
colour (black / blue / gold / steel inserts; white / gold / cream rings).
Labelled "generic print … not this part's own design". No catalog photo is
usable (inserts shot lume-lit, rings at three-quarters). *Restore signal:*
top-down vendor photos, unwrapped by polar transform (plan step 5).

**d. Dials without a prepared photo (30.8 %) fall back to the SVG diagram**,
with the reason shown. Dial windows aren't cut: the vendor photo's window
shows as photographed, and the date layer only shows through a print that
has a transparent window. *Restore signal:* prepare-assets cuts windows by
flood fill for every dial.

**e. The date layer is lit as if the dial had no window** (the dial is hidden
for it, since solid geometry would shade it completely). Slightly bright
through a real window. *Restore signal:* a visible difference.

**f. Render output isn't deployed.** `public/render/layers/` is gitignored
(content-addressed, regenerable, ~hundreds of MB); a production site must
host it. *Restore signal:* WS7 hosting.

**g. The configurator re-evaluates every picker option on each change**
(over a second of wall time in the swap test), separate from the 5–43 ms
preview swap. *Restore signal:* part swaps feel slow.

D12e is partly resolved: printed layers no longer bake any texture, but the
renderer still loads the prototype textures when it builds a scene.

---

## D15 — WS4 leftovers (raised 2026-09-27)

WS4's offline core is built: host allow list, `submitted_parts` table,
extraction from title and item specifics, confirmation screen, storage and
the engine at the Unconfirmed tier. No marketplace API credentials exist on
the build machine, so everything that needs one is deferred.

**a. Parser fixtures from 20 real listings per platform** (pass measure 1).
The extraction tests use synthetic, marketplace-style titles. *Restore
signal:* `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` set; pull 20 real items
through `lib/byo/ebay.ts` into a fixture with expected extraction. *Cost:*
S per platform.

**b. AliExpress has no client.** Its links are accepted and go straight to
manual entry. Open Platform product details need approved developer access.
*Restore signal:* approval granted. *Cost:* S (a second `fetch*Listing`).

**c. The eBay Browse client is untested against the live API.** Zod
validation means a changed shape falls back to manual entry, never a
half-filled part. Multi-variation listings (`get_item_by_legacy_id` error
11006) also fall back. *Restore signal:* credentials, as (a).

**d. No canonical-part match** (step 5, hash plus colour). It needs the
listing photo, which only the API returns. *Restore signal:* (a); reuse
`lib/dedup/`. *Cost:* M.

**e. The photo quality gate is built but not wired in; submitted parts
aren't previewed in 3D** (step 8, pass measure 4). *Updated 2026-09-28:*
`lib/byo/photo-gate.ts` rejects low-resolution (< 500 px short side),
lume-lit, non-frontal and not-alone photos, using the catalog's own asset
classifier plus a roundness test. It's tested on the synthetic images in
`data/fixtures/photo-gate/` only. Nothing calls it yet, because the manual
flow has no photo. In the 3D preview, every submitted part is labelled
"not previewed: not in the render index", and it draws in the SVG diagram
from its stated sizes. *Restore signal:* (a) and (c): real listing photos.
Then check the thresholds against them, fetch images only from the
platform's image host, and feed passing dial and insert photos to the
compositor. *Cost:* M.

**f. No affiliate links** (step 9). Submitted parts link to their canonical
listing URL only. *Restore signal:* EPN / AliExpress affiliate accounts.

**g. No review or promotion script.** Submitted parts land `pending` in
`submitted_parts`; nothing moves one into `parts`. *Restore signal:* the
first submission worth promoting. *Cost:* S, modelled on
`scripts/review-merges.ts`.

**h. Submitted parts are left out of the build total.** There's no
listing price without the API. The summary and shared page name each part
the total leaves out. *Restore signal:* (a); take the price from the API
response.

**i. Retention and dead listings** (open question): submitted parts are
kept indefinitely. *Restore signal:* a storage or terms-of-use decision.

D11d is resolved differently from how it was worded. The new sources live in
`submitted_parts`, whose check constraint allows only `marketplace-stated`
and `user-entered`. `parts.spec_source` stays vendor-only, because the
catalog pipeline is the only thing that writes it.

---

## D16 — WS5 leftovers (raised 2026-09-27)

WS5's harness runs with one command (`pnpm eval:describe`) and the keyword
path is measured. The model path waits on a provider choice and a key.

**a. No model chosen, no key.** `lib/llm.ts` reads `LLM_PROVIDER` /
`LLM_MODEL` / `LLM_API_KEY` / `LLM_BASE_URL` (see `.env.example`):
Anthropic, or any OpenAI-compatible API. It's untested against a live
provider; both request shapes are tested with a stubbed `fetch`. *Restore
signal:* a key in `.env.local`, then `pnpm eval:describe --mode model`.
*Cost:* S. The run is capped at `EVAL_MAX_USD` (default $1); about $0.07
on Sonnet 5.

**b. Human 1–5 ratings not done.** `data/eval/describe-to-rate.md` lists the
top build for each query; ratings go in `data/eval/describe-ratings.json`.
*Restore signal:* the owner rates them. *Cost:* S (about 30 minutes).

**c. The eval set was written by the same session that knew the
vocabulary,** so the keyword path's 98.6% must-have recall is optimistic.
*Restore signal:* real user queries (logs, or a small user test); add
them to `data/fixtures/describe-eval.json` without moving the thresholds.

**d. Every suggestion fills a bezel insert, even for dress watches.**
"Blue sunburst dress watch" gets world-time, GMT and dive-scale inserts,
and the cheapest movement variant (day-date, 4 o'clock crown). *Restore
signal:* ratings below 2 on dress queries. *Cost:* S (rank `plain-bezel`
first when `dressy` is asked for, or leave the insert out).

**e. The image path sends the text-parsing system prompt** alongside its own
image prompt (this predates WS5, unchanged). *Restore signal:* WS6 image
evaluation.

**f. OpenAI-compatible requests send `max_tokens`.** Most servers accept
it; some newer OpenAI models want `max_completion_tokens`. *Restore
signal:* a 400 from the chosen provider.

---

## D17 — WS5 search quality deferred (owner, 2026-09-28)

**What's deferred:** improving what describe-a-watch suggests. The harness
(`pnpm eval:describe`) and its thresholds stay as they are; only the work of
making the suggestions good is put off.

**Why:** the top builds for the 30 evaluation queries
(`data/eval/describe-to-rate.md`, keyword path) are often poor matches for
what was asked, even though all 88 suggested builds have zero errors:
- h2 "something like a Pepsi GMT" gets a root-beer dual-time insert
  (CI1256) and a dark-blue 62mas dial: "GMT" and "two-colour" are read,
  the red/blue colours of a Pepsi bezel are not.
- h3 "Royal Oak style blue dial" gets a round SKX Samurai case with a
  blue world-time insert: no octagonal case exists (D12d, WS2c known
  limits), and nothing says so.
- D16d: dress queries get dive, GMT and world-time inserts (p1 "blue
  sunburst dress watch" → AI0079 world-time insert on a 4 o'clock
  day-date build).
- b3 "dress watch without a date, around £250" gets an NH34A GMT movement,
  a date dial and an orange diver insert.
The owner prefers to spend time on WS4 and shop readiness first.

**Guardrails:**
- WS5 stays "merged, not passed" in the plan. Nothing here marks it passed.
- WS6 (photo-to-build) stays blocked: it depends on WS5 passing.
- Don't change the eval set, the thresholds (`47c1860`) or
  `data/eval/describe-ratings.json` to make the numbers look better.
- The zero-error guarantee still holds: suggestions go through
  `evaluateBuild` and blocked builds are discarded.

**Restore signal:** before WS6 starts, or before any shop is shown the
describe feature, whichever comes first.

**Cost:** M. D16a (a model run, about $0.07 per run on Sonnet 5), D16b
(owner ratings, about 30 minutes), D16c (blind queries), D16d (S), plus
ranking fixes: honour negations ("without a date"), treat named homages
without a buildable case shape as "not available" rather than silently
substituting, and don't fill an insert for dress queries.

---

## D18 — 3D preview polish deferred (owner, 2026-09-28)

**What's deferred:** the 3D preview beyond the round 42.5/43.8 mm SKX shapes.
- **D12f, still open:** on `case:round/36`, `/37.8` and `/38` (SKX013
  sizes) the insert disappears, and on `/39.5` it's a sliver. The render
  index keys 59 approved cases to these four shapes (36 mm 11, 37.8 mm 36,
  38 mm 3, 39.5 mm 9), and `resolveScene` draws them in the configurator
  today. That goes against D12f's own guardrail ("don't show these four
  shapes to users until fixed").
- **Non-round cases** (octagonal and integrated-bracelet homages, Turtle,
  VK63/64, Namoki N4, and the other D12d cases) aren't renderable in 3D.
  They fall back to the SVG diagram, with the reason shown.

**Why:** WS2c was validated only on SKX-family builds (V1/V2/V3, the round
42.5 mm case). Fixing the small-case insert bore (D12c) and modelling new
case outlines is render-machine work (glossy renders go on the OptiX
machine, see the plan's §17), so it's deferred behind WS4 and shop readiness.

**Guardrails:**
- WS2c pass measure 1 ("SKX family end to end") is partial because of
  D12f. It counts as met only if the owner accepts this deferral.
- Every approximated or unrenderable case keeps its label in the preview.
- Don't claim 3D coverage beyond the 42.5 and 43.8 mm round shapes in any
  pitch.

**Restore signal:** a pilot shop's catalog is mostly SKX013-size or
non-round cases, or a user reports a missing insert in the 3D preview.
Either way, fix D12f before any shop-facing demo that uses those sizes.

**Cost:** D12f is S–M: a case-scaled or stated insert bore (D12c), a
re-render of the 4 shapes on OptiX, and a visual check. Each new case
outline is L, and is costed as a paid setup job in WS7.

**Update 2026-09-28 (WS2c follow-up, D19):** the D12f guardrail is now
enforced. `resolveScene` draws only `CHECKED_CASE_SHAPES` (42.5 and 43.8 mm)
and cases without a built-in bezel; anything else falls back to the diagram
with the reason. Hidden: 63 approved cases (59 by size, 4 NMK926 by bezel).

---

## D19 — WS2c follow-up: preview stand-ins (raised 2026-09-28)

**Un-deferred from D18, and why.** D18 deferred 3D preview polish. Part of
it was pulled back the same day (owner, 2026-09-28) because it wasn't
polish: any build without a chapter ring showed a transparent band and a
black rim at the dial edge (the case layer holds the ring out; the dial is
lit with the ring's shadow). That was every first build and every starter
build, on 317 in-scope cases. Done: the case's own ring where the vendor
states one is built in (31 cases), a labelled clay stand-in for the dial,
ring and insert otherwise, a `chapter-ring-unstated` warning, the D12f
guardrail, and an outside-in first-build order. Scope: SKX family only
(42.5 and 43.8 mm).

**a. Bore-wall renders for builds with no ring (option A).** A ring-less
build draws a clay stand-in ring labelled "placeholder shape, not part of
this build", not the bare bore the watch would really show. *Restore
signal:* the next session on the 3050. *Cost:* 72 glossy case jobs (9 hero
case, 9 top case, 54 hero case+strap, rendered without the ring held out)
on OptiX, plus 4 matte dial surface jobs without the ring's shadow; at
WS2a's ~15 s per job (~10 s scene build + ~5 s render, D12a) about 19 min
of wall time, plus ~50 s first-compile. Then a scene branch and a label.

**b. No hands or strap stand-ins** (owner). *Restore signal:* a measured
failure. It fired (c), and was answered by fixing the render, not with a
stand-in; still none needed.

**c. Resolved 2026-09-28 (b88c6cc) — the hands' shadow was baked into the
dial pass, and drawn twice on complete builds.** Confirmed on V1 without
rendering: in the shadow the composite was 7.3 levels darker than the
full render, and the composite without hands already matched it (+0.9).
Hands are now hidden in the dial and date layers (revision 2,
owner-approved); all 24 dial/date surface jobs re-rendered (matte, Metal),
the other 312 adopted. After: no-hands shadow 0 px; V1 shadow −2.3,
pixels over 8 levels too dark 6,316 → 1,289.

**d. Exploded view** (owner, out of scope). *Restore signal:* a shop or
user asks to see how the parts stack. *Cost:* M.

**e. Cases with a built-in bezel** (16, `integratedBezel`) aren't drawn in
3D. The engine part is resolved 2026-09-28 (b8472ee): `integrated-bezel`
errors on a separate insert or bezel (bad-024; 16,240 pairs blocked that
family matching passed), and first-build skips the insert on them.
*Restore signal (3D only):* a pilot shop sells these cases. *Cost:* L, a
new case outline (paid setup job, WS7).

**f. A built-in ring is drawn with the generic white printed ring**, while
the vendors describe a brushed rehaut; labelled "generic print … not this
case's own design". *Restore signal:* a user or shop points at it.
*Cost:* S, a plain brushed print.

**g. `chapter-ring-unstated` warns once on a ring-less build of a case that
doesn't say** (310 of 363 approved cases). Reworked 2026-09-28 (owner,
b69bfff): no ring chosen and none built in, once per build, fix names the
ring to add, no longer tied to the dial; case × dial pairs judged clean
6.9% → 90.8%. No vendor says a ring is
optional: DLW lists it under "Complete your mod with", namokimods under
"Fits all … Chapter Rings", Watch & Style under "sold separately" (two
Samurai conversion cases, RC0683/RC0684, say "All you need are the insert,
glass, and chapter ring" -- read as a shopping list, not a requirement).
*Restore signal:* a vendor states a ring is optional (then
`requiresChapterRing: false` for that line), or the warning count
becomes a complaint. *Cost:* S per vendor line.

**h. Resolved 2026-09-28 (owner, b8472ee) — the 22 cases that need a
chapter ring aren't offered in first-build**, so first builds stay at 6
parts; the ring step is gone. *Restore signal for offering them:* a
first-build limit above 6. *Cost:* S (the ring step is in git history,
2407f81).

**i. Resolved 2026-09-28 (b88c6cc)** — the revision-2 run rewrote the
index; the 37 rejected casebacks are gone from it.

**j. Resolved 2026-09-28 — V1–V3 accuracy is reproducible.**
`scripts/render/accuracy.ts` (4164191). §17's tool was never committed
and its numbers (1.13/27, 1.50/22, 0.81/15) couldn't be reproduced; this
script's are the baseline (owner): revision 1 at 4164191 V1 1.11/21,
V2 1.50/21, V3 0.83/13; revision 2 at b88c6cc V1 0.95/14, V2 1.42/21,
V3 0.76/10.

---

## D20 — Top-view look (renderer revision 3, raised 2026-09-28)

The view from above read as an illustration. Shipped (owner chose #2 and #6
of the lever sheet): an 85 mm lens instead of orthographic (the flanks and
bezel edge show), and a top-down studio set seen in reflections only (dim
surround, two strip boxes, an overhead softbox), with stronger brushed
grain. Diffuse light is unchanged, so prints and lume are lit as before.
Hero untouched (231 jobs adopted); 105 top-view jobs re-rendered.

**a. Rendered on Metal, not the 3050** (owner, 2026-09-28), against §17's
rule for glossy renders; 57 of the 105 are glossy (case finishes, straps).
*Restore signal:* the next 3050 session, or a visible difference reported
between top and hero metal. *Cost:* ~15 min on OptiX (`run.ts` after
removing the top-view outputs; nothing else changes).

**b. V2 composite accuracy dropped** from 1.42/21 to 2.36/28 (still inside
WS2c's MAD ≤ 3, p99 ≤ 30). Not traced. *Restore signal:* a visible seam in
the top view, or the next accuracy claim. *Cost:* S–M, locate the worst
pixels as §17 4a did.

**c. Levers not taken yet** (sheet in the owner's temp folder): bigger
bezel with a wider polished bevel (#4), a curved case top, the case outline
and crown guards, bracelet link detail, then a wider frame showing the
whole watch (#1). No drop shadow: a shadow-catcher table greyed the whole
48 mm frame. *Restore signal:* owner picks the next lever. *Cost:* M–L
each; geometry changes re-render both views.

## D21 — Case outline accuracy (raised 2026-09-28)

Measured: the 3D outline was one parametric SKX silhouette (diameter + lug
width) for all 276 drawn cases, 147 distinct models. Done (renderer
revision 4): cases whose title names a non-round outline (B&R/"Square",
Nautilus, Tuna, Turtle: 38 drawn) fall back to the diagram; crown at 3 (50)
and no crown guard (32) come from the title into the case layer's key; the
generic outline has chunkier, straighter lugs with squared tips and a guard
either side of the crown; spring-bar holes are drilled per lug.

**a. The engine's crownPosition contradicts 47 case titles.** Cases titled
"3 O'Clock" / "3H" carry `crownPosition: "3.8"`, the skx007-case family
constant (backfill-attributes.ts CASE_CROWN_POSITIONS). Rules that read it
(movement crown variants, date alignment) may judge them as 3.8 cases.
Not changed: it would move engine results. *Restore signal:* owner rules
on whether the title's statement overrides the family constant (it is
vendor-stated). *Cost:* S, one pattern in the backfill plus a quoted
fixture.

**b. Non-round outlines** (square, octagonal, shrouded, cushion) aren't
modelled. *Restore signal:* a pilot shop sells them. *Cost:* L per outline.

**c. Models drawn with the generic outline though theirs differs:** MM300
style 29, Samurai 17, Sumo 2. Vendor photos are one three-quarter shot per
listing, so an outline means rectifying that photo (the round case opening
gives the tilt) or vendor drawings. *Restore signal:* a shop's catalog is
mostly one of these. *Cost:* M per model.

**d. The SVG diagram keeps the old outline** (lib/preview/art/parts.tsx).
*Restore signal:* the two side by side look inconsistent to a user. *Cost:*
S–M, port the constants and the tip shape.

**e. Renders are made for cases the preview won't show** (other sizes,
non-round outlines): the manifest keys every renderable part. *Restore
signal:* render time matters. *Cost:* S, skip hidden cases in the manifest.

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
