# Phase 3 — Desktop Configurator

The product becomes usable. Desktop only, 1280px and up.

**Prerequisite:** Phase 2 pass measure met, including zero false positives.

## Route

`/build` — the whole configurator. State in the URL:

```
/build?movement=<partId>&case=<partId>&dial=<partId>&hands=<partId>&insert=<partId>
```

Parse and validate with Zod. An unknown or unapproved part id drops that slot and shows a notice — never a crash, never a silent empty state.

## Layout

Three columns at 1280px+:

```
┌──────────────┬─────────────────────────┬──────────────┐
│  Slots       │  Part picker            │  Build       │
│              │  (for the active slot)  │  summary     │
│  Movement ✓  │                         │              │
│  Case     ✓  │  [filter bar]           │  Parts       │
│  Dial     ●  │                         │  Total       │
│  Hands    –  │  [grid of part cards]   │  Shipping    │
│  Insert   –  │                         │  Tools       │
│  Crystal  –  │                         │              │
│              │                         │  Warnings    │
└──────────────┴─────────────────────────┴──────────────┘
```

Slot states: empty, selected, active, blocked-by-earlier-choice. Give each a distinct treatment — do not rely on colour alone.

## Behaviour

**Live filtering is the core interaction.** When a slot is filled, every other slot's options re-filter immediately. Incompatible parts must be *visible but disabled with a reason*, not hidden — a beginner learns from seeing "this dial won't work because your movement has a day wheel." Hiding teaches nothing.

Sort each picker: compatible first, then by price ascending. Compatible-with-warnings sit between compatible and blocked.

**Start from a template.** An empty six-slot grid is intimidating for the audience you picked. `/build` with no params shows three hand-curated starter builds — a classic dive mod, a dress/Snowflake-style build, a field watch — each openable and then editable. Define these in `data/fixtures/starter-builds.ts`, and assert in a test that all three evaluate to `ok`.

**Warnings panel** is always visible in the right column, never collapsed behind a click. Group by severity. Each finding shows its message, the slots involved, and its fix if there is one.

**Running total** is computed in GBP from `priceMinorBase` and breaks down as: parts subtotal, then per-vendor shipping, then estimated tools. Show each part's native vendor price alongside the GBP figure, since that is what the person will actually be charged, and display the FX rate date wherever a converted total appears. Show the tool cost as a separate line clearly marked one-off, since a modder buying their second watch already owns them. Add a toggle: "I already have tools."

**Vendor grouping.** Group the parts list by vendor with each vendor's shipping cost. When a selected part is available cheaper elsewhere, or when switching vendors would drop a shipping charge, surface it inline: "Also at Namoki for £4 more, but you're already ordering from them — saves £12 shipping."

## Components

```
app/build/page.tsx
components/build/SlotRail.tsx
components/build/PartPicker.tsx
components/build/PartCard.tsx
components/build/BuildSummary.tsx
components/build/WarningsPanel.tsx
components/build/ToolList.tsx
components/build/VendorGroup.tsx
components/build/StarterBuilds.tsx
```

Server components fetch catalog data. The configurator itself is a client component because filtering must be instant. Load the full approved catalog once on mount — it's a few hundred rows, well under the cost of a round trip per keystroke — and run `evaluateBuild` client-side.

## Design

Follow the design plan from `00-PROJECT.md`. Specific requirements:

- Part cards show image, name, vendor, price, stock. Compatibility state must be legible at a glance without reading text.
- The three severities need three visually distinct treatments. Blocked parts should look inert, not merely dimmed.
- Empty slots are an invitation, not a void. "Pick a case" with a hint about what it constrains, not a grey rectangle.
- Every part card links out to its vendor page in a new tab. This is a research tool as much as a configurator.

## Constraints

- No new dependencies beyond what `00-PROJECT.md` lists without a stated reason.
- All money formatting through one `lib/money.ts`. Integer minor units throughout.
- Keyboard navigable: arrow keys move within a picker, Enter selects, Escape returns to the slot rail. Visible focus rings.
- Respect `prefers-reduced-motion`.
- No layout shift when the warnings panel changes — reserve its space.
- Loading states for the initial catalog fetch. No spinners on filtering; that must be synchronous.

## BLOCKED — the headline pass measure depends on D7

**"For a build spanning 3+ vendors, the tool surfaces at least one
concrete consolidation saving, hand-verified against real shipping costs"
cannot currently be met, and not for want of implementation.**

The logic exists, is pure, and is unit-tested (`lib/pricing.ts`,
`findConsolidationSavings` — three tests covering a net-positive swap, a
swap that costs more than the shipping it saves, and a target vendor that
doesn't stock the part). Vendor grouping, per-vendor subtotals and
per-vendor shipping all work on real data and are on screen.

What's missing is the data it needs. Suggesting "buy this from a vendor
already in your order" requires knowing the same physical part is sold by
two vendors. In the current catalog **4,055 of 4,056 parts have exactly
one listing**. The single exception is the SRP Turtle sapphire crystal
merged by hand in Phase 1 Task 4 — and even that one can't produce a
saving: namokimods' copy is out of stock, and dlwwatches' is £23.36 dearer
than watchandstyle's, which is more than the £17.75 shipping consolidating
it would save.

This traces directly to **D7 — Cross-vendor deduplication** in
`08-DEFERRED.md`, parked in Phase 1 after perceptual hashing on
unnormalised vendor photos proved unreliable. Until parts are merged
across vendors, there is no alternative vendor to consolidate *to*.

**This is the strategic feature.** `09-COMPETITIVE-CONTEXT.md` names
cross-vendor comparison as the thing a single-vendor competitor
structurally cannot copy, and shipping consolidation is how that shows up
in the interface. It is currently inert. D7's restore signal (Phase 4's
70% asset-ready threshold) should be treated as gating this, not merely
as tidy-up.

## Pass measure

1. **All three starter builds load, evaluate to not-`blocked`, and are
   editable.** *(Amended 2026-09-01, same correction already applied to the
   regression fixtures.) The original wording said `ok`. That is
   unreachable in this catalog, and for a good reason: every rule now
   warns when it lacks the data to decide, and two of those fire on
   essentially every real build — `date-window-alignment` (no vendor in
   this catalog publishes a dial's date-aperture position) and
   `unverified-part` (most parts are family-inferred). Requiring a literal
   `ok` would create pressure to suppress exactly the warnings the
   zero-false-positive design exists to surface. `ok-with-warnings` is the
   honest healthy state for a real build here.*
2. **A full build can be completed end to end** — six slots, from empty, using only the UI.
3. **Filtering is synchronous and imperceptible.** Re-filter after a selection completes in under 50ms with the full catalog.
4. **Every blocked part shows a reason on hover or focus.** No unexplained disabled states.
5. **URL round-trip works**: copy the URL, open in a new tab, get the identical build. Browser back steps through selections correctly.
6. **The 10 bad fixture builds cannot be constructed through the UI.** Try to build each one by hand; each must be blocked at the point of selection. This is the Phase 2 guarantee holding at the UI layer.
7. Keyboard-only walkthrough of a complete build, no mouse.
8. Total, shipping, and tool estimate hand-checked against three real builds. All arithmetic correct.
