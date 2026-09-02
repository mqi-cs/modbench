# Modbench

A compatibility configurator for Seiko watch mods, across four vendors.
Pick a movement, case, dial, hands and the rest, and it tells you what
actually goes together — and what the whole thing costs once shipping from
Singapore and the Philippines is in the total.

**Status:** Phases 0–3 complete. The configurator runs at `/build`.

## The one rule

**Never tell someone two parts fit when they don't.** Everything else is
negotiable; this isn't. A false positive costs someone a watch that
doesn't assemble. A false negative costs them one option out of thousands.

That asymmetry is why the engine warns rather than guesses. When a rule
lacks the data to decide, it says so instead of passing. In practice most
real builds come back `ok-with-warnings`, and that is the healthy state,
not a defect — see the standing limitation in
`specs/03-phase-2-compat-engine.md` for exactly what the guarantee does
and does not cover.

## Running it

```bash
pnpm install
pnpm dev            # → http://localhost:3000/build
```

The database (`data/modbench.db`) is a build artifact and is gitignored.
To build it from the raw vendor feeds:

```bash
pnpm catalog:rebuild
```

That runs the full offline pipeline in dependency order — migrate, seed,
ingest, tag, import, seed exceptions, backfill attributes, backfill
images, verify. **The order is load-bearing.** To re-run only the parts
that change when tagging rules change:

```bash
pnpm catalog:refresh
```

Ingestion is deliberately manual, never a cron job. You want a human
between the scrape and the database — that path is where a bad family tag
would enter the catalog.

## Checks

```bash
pnpm check          # tsc + vitest + verify-catalog
pnpm test:coverage  # enforces ≥90% line coverage on lib/compat
```

`pnpm verify-catalog` is the one that matters for data. It runs 11 checks
over the live catalog, including several added after a bug got through:
review-state consistency, currency/price sanity, and an attribute
provenance guard that fails the build if any attribute is derived from a
differently-named field (that bug class shipped three times before it was
caught).

## Layout

```
app/build          The configurator route
components/build   Slot rail, picker, summary
lib/compat         The compatibility engine — pure, no I/O, no network
lib/pricing        Totals and cross-vendor shipping consolidation
lib/catalog.ts     Server-side catalog assembly
scripts/           Offline pipeline, run by hand
data/fixtures/     Test fixtures + the findings that justify them
specs/             Phase specs, read in order
```

`lib/compat` takes plain data in and returns verdicts out. It never
touches the database, the network, or the environment, and no rule may
read a part's image or price. That constraint is what makes the engine
testable, and it is enforced by the tests rather than by convention.

## Where the interesting reading is

- `specs/03-phase-2-compat-engine.md` — the engine, and the standing
  limitation on what the zero-false-positive claim actually covers
- `data/fixtures/attribute-provenance.md` — every attribute traced to
  whether a vendor actually said it, or we inferred it
- `data/fixtures/catalog-gaps.md` — what's deliberately not in the catalog
- `specs/08-DEFERRED.md` — what was cut, and the signal that means it's
  time to bring it back. Reviewed at the end of every phase.
- `specs/DESIGN-PLAN.md` — why the interface looks like a datasheet

## Known blocker

Shipping consolidation — the strategic differentiator — is implemented and
tested but **inert**, because 4,055 of 4,056 parts have exactly one vendor
listing. Suggesting "buy this from a vendor already in your order" needs
the same part sold by two vendors, and cross-vendor deduplication is
deferred (`08-DEFERRED.md` D7). Restoring D7 is what turns working code
into a working feature.

## Preview assets

The visual preview draws from PNG-derived WebP layers prepared offline —
nothing fetches a vendor image at request time.

```
pnpm draw-case-art     # the two hand-drawn case illustrations, per platform
pnpm prepare-assets    # cut out, scale and classify every part photograph
pnpm prepare-assets --dry-run --category=dial   # classify and report, write nothing
```

`prepare-assets` caches downloads under `data/raw/images/` (gitignored), so
re-running after a threshold change costs no network. It writes
`public/assets/<category>/<partId>.webp` and sets `parts.asset_state` to
`ready`, `needs-manual` or `unavailable`. `pnpm verify-catalog` asserts the
two agree in both directions.

Roughly half the catalog has no usable layer, almost all of it bezel
inserts: two of the four vendors photograph inserts fitted to a complete
watch rather than alone. Those parts stay fully selectable and priced, and
the preview names them under the canvas as not drawn. See
`specs/05-phase-4-preview.md` for the measured breakdown.
