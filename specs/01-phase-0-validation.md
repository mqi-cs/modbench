# Phase 0 — Data Validation

**No application code in this phase.** Two spreadsheets and a research session. This exists to kill the project cheaply if the data isn't there.

## Why

The entire product rests on one assumption: that mod parts fall cleanly into a handful of compatibility families, so you don't need per-part specs the vendors never publish. If that assumption is wrong, there is no product, and you want to find out in two days rather than two months.

## Task 1 — Family assignment test

Build `data/fixtures/family-audit.csv` with 50 real parts spanning at least 4 vendors and all part categories (dial, hands, case, movement, bezel insert, crystal, chapter ring).

Columns:

```
vendor, product_name, source_url, category, proposed_family,
confidence (high|medium|low), evidence, notes
```

`evidence` records *why* you assigned that family — the vendor's category page, an explicit spec line, a forum post, or "convention". `confidence` is `low` if you're inferring from the product title alone.

**Assign families by hand.** Do not automate this. The point is to find out how hard it is.

## Task 2 — The compatibility test set

Build `data/fixtures/known-builds.json`: **20 known-good builds** and **10 known-bad combinations**, sourced from WatchUSeek threads, r/watchmodding posts, and YouTube build videos.

```json
{
  "id": "good-001",
  "expected": "compatible",
  "parts": {
    "movement": "NH35A",
    "case": "Namoki SKX007 Sub Case",
    "dial": "Lucius Atelier GS Snowflake NH35",
    "hands": "Namoki Sword Hands NH35",
    "bezelInsert": "Namoki Ceramic Sub Insert"
  },
  "source": "https://...",
  "notes": "Confirmed built and running in linked post"
}
```

Bad combinations should cover real beginner mistakes, not invented ones:
- NH36 (day-date) movement with a date-only dial
- SKX007 dial into an SKX013 case (diameter mismatch)
- Feetless dial with no mention of dial dots
- Hands sized for a 7S26 pinion on an NH35
- Date window at 3 o'clock on a dial cut for 4:30

This file becomes the Phase 2 test suite. It is the most valuable artifact of the whole phase — build it carefully.

## Task 3 — Feed reconnaissance

For each of the four vendors, fetch `/products.json` once by hand and record in `data/fixtures/feed-audit.md`:

- Does the endpoint exist and return JSON?
- Roughly how many products?
- Which fields are populated — does `product_type` or `tags` carry anything useful for family inference?
- Are specs in `body_html` as prose, in a structured table, or absent?
- What does `robots.txt` say?

## Pass measure

All four must hold:

1. **At least 40 of 50 parts** assigned a family at `high` or `medium` confidence.
2. **No more than 8 of 50** land in a family that exists for only that one part. Many singleton families means the family model is wrong and you're back to per-part specs.
3. **The 30-build test set is complete** and every referenced part appears in the family audit.
4. **At least 3 of 4 vendors** expose a usable `/products.json`.

## Failure handling

- **Test 1 fails** — specs aren't publicly available. Stop, or narrow to a single vendor's catalog where you can infer family from their own category structure.
- **Test 2 fails** — the family abstraction is wrong. Reconsider before writing any code.
- **Test 4 fails** — you'd be writing bespoke HTML scrapers per vendor, which is fragile and a different project. Reduce scope to whichever vendors do have feeds.

Record the outcome in `data/fixtures/phase-0-result.md` with an explicit GO or NO-GO and the four numbers.
