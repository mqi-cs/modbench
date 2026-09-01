# Competitive Context

**Read before Phase 2.** This file explains *why* certain features exist. It changes emphasis and adds requirements; it does not change the phase order.

## The competitor

**assemble.watch** launched around mid-2026 — earliest datable blog post 6 June 2026, copyright 2026 only. It is a near-identical product: free, no account, a planning tool rather than a retailer, covering NH35, SKX007 and SRPD, with compatibility checking, visual preview, parts lists with vendor links, and build sharing via URL.

Assume feature parity on everything in phases 2–5. Building it again is not the goal.

### What they have that we do not

- Roughly three months of programmatic SEO — blog, glossary, FAQ, beginners guide, keyword landing pages
- A white-labelled configurator running on Lucius Atelier's own catalog
- A Shopify configurator product sold to stores
- A community builds leaderboard

### What they do not have

**Parts sourced from one vendor (Namoki).** This is the gap and it is structural, not an oversight — a cross-vendor comparison tool erodes the pricing power of the vendors they depend on. Their white-label deal makes it harder still for them to add.

**A hard correctness guarantee.** They state they cannot guarantee fitment due to manufacturing tolerances and advise verifying specs with the vendor. Our zero-false-positive standard, tested against 30 real fixture builds, is a stronger claim.

**Tool costs, shipping consolidation, cross-vendor price comparison.** All three are impossible with a single-vendor catalog.

### Where we do not compete

Do not build an SEO content strategy. They have a three-month head start and we will not out-publish them. Acquisition is r/watchmodding and r/SeikoMods, where a better tool spreads on merit. The ten style pages in Phase 5 are sufficient.

## Two unresolved items — resolve before Phase 2 code

### 1. Verify cross-vendor deduplication actually happened

Phase 1 approved **784 parts across 4 vendors** but no pass measure ever checked that the same physical part sold by multiple vendors became **one part with several listings** rather than several separate parts.

**Run this first.** Compare the listings count to the parts count.

- Ratio near 1:1 → deduplication is not happening. Every vendor's copy of a dial is its own part, and there is no price comparison, no consolidation, no cross-vendor advantage — while the catalog still looks healthy at 784 parts. **This is the entire differentiator failing silently.**
- Ratio meaningfully above 1 → working. Spot-check that a part with 3 listings really is the same physical item at all three vendors.

If it is not happening, fix it before Phase 2. Matching the same part across vendors who name it differently, with no shared identifier, needs fuzzy title matching plus image comparison plus manual review — roughly a week, inserted between phases.

### 2. Multi-currency model — DECIDED

Three vendors trade in **SGD**, one in **PHP**. Build totals cannot be a plain sum of native prices.

**Decision: convert at ingest to a GBP base.** Full spec is in `02-phase-1-data-pipeline.md` under "Currency model". Summary:

- `listings` gains `priceMinorBase`, `fxRate`, `fxRateDate`
- Rates live in `data/fixtures/fx-rates.json`, manually maintained, **no live API call**
- Conversion happens once at ingest, never at display time
- Native price and currency are always retained and shown alongside the GBP figure
- Any converted total carries a visible "rates as of" date

This is a **Phase 1 amendment**, so re-run ingestion to backfill the new columns before starting Phase 2. The alternative — native prices with no grand total — was rejected because it removes shipping consolidation, which is the feature this whole strategy rests on.

## Emphasis changes

### Phase 3 — vendor grouping is now a headline feature

It is currently one bullet among eight. It is the strategic core. Give it its own pass measure:

> For a build spanning 3+ vendors, the tool surfaces at least one concrete consolidation saving, hand-verified against real shipping costs.

### Phase 2 — rule messages teach, they do not just block

Their builder *filters out* incompatible parts, so a beginner sees a shorter list and learns nothing. Our Phase 3 spec deliberately keeps blocked parts visible with a reason. **That is the education feature**, and it lives in the rule messages written in Phase 2.

Every message gets two layers: what is wrong with this specific combination, and the underlying principle. Not just "this dial has no feet" but why dial feet exist and what gluing means for the build. Same message, one sentence deeper. It costs nothing — the messages are being written anyway.

Their education is content. Ours is the interface. Do not try to compete on articles.
