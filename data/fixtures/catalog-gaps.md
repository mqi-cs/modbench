# Catalog Gaps — what's deliberately not fixed

Written 2026-09-01, after the pre-Phase-2 cleanup pass (134-part gap fix,
the unmatched-product-type report, complete-watch exclusion, and the
mechanical fixes that report's first runs turned up). This is the honest
inventory of what's still missing from the catalog and why each gap is
being left alone rather than chased further right now. Referenced from
`specs/08-DEFERRED.md`.

**Snapshot at time of writing:** 4056 total parts, 3439 approved / 95
pending / 522 rejected. `scripts/verify-catalog.ts` passes with 0 hard
failures.

## How this list was produced

`scripts/tag-parts.ts` now tracks (as standard pipeline output, not a
one-off check) every raw product that matched no tagger branch and wasn't
ruled out of scope either — written to
`data/fixtures/unmatched-product-types.json` on every run, grouped by
vendor and `product_type`. That report is the source for most of this
document. Two rounds of mechanical fixes already ran against it before this
was written (closing ~250 SKUs: the Handcrafted Series line, complete
watches, gift cards/tools/services, watchandstyle casebacks, and a lucius
vendor-tagging inconsistency on SKX007 parts) — what's listed below is
what was left after those, plus a few things the report structurally can't
see.

## Real parts with no case-model marker the tagger recognizes

These are genuine SKUs, not junk — they just don't carry a marker
`resolveCaseModelPrefix()` knows (`ssk`, `srpe`, `skx013`, `skx007`/`srpd`,
`turtle`). Assigning a family from a guess would violate Amendment A
(01a-PHASE-0-FINDINGS.md: family is never assigned from the product name
alone without real evidence) — these need either new family
evidence-gathering (photos, stated dimensions, vendor confirmation) or a
maker/vendor lookup table that doesn't exist yet.

- **luciusatelier `Cases` (19 SKUs)** — a whole homage-case line: "GS Watch
  Case", "Explorer Watch Case", "Seikonaut Watch Case", "Datejust Watch
  Case", "Bauhaus 33mm", "1908 36mm", "62GS 36mm", "Pilot 34mm", in various
  finishes. Real product line, but each name is a styling reference (Grand
  Seiko / Explorer / Rolex homage), not a case-model marker this catalog
  tracks. Likely candidates for their own family group eventually (same
  shape as the existing `lucius-ultra-thin-case` family), but that needs
  the same rigor `family-audit.csv` / `singleton-verification.md` applied
  to every other family this session — confirming real shared dimensions
  across the line, not just a shared vendor. A few SKUs in this same bucket
  *do* say SKX013/SKX007 (e.g. "Diver Watch Case - 42mm - SKX007/Submariner
  Edition") but without "Ultra Thin" in the name — whether those share the
  Ultra Thin line's non-standard bezel/insert/crystal interface or are a
  separate, standard-dimension SKX013/007 case at the same vendor is a real
  question, not a mechanical lookup.
- **luciusatelier `Bracelets` (14 SKUs)** — e.g. "Oyster Bracelet 20-16mm
  Brushed". Unlike straps, a bracelet's end-links are typically shaped to
  one specific case (see the `*-bracelet` families already in this
  catalog), so a bracelet with no case-model marker is genuinely ambiguous:
  it could be a universal lug-width-only design, or missing its case
  reference entirely. Needs eyes on the product photos, not a keyword.
- **luciusatelier `Bezels` (3 SKUs)** — e.g. "SNK Tachymeter Bezel
  Silver". SNK is a different Seiko case family (5-series field watches),
  not currently seeded — same "not enough evidence yet" bar as the singleton
  exclusions below.
- **luciusatelier `Dials` (2 SKUs)** — e.g. "Snowflake Dial Open Heart", no
  case-model or movement-family marker in title or tags at all.
- **namokimods `NMK SELs` (6 SKUs)** — solid end-links keyed to this
  vendor's own internal model numbers (NMK932, NMK931, NMK926/935, ...),
  not to SKX/SRPE/Turtle markers. Resolving these needs a namoki
  SKU-number → case-line lookup table, which doesn't exist yet and
  shouldn't be guessed at.
- **namokimods `Namoki X Dials` (4 SKUs)** — a collab/boutique dial
  sub-line ("Cyclic Cyborg Glass", "AF-001"), no case-model or
  fitment marker at all.
- **dlwwatches (1 SKU)** — "Ceramic Insert - Hand-Painted Series - Gem".
  The rest of this vendor's decorative line uses the title "Handcrafted
  Series" (handled this session); this one SKU's handle uses "Hand-Painted
  Series" instead, a vendor-side naming inconsistency on a single item, not
  worth a bespoke branch for one SKU.

## Small hardware, one-off product_types, mostly watchandstyle

19 SKUs across `Clasp` (3), `SRPL "Shogurai" Hexad` bracelet-adjacent (2),
`SKX007/SRPD Spring Click` (2), `20mm`/`22mm Springbar` (3),
`Buckle` (2), `SKX007 Super Engineer` (1), `Endlink` (1),
`SKX013 Spring Click` (1), plus a stray empty-`product_type` "lightning
second hands" listing (1). Each is a real, small, single- or
few-SKU product_type this catalog's branches don't have a rule for.
Individually too small to be worth a bespoke branch each (unlike the
Handcrafted Series line or the casebacks, which were each 20+ SKUs under
one consistent, mechanical pattern) — revisit if any of these grows, or
in a dedicated hardware-categories pass.

- **namokimods `Custom Bundle` (5 SKUs)** and **`NMK Cases` (18 SKUs,
  "... Tool Case Bundle")** — multi-part bundles (tools + case, or several
  parts sold together). Same reasoning as the "Yard Sale" exclusion: a
  bundle isn't a single catalogable part, and unlike Yard Sale these aren't
  uniformly named enough to write one clean rule for without checking each
  bundle's actual contents.
- **namokimods `SKX007/013/SRP Turtle Spare Parts` (7 SKUs total)** — small
  mechanical spare parts (e.g. "SKX007 Bi-Directional Click Spring") with a
  case-model marker in the product_type itself but no tagger branch checks
  this specific product_type string yet.
- **namokimods `NMK951 Components` (1 SKU)**, **`Clasps` (1 SKU)**.

## Deliberately excluded, not "missing" (documented elsewhere, not duplicated here)

- **`snxs-crystal` never seeded** — confirmed at exactly 2 real SKUs across
  all 4 vendors' full catalogs. See `data/fixtures/singleton-verification.md`.
- **Seiko 7S26 movement never seeded** — 1 SKU total (dlwwatches), a
  different movement architecture from the NH3x family this catalog
  scopes. Same singleton bar as snxs-crystal. Rejected with a specific
  reason at ingest, not silently missing (see `scripts/tag-parts.ts`,
  dlwwatches function).
- **Cross-vendor deduplication** — parked after Investigation A/B and the
  Task 5 perceptual-hash check found unnormalized vendor photos aren't a
  reliable dedup signal. Full writeup and restore conditions:
  `specs/08-DEFERRED.md` D7.
- **Complete watches** — 75 luciusatelier + 13 namokimods SKUs, explicitly
  rejected ("a complete, pre-built watch, not a component") rather than
  silently missing.

## What this list is *not*

This is not a list of false positives — nothing here is tagged wrong and
sitting in the approved catalog. Every item above is either `rejected` with
a real reason, or still `pending` at the ingest placeholder, genuinely
never decided. `scripts/verify-catalog.ts`'s review-state invariant (added
this session) guarantees those two states can't be confused with each
other or silently drift.
