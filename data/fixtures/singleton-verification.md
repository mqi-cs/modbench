# Singleton Verification — resolving 01a-PHASE-0-FINDINGS.md's open item

Required before Phase 1 code, per `02-phase-1-data-pipeline.md`'s prerequisites. This is the full record, including a mistake and its correction — if the question ever comes up "how was the core compatibility-families assumption actually validated," this file is the answer, not just the numbers that worked on the first pass.

## Background

Phase 0's family-audit reclassified 7 apparent singleton families (each appearing once in a 50-row sample) as sampling artifacts, based on counting matches in each vendor's `/products.json` **first page only** (250 items, Shopify's default cap). `01a-PHASE-0-FINDINGS.md` flagged that this reclassification happened *after* the count came back failing — "the shape of a measure drifting to fit the result" — and required re-verification with a stop condition: any family at ≤2 real SKUs against the *full* catalog means genuine singletons remain.

## Step 1 — paginate to the real catalog sizes

Phase 0's samples were all capped at the first 250 items. Paginating every vendor to completion:

| Vendor | Phase 0 sample | Full catalog |
|---|---|---|
| namokimods.com | 250 | **1,343** |
| luciusatelier.com | 250 | **627** |
| dlwwatches.com | 250 | **953** |
| watchandstyle.net | 250 | **1,140** |
| **Total** | 1,000 | **4,063** |

Roughly 4x more real products than the page-1 samples implied. This alone explains most of the discrepancy found below.

## Step 2 — re-check all 10 originally-flagged families against full data

| Family | Page-1 count | Full-catalog count | Verdict |
|---|---|---|---|
| `nmk-n4-case` | 3 | 3 | OK |
| `vk6x-hands` | 22 | 22 | OK |
| `nh34-gmt-dial` | 9 | 15 | OK |
| `srpe-case` | 24 | 24 | OK |
| `srpe-crystal` | 3 | 3 | OK |
| `alpinist-style-case` | 18 | 18 | OK |
| `snxs-crystal` | 2 | 2 | **THIN** |
| `skx013-crystal` | 1 | 3 | OK — was undercounted |
| `skx007-crystal` | 1 | **14** | OK — severely undercounted |
| `turtle-crystal` | 1 | 2 | **THIN** (at this point in the analysis) |

8 of 10 resolve cleanly. Two remained at ≤2 even against full per-vendor data: `snxs-crystal` and `turtle-crystal`. Per the stop condition, this needed a decision, not a shrug — put to the user directly rather than reinterpreted unilaterally. Initial decision: **exclude both** from catalog scope, route to `rejected_parts` with reason `insufficient real family size`.

## Step 3 — the optional diagnostic that changed the answer for one of the two

Before finalizing, checked whether these vendors sell *other* SNXS or Turtle parts (dials, hands, inserts, cases) beyond the crystals originally counted — searching all categories at all four vendors, not just "crystal category at the one vendor where a crystal was found."

**SNXS: confirmed genuinely thin.** Searching all four vendors' complete catalogs (4,063 products) for "snxs" anywhere in title/type/tags returns exactly the same **2 products**, both at watchandstyle.net, both crystals:

- `G1387 SNXS Double Dome Sapphire Crystal - Blue AR`
- `G1388 SNXS Flat Sapphire Crystal - Blue AR`

Zero SNXS-related products at namokimods, luciusatelier, or dlwwatches. This is not a sampling gap — it is the complete, real market for this case line across all four vendors: two crystal upgrades and nothing else. **Exclusion confirmed correct.**

**Turtle: the exclusion was wrong.** The same all-category, all-vendor search for "turtle" returns **194 real products**:

| Vendor | Turtle-related SKUs |
|---|---|
| watchandstyle.net | 53 |
| namokimods.com | 61 |
| dlwwatches.com | 80 |
| luciusatelier.com | 0 |

This includes full cases — `NMK902 SRP Turtle Watch Case` (namokimods, 3 finishes) and `Case - SKX007 Turtle` (dlwwatches, 6 finishes) — plus two dedicated conversion case lines at watchandstyle that mount a Turtle-style case onto SKX007/SKX013 dimensions (`RC1463 SKX007/Turtle Conversion Case`, `RC0703 SKX013 Mini Turtle Conversion Case`), and a full accessory range at every category: bezels, ceramic and steel inserts, chapter rings, crowns, casebacks, bracelets, and the crystals originally found.

The original "2 SKUs" count was correct as far as it went — but it only looked at the crystal category at one vendor, which was the wrong unit of analysis for the question "is this a real family." SRP Turtle is a real, well-populated case family, comparable in scale to `srpe-case` (24 SKUs at dlwwatches alone) and larger than several of the "OK" families above. **The exclusion was a mistake, caught by the optional diagnostic before it did any damage** (turtle-crystal was never used in `known-builds.json`, so nothing downstream needs unwinding).

## Final family status

| Family | Status | Real SKU count | Action |
|---|---|---|---|
| `nmk-n4-case` | Confirmed | 3 | Add to `families` seed data |
| `vk6x-hands` | Confirmed | 22 | Add to `families` seed data |
| `nh34-gmt-dial` | Confirmed | 15 | Add to `families` seed data |
| `srpe-case` | Confirmed | 24 | Add to `families` seed data |
| `srpe-crystal` | Confirmed | 3 | Add to `families` seed data |
| `alpinist-style-case` | Confirmed | 18 | Add to `families` seed data |
| `skx013-crystal` | Confirmed | 3 | Already covered under `skx013-case`-adjacent scope |
| `skx007-crystal` | Confirmed | 14 | Already covered under `skx007-case`-adjacent scope |
| `srp-turtle-crystal` (was `turtle-crystal`) | **Corrected, confirmed** | 194 (whole family, all categories) | Add `srp-turtle-case` family to seed data alongside its crystal/insert/chapter-ring/crown members |
| `snxs-crystal` | **Excluded** | 2 (whole family, all vendors) | Route to `rejected_parts`, reason `insufficient real family size (2 SKUs across all 4 vendors, all categories)` |

## The corrected rule

A family confirmed at ≤2 SKUs against a *full* catalog is a **scope question**, not a sign the family model itself is wrong. It says "this specific line is a small or absent part of these vendors' market" — which is exactly what happened with `snxs-crystal`, and is a completely normal, expected outcome for a family that was one of many candidates proposed during exploratory audit work, not one of the core starting six.

The signal that would actually indicate the family model has failed is different in kind:
- **Many** families landing at ≤2 once fully verified (not one or two out of ~15 candidates), or
- A **core** category — case, movement, or anything central to the starting 6 families — coming back thin.

Neither happened here. What did happen — one real exclusion (SNXS) and one near-miss correction (Turtle) — is exactly the kind of noise a real catalog produces, and the lesson is procedural: **check the full category scope across all vendors before concluding a family is thin, not just the slice where a match was first found.** The original `turtle-crystal` count wasn't wrong data, it was too narrow a query.

## What this changes going into Phase 1

- `families` seed data includes the starting 6 plus `nmk-n4-case`, `vk6x-hands`, `nh34-gmt-dial`, `srpe-case`, `alpinist-style-case`, and `srp-turtle-case` (with `srpe-crystal`/`srp-turtle-crystal` etc. as category-scoped members of those case families, same pattern as the starting 6).
- `snxs-crystal` is the only family excluded outright. Any watchandstyle SKU matching it routes to `rejected_parts` with reason `insufficient real family size`.
- Procedural lesson for `scripts/ingest.ts` and the manual tagging step: always paginate every vendor to completion before drawing any conclusion about family size, and when checking whether a family is real, search all categories at all vendors — not just the category and vendor where the first match happened to appear.
