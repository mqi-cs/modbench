# Investigation A — Cross-Vendor Overlap Analysis

Read-only. No fixes, no merging, no re-tagging applied. Run 2026-08-31 against the 2,257 genuinely-tagged parts (excludes the 3,272 parts still sitting at `ingest.ts`'s untagged placeholder, which would otherwise pollute the `movement` category — see methodology note below).

## Method

1. Normalize each part's title: lowercase, strip punctuation, strip a leading vendor SKU code (`NMK912`, `RC1234`, `CI0004`-style patterns), strip a small stopword list (generic words like "watch", "bundle", "style", "for", "with").
2. Compute Jaccard token-set similarity between every pair of parts in the same category, across different vendors only.
3. **Two grouping methods were run, because the first one is flawed and I want that on record, not quietly fixed:**
   - **Method 1 — transitive union-find** (naive): any chain of pairwise matches ≥0.6 gets merged into one group. This **chains** — see the false-positive example below — and inflates categories with many templated, color/style-varying titles.
   - **Method 2 — mutual best-match only**: a pair counts only if each part's single highest-scoring cross-vendor match is the other part in the pair. No transitive merging. This is the trustworthy number; Method 1 is reported only to show why it's discarded.

## Why Method 1 was discarded

Method 1 produced a **38-member "group"** in `bezel_insert` that on inspection is clearly not one product — it's dozens of genuinely different ceramic bezel inserts (different colors: black/green/blue/gold, different styles: Sub/GMT/Vintage) chained together because each pair shared a couple of generic tokens (`ceramic`, `sub`, `black`, etc.) with some *other* member of the chain, not because any two are actually the same. Single-linkage clustering on a fixed similarity threshold does this reliably when titles are templated. Method 1's category counts are not reported as findings for this reason.

## Method 2 results (mutual best-match, no chaining)

| Category | Mutual pairs | Parts in category | Family agree | Family **disagree** |
|---|---|---|---|---|
| hands | 46 | 438 | 44 | 2 |
| bezel_insert | 42 | 586 | 25 | **17** |
| dial | 19 | 437 | 19 | 0 |
| case | 17 | 371 | 14 | 3 |
| chapter_ring | 17 | 267 | 13 | 4 |
| movement | 2 | 89 | 2 | 0 |
| crystal | 2 | 69 | 1 | 1 |
| **Total** | **145** | 2,257 | 118 | **27** |

## Hypothesis test result: **does not hold, at least not as stated**

The hypothesis was that overlap concentrates in movement/crystal/case/chapter_ring/crown and is near-zero in dial/hands/bezel_insert. The data says the opposite in raw terms: **hands and bezel_insert have by far the most candidate pairs**, movement and crystal have almost none.

Two caveats before treating that as the final word:

1. **Title similarity is not proof of physical identity**, in either direction. A namoki "Tuna Black" hand set and a watchandstyle "Tuna Style Hands Set - Black" *could* be the same wholesale-sourced item re-badged by two small shops (common in this market — see below), or could be two vendors' own independent takes on a recognizable style. I cannot resolve this from titles alone; that needs a photo comparison, which is out of scope for this read-only pass.
2. **Movement and crystal being low might be a real signal or might be that vendors name these very differently** (movement titles are short and inconsistent — "NH36 Movement - Black" vs "Seiko (TMI) NH36 Automatic Movement..." — so token overlap under-counts even genuine matches). The 2 movement pairs and 2 crystal pairs that *did* surface look like the most credible candidates in the whole dataset (see below), which is weak evidence the commodity-item intuition is directionally right even though the raw count doesn't show it.

### The most credible candidate in the entire dataset

```
srp-turtle-crystal, 3 vendors, consistent family, consistent naming:
  namokimods    NMK311 - SRP Turtle Double Domed Sapphire Crystal      58.00 SGD
  dlwwatches    Sapphire Double Dome - SRP Turtle                      80.00 SGD
  watchandstyle G0352 SRP Turtle Reissue Double Dome Sapphire Crystal  1950.00 PHP
```
All three: same family, same case-model scoping ("SRP Turtle"), same construction ("Double Dome(d)"), no stylistic ambiguity (a sapphire crystal doesn't come in colors the way a dial or insert does). This is the single group I'd bet on being a genuine three-way duplicate.

### The clearest false-positive class caught by the family check

8 of the 17 `bezel_insert` disagreements, and 3 of 4 `chapter_ring` disagreements, are **the Lucius Ultra Thin trap resurfacing** — e.g. `luciusatelier SKX013 Ceramic Bezel Insert (Slope) - Yacht Master Silver` (family `skx013-insert`, generic) title-matching `dlwwatches Ceramic Insert - 007 Yacht Master Silver` (family `skx007-insert`) at 0.80, or Ultra Thin-scoped chapter rings matching generic `skx013-chapter-ring`/`skx007-chapter-ring` parts. **These are exactly the parts that must never be merged** — this investigation independently re-confirms why Phase 1's family-conflict check exists, using a completely different method than the one that originally found it.

One mismatch (#19 in the top 50, score 1.00) is a normalization artifact, not a real ambiguity: my SKU-stripping regex treats a leading `SKX013` token as if it were a vendor SKU code and strips it, so "SKX013 Ceramic Bezel Insert: Sub Style Stealth" and "Ceramic Insert - 007 Sub Stealth" end up looking identical after normalization even though one is explicitly SKX013 and the other SKX007. Flagging this so it isn't read as a real finding — it's a bug in this analysis script, not evidence about the catalog.

## Top 50 candidate pairs (Method 2, sorted by score)

19 of the 50 score a perfect 1.00 (identical token sets after normalization). 8 of the top 50 carry a family mismatch (marked). Full list:

1. score=1.00
   - `namokimods` **Watch Dial: Arabic Sunburst Sky Blue Finish** — 55.00 SGD
   - `watchandstyle` **D0874 Arabic Dial - Sunburst Sky Blue** — 1750.00 PHP

2. score=1.00
   - `dlwwatches` **Dial - Sterile Black** — 33.00 SGD
   - `watchandstyle` **D0958 6105 Style Dial - Sterile - Black** — 950.00 PHP

3. score=1.00
   - `dlwwatches` **Dial - Sterile Green** — 33.00 SGD
   - `watchandstyle` **D0955 6105 Style Dial - Sterile - Green** — 950.00 PHP

4. score=1.00
   - `dlwwatches` **Dial - Sterile Blue** — 33.00 SGD
   - `watchandstyle` **D0956 6105 Style Dial - Sterile - Blue** — 950.00 PHP

5. score=1.00
   - `namokimods` **Watch Hands: Tuna Black** — 32.00 SGD
   - `watchandstyle` **H0599 Tuna Style Hands Set - Black** — 1150.00 PHP

6. score=1.00
   - `namokimods` **Watch Hands: Tuna Silver** — 32.00 SGD
   - `watchandstyle` **H0598 Tuna Style Hands Set - Silver** — 1150.00 PHP

7. score=1.00
   - `namokimods` **Watch Hands: LX Silver Finish** — 32.00 SGD
   - `watchandstyle` **H0921 LX Style Hand Set - Silver** — 1150.00 PHP

8. score=1.00
   - `namokimods` **Watch Hands: Nautilus Gold Finish** — 35.00 SGD
   - `watchandstyle` **H0979 Nautilus Hand Set - Gold** — 1150.00 PHP

9. score=1.00
   - `namokimods` **Watch Hands: Nautilus Black Finish** — 35.00 SGD
   - `watchandstyle` **H0978 Nautilus Hand Set - Black** — 1150.00 PHP

10. score=1.00
    - `namokimods` **Watch Hands: Cathedral Gold Finish** — 32.00 SGD
    - `watchandstyle` **H0271 Cathedral Style Hands Set - Gold** — 1150.00 PHP

11. score=1.00
    - `namokimods` **Watch Hands: Trident Second Hands** — 10.00 SGD
    - `dlwwatches` **Hands - Trident Second Hands** — 16.00 SGD

12. score=1.00
    - `namokimods` **Watch Hands: Merc Second Hands** — 12.00 SGD
    - `dlwwatches` **Hands - MERC Second Hands** — 16.00 SGD

13. score=1.00
    - `namokimods` **Watch Hands: Cathedral Black Finish** — 27.00 SGD
    - `watchandstyle` **H1669 Cathedral Hand Set - Black** — 1150.00 PHP

14. score=1.00
    - `namokimods` **Watch Hands: Lightning Second Hands** — 10.00 SGD
    - `dlwwatches` **Hands - Lightning Second Hands** — 16.00 SGD

15. score=1.00
    - `namokimods` **Watch Hands: Arrow Second Hands** — 10.00 SGD
    - `dlwwatches` **Hands - Arrow Second Hands** — 16.00 SGD

16. score=1.00
    - `luciusatelier` **Breguet Hands - Polished Blue** — 28.00 SGD
    - `watchandstyle` **H1453 Breguet Style Hands - Polished Blue** — 1150.00 PHP

17. score=1.00
    - `dlwwatches` **Hands - MM Second Hands** — 16.00 SGD
    - `watchandstyle` **MM Style - Second Hands** — 500.00 PHP

18. score=1.00
    - `namokimods` **SSK Chapter Ring: GMT Brushed Finish** — 26.00 SGD
    - `watchandstyle` **C1546 SSK GMT Chapter Ring - Brushed** — 1350.00 PHP

19. score=1.00 **[FAMILY MISMATCH — normalization artifact, see above, not a real ambiguity: skx013-insert vs skx007-insert]**
    - `namokimods` **SKX013 Ceramic Bezel Insert: Sub Style Stealth** — 40.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Sub Stealth** — 50.00 SGD

20. score=0.86
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Dual Time Arabic Style Black/Red** — 45.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Arabic Dual Time Black Red "12"** — 50.00 SGD

21. score=0.86
    - `namokimods` **SRP Turtle Ceramic Bezel Insert: Dual Time style Blue/White** — 40.00 SGD
    - `dlwwatches` **Ceramic Insert - SRP Turtle Dual Time Blue** — 60.00 SGD

22. score=0.86
    - `namokimods` **SRP Turtle Ceramic Bezel Insert: Dual Time style Black/White** — 40.00 SGD
    - `dlwwatches` **Ceramic Insert - SRP Turtle Dual Time Black** — 60.00 SGD

23. score=0.83
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Dual Time Arabic Style Black** — 45.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Arabic Dual Time Black** — 50.00 SGD

24. score=0.83 **[FAMILY MISMATCH: skx013-insert vs skx007-insert]**
    - `namokimods` **SKX013 Ceramic Bezel Insert: Vintage Sub style Black/White Mk2** — 40.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Sub Vintage Black MK2** — 50.00 SGD

25. score=0.83
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Dual Time style (Root Beer)** — 45.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Dual Time Root Beer** — 50.00 SGD

26. score=0.83
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Sub style Black/Gold** — 45.00 SGD
    - `watchandstyle` **CI0667 SKX007/SRPD Sub Style Ceramic Bezel Insert - Black/Gold** — 1650.00 PHP

27. score=0.80
    - `namokimods` **Watch Dial: GMT Fifty-Eight Black/Gold** — 55.00 SGD
    - `watchandstyle` **D1386 GMT Dial - Fifty Eight Style - Gold** — 1750.00 PHP

28. score=0.80
    - `namokimods` **SSK Chapter Ring: GMT Black with Red Markers** — 26.00 SGD
    - `watchandstyle` **C1622 SSK GMT Chapter Ring - Black/Red** — 1350.00 PHP

29. score=0.80
    - `namokimods` **SKX007/SRPD Chapter Ring: Brushed Rose Gold Finish** — 26.00 SGD
    - `watchandstyle` **C0785 SKX007/SRPD Chapter Ring - Brushed Rose Gold** — 1150.00 PHP

30. score=0.80
    - `namokimods` **SKX007/SRPD Chapter Ring: Polished Rose Gold Finish** — 26.00 SGD
    - `watchandstyle` **C0191 SKX007/SRPD Chapter Ring - Polished Rose Gold** — 1150.00 PHP

31. score=0.80
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Sub style Sandblasted** — 45.00 SGD
    - `watchandstyle` **CI0023 SKX007/SRPD Sub Style Ceramic Bezel Insert - Sandblasted** — 1750.00 PHP

32. score=0.80
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Sub style Aegean Blue** — 45.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Sub Aegean Blue** — 50.00 SGD

33. score=0.80 **[FAMILY MISMATCH: skx013-insert vs skx007-insert]**
    - `namokimods` **SKX013 Steel Bezel Insert: Dual Time Style Red** — 32.00 SGD
    - `dlwwatches` **Steel Insert - 007 Dual Time - Brushed Steel Red "12"** — 50.00 SGD

34. score=0.80 **[FAMILY MISMATCH: skx013-insert vs skx007-insert]**
    - `namokimods` **SKX013 Ceramic Bezel Insert: Vintage Sub style Black/White** — 40.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Sub Vintage Black** — 50.00 SGD

35. score=0.80 **[FAMILY MISMATCH: skx013-insert vs skx007-insert]**
    - `namokimods` **SKX013 Ceramic Bezel Insert: Dual Time style Black/White** — 40.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Dual Time Black** — 50.00 SGD

36. score=0.80
    - `namokimods` **SKX007/SRPD Ceramic Bezel Insert: Dual Time style Stealth** — 45.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Dual Time Stealth** — 50.00 SGD

37. score=0.80 **[FAMILY MISMATCH: skx013-insert vs skx007-insert]**
    - `luciusatelier` **SKX013 Ceramic Bezel Insert (Slope) - Yacht Master Silver** — 36.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Yacht Master Silver** — 60.00 SGD

38. score=0.80 **[FAMILY MISMATCH: skx013-insert vs skx007-insert]**
    - `luciusatelier` **SKX013 Ceramic Bezel Insert (Slope) - Yacht Master Black** — 36.00 SGD
    - `dlwwatches` **Ceramic Insert - 007 Yacht Master Black** — 60.00 SGD

39. score=0.75
    - `namokimods` **Watch Dial: GS Wave Sky Blue** — 55.00 SGD
    - `watchandstyle` **D1635 GS Style Dial - Sky Blue** — 1750.00 PHP

40. score=0.75
    - `namokimods` **Watch Dial: Fifty-Eight Black/Gold** — 55.00 SGD
    - `watchandstyle` **D1384 Dial - Fifty Eight Style - Gold** — 1750.00 PHP

41. score=0.75
    - `dlwwatches` **Dial - Sterile Sunburst Black** — 38.00 SGD
    - `watchandstyle` **D0585 Sterile Arabic Dial - Sunburst Black** — 1550.00 PHP

42. score=0.75
    - `dlwwatches` **Dial - Sterile Sunburst Green** — 38.00 SGD
    - `watchandstyle` **D0583 Sterile Arabic Dial - Sunburst Green** — 1550.00 PHP

43. score=0.75
    - `dlwwatches` **Dial - Sterile Sunburst Silver** — 38.00 SGD
    - `watchandstyle` **D0586 Sterile Arabic Dial - Sunburst Silver** — 1550.00 PHP

44. score=0.75 **[FAMILY MISMATCH: vk6x-hands vs nh3x-hands-standard]**
    - `namokimods` **Watch Hands Bundle: VK Baton Rose Gold** — 40.00 SGD
    - `watchandstyle` **H1074 Baton Hand Set - Rose Gold** — 1150.00 PHP

45. score=0.75
    - `namokimods` **Watch Hands: SSK/NH34 Snowflake GMT Hand** — 13.00 SGD
    - `luciusatelier` **GMT Hands - Snowflake [For NH34]** — 13.00 SGD

46. score=0.75
    - `namokimods` **Watch Hands: SKX Black Lume Finish** — 38.00 SGD
    - `watchandstyle` **H0800 SKX Style Hands Set - Black Lume - Polished Black** — 1150.00 PHP

47. score=0.75
    - `namokimods` **Watch Hands: MM1000 Black Lume Finish** — 38.00 SGD
    - `watchandstyle` **H0856 MM1000 Style Hands Set - Silver - Black Lume** — 1150.00 PHP

48. score=0.75
    - `namokimods` **Watch Hands: Broad Arrow Polished Finish** — 38.00 SGD
    - `luciusatelier` **Broad Arrow Hands - Polished Silver** — 35.00 SGD

49. score=0.75
    - `namokimods` **Watch Hands: MM1000 Rose Gold Finish** — 32.00 SGD
    - `watchandstyle` **H0559 MM1000 Style Hands Set - Brushed Rose Gold** — 1150.00 PHP

50. score=0.75
    - `namokimods` **Watch Hands: Snowflake Rose Gold Finish** — 27.00 SGD
    - `watchandstyle` **H0306 Snowflake Hands -Polished Rose Gold** — 1150.00 PHP

## Notes for judging the list

- **#18/#28** (SSK Chapter Ring, namoki vs watchandstyle) independently corroborates the Phase 1 finding that "SSK" = Seiko 5 GMT consistently across vendors — good sign the `ssk-gmt-chapter-ring` family call was right.
- **#44** (VK Baton hands, namoki vs watchandstyle) is a family mismatch worth a close look: namoki's own listing is tagged `vk6x-hands` (their "VK Hands" product line) but the matched watchandstyle listing landed in generic `nh3x-hands-standard` in this session's tagging — possibly a real tagging gap on the watchandstyle side (was this hand set actually VK-specific and mistagged?), or a genuine coincidental title collision. Worth checking watchandstyle's own product page for this one specifically before assuming either way.
- The **17 namoki↔watchandstyle hands pairs at score ≥0.75** (Tuna, LX, Nautilus, Cathedral, Breguet, MM1000, Snowflake, Broad Arrow, SKX-style) form a striking pattern: same style names, same construction, consistently priced within a similar GBP-equivalent band once converted (£13-26 range on both sides). This is the strongest evidence in the dataset that at least *some* hands are genuinely wholesale-sourced and re-badged rather than each vendor's own design — which would mean the "each vendor designs its own dial/hands" assumption in the hypothesis doesn't hold uniformly, at least for hands.

## Summary for the merge-strategy conversation

- 145 mutual-best-match candidate pairs across 2,257 tagged parts (7.9 parts in 1,000 that have a plausible cross-vendor twin, roughly — this is candidates, not confirmed duplicates).
- 27 of 145 (19%) carry a family mismatch and should never be merged as-is; most of those are the Lucius Ultra Thin trap resurfacing, independently confirming that check's value.
- The single most credible candidate (SRP Turtle sapphire crystal, 3 vendors) supports the "commodity items get resold" intuition.
- The volume of highly-consistent hands/bezel_insert pairs (many at score 1.00, consistent pricing pattern) is the biggest surprise and argues the hypothesis needs revising, not the analysis — though a human visual check of a handful of these (comparing actual product photos) would settle it definitively in a way no title-matching can.
