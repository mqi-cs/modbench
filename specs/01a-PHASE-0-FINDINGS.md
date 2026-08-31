# Phase 0 — Findings and Amendments

**Read this before starting Phase 1.** It records what Phase 0 actually found and the amendments those findings force. Where this file conflicts with `02-phase-1-data-pipeline.md`, this file wins.

## Result: GO

| Measure | Threshold | Actual |
|---|---|---|
| Parts at high/medium confidence | ≥40 of 50 | 47 |
| Singleton families | ≤8 of 50 | 3 (from a raw 10 — see below) |
| Test set resolution | 30 builds, all refs resolve | 30/30, 150 refs |
| Vendors with usable feeds | ≥3 of 4 | 4 |

Feeds fetched live from all four vendors on 2026-08-30.

## Resolved — singleton count, verified against full catalogs

The raw 50-part sample showed **10** singleton families, which fails the ≤8 threshold at face value. It passed only after 7 were reclassified as under-sampled rather than genuine singletons — reasoning that was applied *after* the count came back failing, which is the shape of a measure drifting to fit the result. That reasoning needed independent verification before Phase 1 could build on it, not just restating.

**Verified against the complete catalog of all four vendors** (4,063 products total, paginated to completion — the original sample was capped at 250/vendor by Shopify's default page size and undercounted every vendor by 3–5x). Full results and method in `data/fixtures/singleton-verification.md`.

- 6 of the 7 reclassified families confirmed solidly real: 3–24 SKUs each, several far larger than the page-1 sample suggested (`skx007-crystal` went from an apparent 1 SKU to a real 14 once the page cap was lifted).
- 1 of the 7 (`snxs-crystal`) held at exactly 2 real SKUs even against the full catalog, and a follow-up check across all categories at all four vendors (not just crystals) found nothing else SNXS-related anywhere — 2 crystal upgrades is genuinely the entire market for this line at these vendors.
- A near-identical check on `turtle-crystal` (one of Phase 0's original 3 "genuine" singletons) initially looked the same — 2 SKUs, crystal category, one vendor. But re-run across *all categories* at *all four vendors*, "Turtle" turned out to be a full, well-populated case family: 194 real SKUs (cases, bezels, inserts, chapter rings, crowns, casebacks, bracelets) across 3 of the 4 vendors, including two dedicated SKX007/SKX013 "Turtle conversion" cases at watchandstyle and a plain `NMK902 SRP Turtle Watch Case` at namokimods. The crystal-only, single-vendor count was the wrong unit of analysis — it undercounted the true family by two orders of magnitude. Reclassified as `srp-turtle-crystal`, a member of a proper `srp-turtle-case` family, not excluded.

**The corrected rule, stated plainly for next time:** a family confirmed at ≤2 SKUs against a full catalog is a **scope question**, not evidence the family model itself is wrong. It means "this specific line is a small or absent part of these vendors' market" — sensible to exclude (or, as with Turtle, to discover the count was scoped too narrowly and re-check before excluding). The signal that would actually indicate the family model has failed is different in kind: **many** families landing at ≤2 once fully verified, or a **core** category (case, movement, or a part central to the starting 6) coming back thin. One peripheral, fully-verified-thin crystal line (`snxs-crystal`) out of ~15 total families is neither. Two low-SKU-looking crystal lines that resolve to "one genuinely thin, one a scoping mistake" is exactly the kind of noise a real catalog produces — the response is to check each one on its own terms, not to treat either the first failing number or the first comfortable reclassification as final.

If an interviewer ever asks how the core "compatibility families are real, shared conventions" assumption was validated: `data/fixtures/singleton-verification.md` is the answer, including the mistake (turtle-crystal) and the correction, not just the parts that worked the first time.

## Finding 1 — Vendor names actively mislead. This is the important one.

Lucius Atelier's "Ultra Thin" case has **SKX013 in its product name**, but the vendor's own listing states that standard SKX013 parts will not fit it.

A system inferring family from the product title would produce a confident false positive here — the exact failure the project exists to prevent. Encoded as fixture `bad-006`.

**Amendment A — name-only inference is capped at low confidence.**

Family must never be assigned from the product name alone. If the only evidence is the title, confidence is `low` and the part routes to manual review. Evidence that lifts confidence above `low`: an explicit spec line in `body_html`, a vendor category page that states the convention, or a manual determination.

**Amendment B — seed `family_exceptions` by hand.**

The table is now load-bearing rather than speculative. Its first row is the Ultra Thin case, entered manually before any ingestion runs, with a beginner-legible message.

**Amendment C — add a name/family conflict check.**

`verify-catalog.ts` flags any part whose name contains a case or movement designation (`SKX007`, `SKX013`, `SRPD`, `NH35`, `NH36`) that disagrees with its assigned family. Flagged parts go to manual review. This would have caught Ultra Thin automatically.

## Finding 2 — The family model has direct evidence

Two vendors state compatibility conventions in prose in `body_html` — the dial-feet convention and movement/date-window conventions.

This is independent confirmation that specs in this ecosystem are shared conventions rather than per-part attributes, which was the central assumption of the whole design. It also means tagging has real text to work from rather than pure inference.

**Amendment D:** when a part's `body_html` states a convention explicitly, set `specSource: 'vendor-stated'`. Reserve `family-inferred` for parts tagged by convention without vendor confirmation, and surface those in the UI through the `unverified-part` warning rule.

## Finding 3 — Forums are not a data source

WatchUSeek returns HTTP 402 behind a Tollbit paywall to automated tools. That is the site stating it wants payment for programmatic access.

Reading threads in a browser for one-off research is ordinary use, and it is how the Phase 0 fixtures were built. **Do not build automated forum access into this project and do not route around the paywall.** The fixture set is already complete; no further programmatic access is needed. If forum data at scale is ever wanted, the sanctioned paid route is the only route.

## Finding 4 — Two data bugs to fix before ingestion

**A likely currency bug at watchandstyle.net.** The schema stores integer minor units alongside a currency code, so a vendor reporting the wrong currency silently corrupts every downstream total and stays invisible until a user's build total is wrong by ~30%.

**Amendment E — add currency and price sanity assertions to `verify-catalog.ts`:**
- Each vendor's currency matches a known expected value declared in the vendors fixture
- Every price falls within a plausible range for its category (a £4 movement or a £4,000 bezel insert is a bug)
- No listing has a null or zero price

**An unresolved vendor labelling conflict ("SSK").** Determine what it refers to before ingestion. If it cannot be resolved, exclude the affected parts to `rejected_parts` with the reason recorded. Do not guess.

## Amendments to the stack

Both changes are recorded in `00-PROJECT.md` and both are **temporary simplifications for v1**, tracked in `08-DEFERRED.md`:

1. **SQLite replaces Postgres + Docker.** Nothing in Phase 1 needs a database server.
2. **No LLM extraction step.** Tagging is manual or delegated to Claude Code reading the raw feed files. This removes the SDK, the prompt file, batching, and retry logic from Phase 1 entirely.

Neither is a downgrade in data quality. Manual tagging produces better data than a model would, and it means you learn the catalog properly — which matters, because you are the one writing the warning messages beginners will read.
