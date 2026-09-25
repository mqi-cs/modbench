# Bad-build fixtures: the agreed count (WS0 step 5)

> **Updated by WS1 (2026-09-26):** 17 bad builds, 14 quoted, each naming the
> rules it evidences in `evidences`. Current per-rule evidence is in
> `rule-inventory.md`; the table below is the WS0 snapshot.

Counted 2026-09-26 from `known-builds.json` at WS0, with each fixture run
through `evaluateBuild` to see which rules actually block it.

**9 bad builds. All 9 are blocked. 6 carry a verbatim vendor quote
(`sourceQuote`); 3 do not.**

The handoff's two numbers counted different things. "Audited to 8, each with
a quoted vendor source" was the total at commit `a5fc6d4`, when 4 of those 8
had a quote -- the "each quoted" half was never true. "About three rules"
was roughly the number of rules with a quoted fixture behind them, now 5.

| Fixture | Quoted | Blocking error(s) | Vendor text |
|---|---|---|---|
| bad-002 | yes | `insert-case-fit` | namokimods NMK912: "Diameter: 38mm … Compatible with SKX013 Crowns" |
| bad-003 | yes | `insert-case-fit` | luciusatelier SKX013 Slope insert: "Fits the SKX013, SKX015, SKX017 and all 7S26-0030 cases." |
| bad-006 | yes | `insert-case-fit`, `requires-chapter-ring`, `lucius-ultra-thin-no-stock-skx-accessories` | luciusatelier Ultra Thin: "standard SKX bezels, inserts, and crystals will not fit" |
| bad-007 | **no** | `insert-case-fit` | namokimods NMK959 states "Case Diameter: 40mm" and a "flat, sterile bezel" -- implies no insert, never says so |
| bad-008 | **no** | `insert-case-fit` | watchandstyle RC1697 states a "fluted bezel" and "standard 28.5mm dial" -- implies no insert, never says so |
| bad-010 | **no** | `insert-case-fit` | dlwwatches SRPE GS EVO -- see below |
| bad-011 | yes | `insert-crystal-profile-fit` | watchandstyle CI0024: "will not sit correctly under a double dome" |
| bad-012 | yes | `dial-case-model-exclusion` | luciusatelier SNKK87: "Not compatible with SKX013, SKX015 and SKX017" |
| bad-013 | yes | `bracelet-vendor-scope` | luciusatelier Oyster 20/16: "Fits Lucius Atelier cases only." |

Quoted fixtures by rule: `insert-case-fit` 3, `insert-crystal-profile-fit`
1, `dial-case-model-exclusion` 1, `bracelet-vendor-scope` 1, plus the
`lucius-ultra-thin-no-stock-skx-accessories` family exception on bad-006.

## Open problems

- **bad-010 contradicts its own notes.** The notes call the SKX007 dial part
  of the mistake; the vendor's listing says "Suitable dials and hands -
  SKX007, 5 SRPD, 5 SRPE series". The build is still blocked, by the insert
  alone, and only SRPE parts are listed as interchangeable, so the block
  stands -- but the note overclaims and there is no quote for the insert.
- **The `srpe-case` family constant is 43.8mm** (`scripts/backfill-attributes.ts`);
  this SRPE listing states "Diameter - 38 mm (excluding crown)".
- **bad-002 notes say it tests `dial-case-diameter`** too. Only
  `insert-case-fit` fires.
- **6 of 9 fixtures rest on `insert-case-fit`**, which matches case lines,
  not measurements.
