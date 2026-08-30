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

**Running total** breaks down as: parts subtotal, then per-vendor shipping, then estimated tools. Show the tool cost as a separate line clearly marked one-off, since a modder buying their second watch already owns them. Add a toggle: "I already have tools."

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

## Pass measure

1. **All three starter builds load, evaluate to `ok`, and are editable.**
2. **A full build can be completed end to end** — six slots, from empty, using only the UI.
3. **Filtering is synchronous and imperceptible.** Re-filter after a selection completes in under 50ms with the full catalog.
4. **Every blocked part shows a reason on hover or focus.** No unexplained disabled states.
5. **URL round-trip works**: copy the URL, open in a new tab, get the identical build. Browser back steps through selections correctly.
6. **The 10 bad fixture builds cannot be constructed through the UI.** Try to build each one by hand; each must be blocked at the point of selection. This is the Phase 2 guarantee holding at the UI layer.
7. Keyboard-only walkthrough of a complete build, no mouse.
8. Total, shipping, and tool estimate hand-checked against three real builds. All arithmetic correct.
