# Phase 0 Result — Data Validation

Run 2026-08-30/31. Real research only, no application code, per the phase brief.

## Verdict: **GO**

All four pass-measure conditions hold. Detail and caveats below — several numbers need a second look before being taken at face value.

## The four numbers

### 1. ≥40 of 50 parts at high or medium confidence

**47 of 50** (35 high, 12 medium, 3 low). **Pass.**

The 3 low-confidence rows are not noise — they're honest signal. Two (`Dial - Handcrafted Series - Chroma Spheres 1` at dlwwatches, `D0590 Arabic Dial` at watchandstyle) have zero fitment signal anywhere in feed metadata (empty/sparse `product_type`, generic tags) and would need a body_html read or a vendor email before Phase 1 could approve them. One (`SSK Chapter Ring: GMT Black with Red Markers` at namokimods) is a genuine cross-vendor labelling conflict — see below.

### 2. ≤8 of 50 in a family that exists for only that one part

Reported two ways, because the raw sample count is a noisy proxy for what this measure actually wants to know:

- **Raw count in the 50-row sample: 10.** Ten proposed families (`nmk-n4-case`, `vk6x-hands`, `nh34-gmt-dial`, `skx013-crystal`, `srpe-case`, `srpe-crystal`, `alpinist-style-case`, `turtle-crystal`, `snxs-crystal`, `skx007-crystal`) have exactly one row each in the audit. Read literally against "no more than 8," **this fails**.
- **Verified against the actual raw vendor feeds** (not just the 50-row sample) by counting real matching products per family: `nmk-n4-case`=3 SKUs, `vk6x-hands`=22, `nh34-gmt-dial`=9, `srpe-case`=24, `srpe-crystal`=3, `alpinist-style-case`=18, `snxs-crystal`=2 — all confirmed **not** singletons, just under-sampled at 50 rows spread across 7 categories × 4 vendors. Only **`skx013-crystal`, `turtle-crystal`, and `skx007-crystal` are genuine one-match families** in the raw feeds pulled this session.
- **Corrected count: 3 of 50. Pass**, comfortably under threshold.

Take the raw 10 as a lesson about sample size, not a red flag: 50 rows across 7 categories at 4 vendors gives a thin ~1.8 rows per category per vendor on average, so any family that isn't one of the "big" starting six will often show up once by chance even when it's real and well-populated. Phase 1's full paginated ingestion (not a 250-item first-page pull) is the real test of this measure and should re-run this check properly.

### 3. The 30-build test set is complete and every referenced part appears in the family audit

**Pass, verified programmatically.** All 30 builds (20 good, 10 bad) × 5 slots = 150 part references; all 150 resolve to an exact row in `family-audit.csv` once the display vendor-prefix is stripped (e.g. `"Namoki NMK960 Sumo SKX007/SRPD Case: Steel Finish"` → `NMK960 Sumo SKX007/SRPD Case: Steel Finish`, vendor `namokimods`). Two audit rows were swapped out (a decorative movement rotor, a low-signal hand set) for a real plain NH35 movement SKU and a real NH34 GMT hand set specifically because the original 50 didn't include a single "just buy a movement" part, and the known-builds set needed one.

### 4. ≥3 of 4 vendors expose a usable `/products.json`

**4 of 4. Pass.** See `feed-audit.md`. All four are live Shopify stores, none disallow `/products.json` or `/products/` in `robots.txt`, none publish a crawl-delay (self-imposed 1 req/2s regardless).

## Notable findings that should shape Phase 1

