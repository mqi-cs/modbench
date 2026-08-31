# Investigation B — Approval Rate Audit

Read-only. No fixes, no merging, no re-tagging applied. Run 2026-08-31.

## 1. Breakdown by state, reason, category

| `parts.review_state` | Count |
|---|---|
| approved | 784 |
| pending | 3,272 |
| rejected | 2 |

**The `rejected_parts` audit table has only 10 rows** — this matters for how to read the rest of this investigation, so it's worth being explicit up front: there is no large population of formally-rejected parts to sample from. The 10 rows:

| Reason | Count |
|---|---|
| SKX023 family ("SSK023" abbreviation) — not yet scoped, no family seeded this session | 6 |
| `snxs-crystal` — confirmed insufficient real family size (2 SKUs across all 4 vendors, all categories) | 2 |
| Vendor listing internally conflicting (title says SKX013, URL slug says SKX007) | 1 |
| Tagging-script false positive: gasket miscategorized as a case component | 1 |

All 10 were checked against real evidence at the time (Phase 0/Phase 1 sessions) and hold up — none look like an over-strict tagging call worth reversing.

**Note:** only 2 of these 10 actually flipped `parts.review_state` to `rejected` (the two caught during manual review — the URL-slug conflict and the gasket). The other 8 (6 SSK023 + 2 SNXS) were written to `rejected_parts` directly by the tagging step and never touched the corresponding `parts` row, which is still sitting at `pending` with placeholder data. Not a correctness bug — those parts are correctly excluded from `approved` either way — but worth knowing if anyone queries `parts.review_state='rejected'` expecting to find all 10.

**The real gap is not rejection, it's throughput.** Of the 3,272 pending parts:

