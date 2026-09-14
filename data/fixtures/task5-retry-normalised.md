# D7 retry — perceptual hashing on normalised assets

Run 2026-09-14 by `pnpm dedup-phash`. Read-only; merges nothing. Raw
numbers in `dedup-phash-normalised.json`.

## The question

Task 5 ran pHash over raw vendor photographs and could not trust the
result: a **confirmed-different** chapter ring pair scored 78/256 while a
**confirmed-same** crystal pair scored 140/256. The ordering was inverted
relative to what the eye could see, and the diagnosis was that the hash
tracked the scene — background, lighting, crop — rather than the object.
Phase 4's asset pipeline produces exactly the missing preprocessing.

## Coverage — the first real limit

**62 of the 145 candidate pairs can be re-hashed at all.**

| category | re-hashable | why not |
|---|---|---|
| chapter_ring | 17 / 17 | |
| hands | 35 / 46 | 11 parts failed asset preparation |
| dial | 10 / 19 | 9 parts failed asset preparation |
| bezel_insert | 0 / 42 | **D9** — Namoki and DLW never photograph an insert alone |
| case | 0 / 17 | never a preview category |
| crystal | 0 / 2 | never a preview category |
| movement | 0 / 2 | never a preview category |

So this does not close D7 on its own. It closes it for hands, and it is
blocked for inserts by the same vendor-photography gap as D9.

## Result: the inversion is fixed

| pair | raw | normalised | percentile vs unrelated |
|---|---|---|---|
| SSK GMT chapter ring — **confirmed DIFFERENT** | 78 | **84** | 28th |
| Explorer enamel dial — looks the same part | 92 | **60** | 1.4th |
| MM1000 hands (closest overall) | 114 | **4** | 0.02nd |

Raw ordering: different (78) ranked *better* than same (92). Normalised:
same (60) ranks better than different (84), and the clearest matches sit
an order of magnitude below both. **The hash now agrees with the eye.**

Per category, candidate-pair distance: hands min 94→**4**, median 118→48.
dial min 92→**36**. chapter_ring min 78→68 — barely moved, and its best
pair is the confirmed non-match, which is the correct answer.

Distances are reported against a **null distribution** of ~4,000 unrelated
same-category pairs, because "4/256" means nothing on its own and
"closer than 99.98% of unrelated hands" does.

## The calibration point that could NOT be recovered

The SRP Turtle double-dome sapphire crystal — the Task 4 manual merge, and
the known-same pair raw hashing ranked worst at 140. Crystals were never a
preview category, so `pnpm dedup-calibrate` fetched both images and ran
them through the pipeline's own `analyse()`. **Both were rejected**
(`backdrop-not-seamless`, `not-square-silhouette`): they are oblique
side-on product shots, not top-down, one against foliage. The 118/256 that
came out is from unnormalised images and means nothing.

That is the honest limit of this method. Normalisation fixes the hash
**where it can run**, and it cannot run on photography that was never
top-down. For this pair the photograph is the blocker, not the hashing.

## The finding that matters most for merging

The hash is computed on greyscale pixels, so **it is blind to finish.**
Visual inspection of the closest 14 pairs found:

- #5, MM1000 polished *silver* vs polished *gold*, distance **16**
- #13, Breguet polished silver vs polished blue, distance **36**

Both are the same object to the hash and **two different SKUs in reality**.
A threshold on distance alone would have merged them, asserting that a
silver part and a gold part are one thing — the exact false-positive class
this project exists to prevent, and a destructive one, since merging
deletes a `parts` row.

So the shortlist is gated on **distance AND colour-tag agreement**:

- 14 pairs at distance ≤ 40
- **11 also agree on finish** — queued for human review
- 3 do not — same model in another finish, or untagged

## What was done with it

Nothing was merged. The 11 went into `merge_candidates` as `source:
'phash'`, the same queue the user link-paste path writes to, for
`pnpm review-merges`. Where a person has already claimed a pair the row is
promoted to `source: 'both'` rather than duplicated — two independent
methods agreeing is the strongest signal available here.