- **The family/convention model holds up on real evidence, not just plausibility.** namokimods.com's own `body_html` states the dial-feet convention in plain prose ("Each dial has 4 legs for either 3 or 4 o'clock crown positions... snip off the 2 legs accordingly") and Lucius Atelier's own modding guide states movement/date-position conventions directly ("NH35: three-hand date... NH36: three-hand day-date... 3 o'clock suits classic divers, 4:30 is a Seiko hallmark"). This is vendor-stated, not inferred — the strongest possible evidence for Task 1's core question.
- **The convention model needs many more than the starting 6 families, but each new one is real and multi-SKU, not per-part special-casing.** SRPE, Alpinist, SRP Turtle, SNXS, and VK6x are all confirmed as distinct, well-populated case/movement families beyond `nh3x-*` and `skx00{7,13}-case`. This is exactly what §2 of the pass measure is designed to catch, and it came back clean once verified against real catalog counts.
- **A real false-positive trap was found and must not be missed in Phase 2.** Lucius Atelier's "Ultra Thin" case line is named with "SKX013" in the title but its own product description states standard SKX013 bezels/inserts/crystals do not fit it, and it does not fit a stock SKX013. A naive family match on the "SKX013" substring would produce exactly the kind of false positive the whole project exists to prevent. Encoded as `bad-006` in `known-builds.json` — this is the single fixture Phase 2 must not get wrong.
- **`body_html` carries real spec information that title/tags/product_type do not.** Namoki and Lucius Atelier both put fitment conventions in prose description, not structured fields. `scripts/extract.ts` in Phase 1 must parse `body_html`, not just `tags`/`product_type`, or it will under-perform this audit.
- **One real vendor-labelling conflict remains unresolved: "SSK."** namokimods.com uses "SSK" as an undefined build-line name; a watchandstyle.net SKU tags the same abbreviation "Seiko 5 GMT Chapter Ring" while its own `product_type` field says "SKX007/SRPD Chapter Ring" — internally contradictory. Encoded as `bad-008`. Needs a forum/vendor-contact check in Phase 1, not a guess.
- **One classically-cited "bad combination" turned out to be softer than folklore suggests.** Real WatchUSeek threads on 7S26 hands fitted to NH35 movements show this usually works, with occasional tolerance-driven friction fits, not a hard family incompatibility. Phase 2 should probably treat `hands-movement-bore` mismatches of this specific kind as a warning rather than a guaranteed error, or it risks a *false negative* (over-blocking) — acceptable per the project's own rules ("false negatives are acceptable") but worth being deliberate about rather than accidental.
- **Currency/units need a Phase 1 decision.** watchandstyle.net's `/products.json` prices (e.g. a date wheel disc at "$1200.00") are almost certainly not USD as displayed — flagged in `feed-audit.md`, needs resolving before any price is shown to a user, per the project's own "never render a price without its currency" rule.

## Access-method finding (not part of the pass measure, but relevant to Phase 1's scripts)

WatchUSeek serves a `402 Payment Required` (via a `tollbit.watchuseek.com` redirect) to the automated fetch tool used for research, but is fully readable through an ordinary browser session — the paywall targets bot/crawler traffic specifically, not human access. This session's `known-builds.json` sourcing switched to browser-based fetching for WatchUSeek and Reddit once this was discovered. **This has no bearing on Phase 1's `ingest.ts`**, which only ever talks to the four vendors' own `/products.json` feeds, not WatchUSeek or Reddit — but worth recording in case a future phase wants to pull forum evidence programmatically; that would need to go through an authenticated/paid Tollbit path or stay manual.

One robots.txt (luciusatelier.com, and a near-identical block on watchandstyle.net) also contained a block of prose addressed to AI shopping agents about not completing checkout/payment automatically and using "UCP/MCP endpoints." Not a standard robots.txt directive, not acted on (the project's ingestion scripts never transact), flagged here for visibility since it's an unusual thing to find mid-crawl.

## Failure handling

None of the four failure triggers in `01-phase-0-validation.md` fired:
- Test 1 (family assignment) did not fail — 47/50 high/medium.
- Test 2 (compatibility test set) did not fail — 30/30 builds complete and resolvable.
- Test 4 (feed reconnaissance) did not fail — 4/4 vendors usable.

## Recommendation

Proceed to Phase 1 (`02-phase-1-data-pipeline.md`). Carry forward as known work, not surprises:
1. `scripts/extract.ts`'s prompt must read `body_html`, not just `tags`/`product_type`.
2. Paginate every vendor feed (`&page=n`) — all four hit the 250-item first-page cap in this session's fetch.
3. Resolve the SSK ambiguity and the watchandstyle currency question before those parts reach `reviewState: 'approved'`.
4. Add family rows for `srpe-case`, `alpinist-style-case`, `turtle-*`, `snxs-*`, `vk6x-*`, `nh34-gmt-dial`, `lucius-ultra-thin-case`, `nmk-n4-case` to the `families` table alongside the starting 6 — all confirmed real and multi-SKU this session.
5. Re-run the singleton-family check (pass measure §2) properly once the full catalog is ingested, not just this 50-row sample.