| Pending sub-status | Count |
|---|---|
| Never tagged at all (still at `ingest.ts`'s placeholder) | 1,801 |
| Genuinely tagged (real family/evidence/confidence) but never reached `review.ts` | 1,471 |

Tagged-but-unreviewed, by category: case 311, dial 407, hands 341, chapter_ring 267, movement 76, crystal 69.

## 2. Sample of 30 (from the pending pool, not `rejected_parts` — see note below)

`rejected_parts` only has 10 rows and all 10 were already individually reasoned through in Phase 1 (see table above) — there's no meaningful population to draw a random 30 from there. The question that actually matters given the 19% approval rate — is the *un-approved* 81% legitimately excluded or wrongly held back — is really a question about the 3,272 **pending** parts, so that's what I sampled.

| # | Part | Status | Verdict |
|---|---|---|---|
| 1 | AI0071 SKX007/SRPD Blue Aluminum Bezel Insert | untagged | **In scope** — explicit SKX007/SRPD, just never tagged |
| 2 | NMK-WK20 DIY Watchmaking Kit: "Ice Blue Arabic" by SVK Watches | untagged | Out of scope — a bundled multi-part kit product, doesn't map to any single part category |
| 3 | SKX007 Watch Bracelet: Nautilus Rose Gold Finish | untagged | Out of scope this session — `strap`/bracelet category, deliberately deprioritized |
| 4 | Seiko 5 Sports SRPD Crystal Gasket | untagged | Out of scope — a seal/gasket accessory, no fitting category |
| 5 | SKX007/SRPD Lumed Chapter Ring: Polished Finish | tagged-not-reviewed | **In scope** — tagged `skx007-chapter-ring`, high-confidence evidence, just unreviewed |
| 6 | Miyota Watch Hands: Baton Black Finish | untagged | Out of scope — **Miyota**, a different movement brand, not NH3x |
| 7 | Watch Dial: Fathoms Black/Silver | tagged-not-reviewed | **In scope** — tagged `nh3x-dial-standard`, unreviewed |
| 8 | Rubber Strap: FKM Tropique Diver Black | untagged | Out of scope this session — strap |
| 9 | NH Decorated Movement Bridge: Circular Cote de Geneve Steel | tagged-not-reviewed | **In scope** — tagged `nh3x-movement`, unreviewed |
| 10 | SKX Crown II - Diamond - 7mm (DLC BLACK EDITION) | untagged | Out of scope this session — `crown` category, deliberately deprioritized |
| 11 | SKX013 Brushed Blue Chapter Ring — Ultra Thin | tagged-not-reviewed | **In scope** — correctly tagged `lucius-ultra-thin-chapter-ring` (not conflated with generic skx013), unreviewed |
| 12 | R1662 SKX007/SRPD Jewelled Coin Edge Rotating Bezel - Gold | untagged | Out of scope this session — this is the bezel **ring**, not the insert; the schema has no dedicated "bezel" category distinct from `bezel_insert`, so this was never tagged |
| 13 | RC0671 SKX007 Samurai Conversion Case - Bronze - Sub Style Bezel | tagged-not-reviewed | **In scope** — tagged `skx007-case`, high confidence, unreviewed |
| 14 | Crown - SKX007 - Bead Blasted PVD Black - Orange "S" | untagged | Out of scope this session — crown |
| 15 | D0772 Seigaiha Dial | tagged-not-reviewed | **In scope** — tagged, but low confidence (watchandstyle, no fitment tags), correctly routed to mandatory review |
| 16 | Chapter Ring - SRPE - Brushed Steel | tagged-not-reviewed | **In scope** — tagged `srpe-chapter-ring`, unreviewed |
| 17 | SRP Turtle Crown: Polished Finish | untagged | Out of scope this session — crown |
| 18 | H0923 Slim Baton Hand Set - Black | tagged-not-reviewed | **In scope** — tagged, low confidence, correctly routed to mandatory review |
| 19 | Bergeon 7024 Anti Magnetic Tweezers #3 | untagged | Out of scope — a **tool**, not a watch part at all |
| 20 | Watch Hands: LX Black Finish | tagged-not-reviewed | **In scope** — tagged `nh3x-hands-standard`, unreviewed |
| 21 | Watch Dial: DJ Navy Blue | tagged-not-reviewed | **In scope** — tagged, unreviewed |
| 22 | NMK904 3 O'Clock SKX007/SRPD Watch Case: Polished Gold Finish | tagged-not-reviewed | **In scope** — tagged `skx007-case`, high confidence, unreviewed |
| 23 | Bezel - SKX007/SRPD KT - Polished PVD Rose Gold | untagged | Out of scope this session — bezel ring, same category gap as #12 |
| 24 | FKM Rubber Strap - Tropic - Orange | untagged | Out of scope this session — strap |
| 25 | NMK907 3 O'Clock No Crown Guard SKX007/SRPD Watch Case: PVD Black Finish | tagged-not-reviewed | **In scope** — tagged `skx007-case`, high confidence, unreviewed |
| 26 | SKX007/SRPD Sub Bezel: Polished Finish | untagged | Out of scope this session — bezel ring, same category gap |
| 27 | C0213 SKX013 Chapter Ring - Brushed Silver with Marker | tagged-not-reviewed | **In scope** — tagged `skx013-chapter-ring`, high confidence, unreviewed |
| 28 | SRPE Chapter Ring: Brushed Finish with Laser Etched Markers | untagged | **A real tagging-rule gap**: `tag-parts.ts`'s namokimods chapter-ring rule checks for "ssk"/"skx013"/"skx007"/"srpd"/"turtle" in the title but never checks for "srpe" — so this genuinely SRPE-family, in-scope part fell through untagged. Not over-strict; under-covered. |
| 29 | NMK391 - Orient Mako/Ray Domed Sapphire Crystal (No Bevel Edge) | untagged | Out of scope — **Orient**, a different watch brand entirely, not Seiko/SKX |
| 30 | SKX Slim Solid Caseback - Silver Mirror Polished | tagged-not-reviewed | **In scope** — tagged `skx007-case`, medium confidence, unreviewed |

**Tally: 16 of 30 (53%) are legitimately in-scope NH35/SKX/SRPD-compatible parts sitting un-approved only because they haven't been reviewed (or, for #28, weren't tagged due to a specific rule gap) — not because anything rejected them.** 14 of 30 (47%) are legitimately out of scope: 2 different-brand items (Miyota, Orient), 1 tool, 1 DIY kit bundle, 1 gasket, 3 straps, 3 crowns, 3 bezel-rings-not-inserts (the last 6 fall in categories this session deliberately deprioritized, per `phase-1-result.md`, not categories that were evaluated and rejected).

## 3. Estimated false-rejection rate

**Effectively 0%, but that's the wrong question to have asked — there is no meaningful false-rejection problem.** Of the 30 sampled, none were parts that got tagged, reviewed, and *wrongly* rejected. The two real `review_state='rejected'` parts in the whole catalog were checked individually in Phase 1 and both holds up (title/URL-slug conflict; gasket mistagged as a case). "Over-strict tagging" causing false rejections isn't what's producing the 19% approval rate.

**What's actually producing the 19% approval rate is throughput, not correctness:**
1. 55% of pending parts (1,801 of 3,272) were **never tagged** — mostly straps, crowns, bezel-rings-as-distinct-from-inserts (a real category gap in the schema, not a bug), tools, other-brand parts (Miyota, Orient), and bundled kit products. Some of this is correctly out of scope; some (like #28's SRPE gap) is a genuine, fixable rule-coverage gap in `tag-parts.ts`.
2. 45% of pending parts (1,471 of 3,272) **were tagged correctly but never reached `review.ts`** — Phase 1's review pass covered a deliberately-sized sample (784 approved out of 2,257 tagged, ~35%), not the full tagged set, on the reasoning that genuine mandatory review doesn't scale to thousands of items in one sitting without becoming a rubber stamp.

Neither of these is "false rejection." They're both "not yet processed." The catalog is thinner than 784 suggests it could be, but not because good parts are being turned away — they're sitting in a real, identifiable, un-reviewed queue.
