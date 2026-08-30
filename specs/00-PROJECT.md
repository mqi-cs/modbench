# Modbench — Project Specification

Working name. A compatibility-checking configurator for Seiko watch mods. PCPartPicker for watch building.

## What it is

A beginner picks a case, movement, dial, hands, and bezel insert. The app filters every slot live so incompatible parts never appear, shows a running total including shipping and tools, renders a rough visual preview, and produces a shareable build link.

**Audience: beginners.** Someone who has watched a few YouTube mod videos and is about to spend £300 for the first time. They do not know that an NH35 dial has feet at 3 and 9 o'clock, that some dials need their feet cut off and glued, or that they need a hand-press. The product's job is to stop them wasting money.

## The single hard rule

**Zero false positives on compatibility.** Telling a user two parts fit when they do not is the only failure that permanently loses them. Every phase inherits this.

False negatives are acceptable. Saying "we can't verify this fits" is fine, even when it would have worked. Prefer excluding a part to guessing about it.

This means: **the compatibility engine is deterministic code, never an LLM call.** An LLM may assist offline in tagging data, and every tag it produces is reviewed by a human before it ships. At runtime, no model decides whether anything fits.

## Core data insight — compatibility families

Do not model twelve spec fields per part. Aftermarket Seiko mod parts are manufactured to Seiko's TMI specification, so specs are largely **conventions shared across a family**, not per-part attributes.

Each part gets tagged with one compatibility family. Compatibility is then family-to-family, with a small exception table for parts that deviate.

Starting families:

| Family key | Applies to | Meaning |
|---|---|---|
| `nh3x-dial-standard` | dials | Feet at 3/9 for NH35/36 movement |
| `nh3x-dial-feetless` | dials | No feet, requires dial dots/glue — soft warning |
| `nh3x-hands-standard` | hands | Standard NH3x pinion bores |
| `skx007-case` | cases | SKX007/SRPD case dimensions |
| `skx013-case` | cases | SKX013 (smaller) case dimensions |
| `nh3x-movement` | movements | NH35/NH36 form factor |

Extend as data demands. If a part cannot be confidently assigned a family, **exclude it from the catalog** and record why in a `rejected_parts` table for later review.

## Tech stack

Do not substitute without a stated reason.

- **Next.js 15**, App Router, TypeScript in `strict` mode
- **PostgreSQL 16** — Docker Compose locally
- **Drizzle ORM** + drizzle-kit migrations
- **Tailwind CSS v4**
- **Zod** for all external data validation (feed payloads, URL params, env)
- **Vitest** for unit tests
- **Canvas 2D API** for the visual preview, client-side
- **sharp** for offline image normalisation
- **@anthropic-ai/sdk** — offline ingestion scripts only, never in a request path
- **pnpm**

State lives in the **URL**, not a client store. The configurator's slot selections serialise to a query string. This makes every build shareable and back-button-correct for free. Do not add Zustand or Redux.

## Repository layout

```
/app                    Next.js routes
/lib
  /db                   Drizzle schema + client
  /compat               Compatibility engine (pure, no I/O, no network)
  /preview              Canvas compositing
/scripts                Offline ingestion + extraction (run by hand)
/data
  /fixtures             The 30-build test set
  /assets               Normalised part images
/specs                  These files
```

## Global constraints

1. `lib/compat` is pure functions. No database access, no network, no environment reads. It takes part records in and returns verdicts out. This is what makes it testable.
2. Ingestion is **offline scripts run manually**, never a cron job or a request handler, until the catalog is stable. You want a human between the scrape and the database.
3. Never render a price without its currency and its last-checked timestamp.
4. Desktop-first. Target 1280px and up. Do not spend time on mobile layouts in phases 0–5.
5. No accounts, no auth, no payments, no analytics beyond a page-view count. Free tool.
6. Every part row stores `sourceUrl` and `specSource` (`vendor-stated` | `family-inferred` | `manual`) so any claim can be traced back.

## Vendor sources

Shopify stores expose a public `/products.json` endpoint returning structured JSON — titles, variants, prices, stock, images. Start with:

- namokimods.com
- luciusatelier.com
- dlwwatches.com
- watchandstyle.net

Confirm each is Shopify before writing an adapter; if one is not, drop it rather than building a bespoke scraper.

Rate-limit to one request every 2 seconds. Set a descriptive User-Agent. Check each site's `robots.txt` and terms before ingesting, and cache aggressively so you poll rarely. If a vendor asks you to stop, stop.

## Design brief

Read `/mnt/skills/public/frontend-design/SKILL.md` and follow its two-pass process. Write the design plan before the code.

Subject matter to draw from: watchmaking benches, technical spec sheets, caliper markings, dial printing, exploded-view assembly diagrams, the visual language of a movement's plates and jewels.

Requirements:
- Legibility first. This is a tool people use for an hour while spending real money, not a landing page.
- The parts and the preview are the visual interest. Chrome stays quiet.
- Warnings must be impossible to miss without being alarming. Three severities need three clearly distinct treatments.

Explicitly avoid: cream background with serif display and terracotta accent; identical rounded cards with uniform soft shadows; all-caps eyebrow labels; arrows appended to button text.

## Phases

Each phase has its own file with a scope, a task list, and a pass measure. **Do not begin a phase until the previous phase's pass measure is met.** Phase 0 is a genuine go/no-go — if it fails, the project stops.

| File | Phase | Estimate |
|---|---|---|
| `01-phase-0-validation.md` | Data validation, no code | 1 weekend |
| `02-phase-1-data-pipeline.md` | Ingestion + extraction | ~1 week |
| `03-phase-2-compat-engine.md` | Compatibility rules | ~1 week |
| `04-phase-3-configurator.md` | Desktop configurator | ~2 weeks |
| `05-phase-4-preview.md` | Canvas visual preview | ~2 weeks |
| `06-phase-5-sharing.md` | Permalinks, homepage, style pages | ~1 week |
| `07-phase-6-nl-image-input.md` | Natural language + image entry | deferred |
