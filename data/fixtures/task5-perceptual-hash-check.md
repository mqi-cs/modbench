# Task 5 — Perceptual Hash Check on the 145 Candidate Pairs

Run 2026-08-31/09-01. Read-only, no fixes/merging applied from this task's results (per instruction).

## What was run

For each of Investigation A's 145 mutual-best-match candidate pairs, fetched both product images from the vendor CDNs and computed `imagehash.phash` (hash_size=16, 256-bit) on each, then took the Hamming distance between the pair. 138 of 145 pairs got a valid distance; 7 failed to fetch (dead/redirected image URLs).

## Headline number, as literally specified

**0 of 138 pairs fall under any conventional "same image" threshold** (10, 20, 30, or even 50 bits out of 256). The single closest pair sits at distance 78/256 (30% of bits differ) — and manual inspection (below) shows that pair is a **confirmed non-match**. By category:

| Category | Pairs | Failed fetch | Min dist | Median | Max |
|---|---|---|---|---|---|
| hands | 46 | 2 | 94 | 120 | 158 |
| bezel_insert | 42 | 4 | 100 | 126 | 144 |
| dial | 19 | 0 | 92 | 128 | 162 |
| case | 17 | 0 | 94 | 126 | 142 |
| chapter_ring | 17 | 1 | 78 | 126 | 148 |
| crystal | 2 | 0 | 116 | 140 | 140 |
| movement | 2 | 0 | 110 | 134 | 134 |

**If this number is taken at face value: 0 of 145 candidates survive an image check, in every category.**

## Why I'm not reporting that as the answer

I manually inspected three pairs spanning the distance range before trusting the numbers, because a "0 survive, uniformly, in every category" result is exactly the kind of clean-looking output that's worth a sanity check before it becomes the basis for a decision.

**Pair 1 — the closest, distance 78 (chapter rings, namoki "SSK Chapter Ring: GMT Brushed Finish" vs watchandstyle "C1546 SSK GMT Chapter Ring - Brushed").** Viewed both images directly: namoki's ring has engraved GMT hour markers (18, 20, 22, 24, 2, 4...); watchandstyle's is a completely blank brushed ring with no markers at all. **Genuinely different parts, correctly separated by the hash.** Good — the method can work.

**Pair 2 — the SRP Turtle sapphire crystal I merged in Task 4, distance 140 (worse than the dataset median).** Viewed both images: one is an outdoor lifestyle photo (green foliage background, natural light), the other a studio shot (black background, controlled lighting) — but the crystal itself in both has the same double-dome profile and the same mirror-polished bevel edge. **Looks like the same part, badly served by a high hash distance because the backgrounds dominate the signal.**

**Pair 3 — an Explorer-style dial, distance 92 (namoki "Watch Dial: Explorer Enamel Black" vs luciusatelier "Terra Explorer Dial v2 - Enamel Black").** Viewed both: near-identical layout — same triangle-at-12, same applied index shapes, same 3/6/9 numeral style, same "AUTOMATIC" text placement — differing only in the small center logo (namoki's "N" vs Lucius's triangle mark). **Looks like the same base manufactured dial, or an extremely close copy, at a *higher* nominal distance (92) than the confirmed-different chapter ring pair (78).**

That last point is the real problem: **the hash distance does not rank these consistently with what I can see by eye.** The pair I could confirm was genuinely different (78) scored *lower* than a pair that looks like the same product (92) and a pair that plausibly is the same product (140). I checked this wasn't a fluke of one hash config — reran all three pairs through `phash`, `dhash`, and `average_hash` at both 8×8 and 16×16 — and the confirmed-different chapter ring pair never separates cleanly from the likely-same pairs under any of them.

## Why: no image preprocessing

Every image here is the vendor's own raw product photo — different backgrounds (white studio, black studio, outdoor foliage), different crops, different lighting, sometimes a watermark. A whole-image hash is dominated by that scene composition, not the object in it, especially for small/reflective/transparent parts (a sapphire crystal's reflections are basically a photo of the room it was shot in). This is exactly what `05-phase-4-preview.md`'s asset pipeline exists to fix for a completely different reason (rendering the visual preview) — normalize to a fixed canvas, centered, transparent background, scaled to real-world size — but that pipeline doesn't exist yet in Phase 1, and running perceptual hashing without it produces numbers that look authoritative but aren't trustworthy.

## Bottom line

- **As literally run: 0 of 145 candidates pass an image check, in every category** — but I don't believe this number, and you shouldn't either, without the caveat above.
- **What I can actually stand behind:** perceptual hashing on raw, unnormalized vendor photos is not a reliable signal for this dataset. It correctly flagged one genuine non-match (the chapter ring pair) but ranked it as *more similar* than two pairs that look like real or plausible matches on direct visual inspection. A tool that gets the ranking backwards on a 3-pair spot check isn't ready to gate a merge decision on 145 pairs.
- **What would actually work:** the same background-removal/centering/scaling step Phase 4 already needs, run before hashing. That's real additional work, not a parameter tweak -- I have not done it and am not treating this as authorization to build it without checking in first, per "do not implement general deduplication."
- **Task 4's SRP Turtle crystal merge is not contradicted by this check** — if anything, direct visual inspection supports it; the crystal's own pair-check score being the second-worst in the whole dataset (140/256) is itself evidence of the method's unreliability, not evidence against the merge.

No merges added or removed based on this task. Raw results (all 145 pairs, hash distances, image URLs) saved in `data/fixtures/phash-raw-results.json` for reference.
