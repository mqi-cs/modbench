# Attribute provenance audit

Run 2026-09-01, pre-Phase-3. Triggered by the third instance of one bug:
**a real attribute silently derived from an unrelated one.**

The three instances, all found and fixed during Phase 2:

1. `dial.supportedDatePositions` ← vendor **crown**-position text ("Fits 3
   and 4 o'clock crown builds"). Crown position and date-aperture position
   are different physical facts. The dial's own spec table lists them as
   separate rows; the vendor's movement comparison table lists them as
   separate columns.
2. `case.dialApertureMm` carried a different number per case family, as if
   dial size varied by case model. It doesn't — 28.5mm is universal.
3. `case.crystalDiameterMm` was assigned `fam?.dialApertureMm` — the dial
   number copied into the crystal field. SKX007 takes 31.5mm and SKX013
   takes 28mm, and those are explicitly not interchangeable.

## Method

Every field of every approved part's `attributes` was enumerated from the
database (41 distinct fields across 3,451 approved parts), then traced
back to the line in `scripts/backfill-attributes.ts` that produces it.
Each was classified by where its value actually comes from.

A programmatic check now backs this up: every `x: fam?.y` assignment in
the backfill script is asserted to have `x === y`, so a value can never
again be silently sourced from a differently-named field. **Result: 0
remaining cross-field derivations.**

## Classification

**A. Vendor-stated, parsed per-SKU from that listing's own text** — the
strongest class. The value came from words the vendor wrote about this
exact product.

| Field | Populated | Source |
|---|---|---|
| `*.material` | 722 | title ("Ceramic", "Sapphire", …) |
| `bezel_insert.profile` / `crystal.profile` | 138 | title ("Flat", "Slope", "Double Dome") |
| `dial.lumed` / `hands.lumed` | 128 | title ("lume", "no lume", "BGW9", "C3") |
| `dial.hasDateWindow` / `hasDayWindow` | 338 | title ("Date", "No Date", "Day Date") |
| `movement.caliber` | 33 | title (`NH3[4568]`) |
| `movement.dateWindowPosition` | 4 | title, "Date @ 6H" only — the one phrasing the vendor's own comparison table files under *Complication*, not *Crown Position* |
| `strap.lugWidthMm` | 28 | title ("20/16mm", "22mm") |
| `hands.gmt` | 4 | vendor tag `gmt - nh34` |
| `case.requiresChapterRing` | 22 | body_html: *"mandatory and never included"* |
| `strap.vendorScopedTo` | 12 | body_html: *"Fits Lucius Atelier cases only"* |
| `dial.incompatibleCaseFamilies` | 3 | body_html: *"Not compatible with SKX013, SKX015 and SKX017"* |

**B. Vendor-stated convention, applied at family level** — the vendor
states it about the line rather than the SKU, and multiple vendors agree.
Documented in the source with the quotes.

| Field | Populated | Justification |
|---|---|---|
| `case.dialApertureMm` (28.5) | 380 | All four vendors state it independently: *"Dial fit: 28.5mm"*, *"a standard 28.5mm dial… drops into any case built for that size"*, *"Dial: 28.5mm Seiko Mod dials"* |
| `dial.diameterMm` (28.5) | 467 | Same convention, dial side |
| `case.crownPosition` | 321 | DLW names the lines directly: *"Watch models with 3.8H crown: SKX007, 5 SRPD series, SRP Turtle series, 5 SRPE series"*. SKX013 deliberately absent — not named, so not inferred |
| `movement.hasDay` / `hasDate` | 66 | Caliber specs, vendor-confirmed (*"NH36 — three-hand day-date"*), derived from `caliber` which is itself stated |

**C. External reference, not vendor text** — real published specs from
caliber references, but nobody's product listing says it. Kept because
each is documented with its source, and **none of them feeds an error
path**; a rule may not block a build on a number no vendor published.

| Field | Populated | Note |
|---|---|---|
| `case.crystalDiameterMm` | 328 | SKX007 = 31.5mm, SKX013 = 28mm. Feeds no rule — `crystal-case-fit` matches on the vendor's own family tag instead, which is stronger evidence |
| `case.caseDiameterMm` / `lugWidthMm` | 779 | Family constants; several are additionally vendor-stated in body_html (NMK912's *"Diameter: 38mm… Lug Width: 20mm"*) |
| `movement.heightMm` (5.32) | 33 | Public NH3x spec. Feeds no rule |
| `dial.hasFeet` / `hasSubdials` | 948 | Family constants. `hasSubdials` is the only C-class field feeding an error path (`dial-movement-feet`), and it is justified: the `vk6x-dial` family is itself assigned from the vendor's own product_type, so "this is a chronograph dial" is a vendor fact even though the aperture count isn't printed anywhere |

**D. Deliberately null** — nulled during this audit or left unpopulated
rather than guessed.

| Field | Why |
|---|---|
| `bezel_insert.outerDiameterMm` | 681 nulls. The previous SKX007 value (30.5mm) was never verified and looked too small for a ~38mm insert. Cleared rather than left as data a future rule might trust |
| `dial.supportedDatePositions` | 474 nulls. The single value this ever held was the crown-position conflation. **No vendor in this catalog publishes a dial's date-aperture position** — this stays null until one does |
| `case.hasDoubleDomedCrystal` | 401 nulls. Only set where a title says so; no case title does |
| `case.requiresSpacerFor` | 401 empty. No spacer requirement confirmed for any family |
| `hands.lengthSetMm` | 434 nulls. No vendor publishes hand length |
| `*.styleTags` | All empty. Populated by review, not by tagging |

## Counts

- **41** attribute fields audited across **3,451** approved parts
- **11** fields vendor-stated per-SKU (class A)
- **4** fields vendor-stated at family level with quoted evidence (class B)
- **5** fields from external reference, documented, only one feeding an
  error path and justified (class C)
- **6** fields deliberately null rather than guessed (class D)
- **0** remaining cross-field derivations — the bug class this audit
  existed to find, now enforced by a programmatic check

## Standing rule

A value may only feed an **error** path if it is class A or B — vendor
text, per-SKU or per-line. Class C data can inform warnings and UI, never
a block. Anything with no evidence stays null; a null produces a warning
saying the engine couldn't check, which is the correct outcome, not a gap.
