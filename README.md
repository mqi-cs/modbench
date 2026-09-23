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

**The catalog (`data/modbench.db`, ~4MB) is checked in.** Clone, install,
run — you get the same 4,053 reviewed parts, prices and merge decisions
this repo was developed against, with no pipeline run and no vendor
requests.

That is deliberate rather than lazy. Most of what is in that file cannot
be regenerated from the code: which parts a human approved or rejected,
which cross-vendor listings were judged to be the same physical part
(`part_merges`), and which candidates were rejected and why
(`merge_candidates`). The scripts reproduce the derived columns; they
cannot reproduce a judgement.

To rebuild it from the raw vendor feeds instead:

```bash
pnpm catalog:rebuild
```

That runs the full offline pipeline in dependency order — migrate, seed,
ingest, tag, import, seed exceptions, backfill attributes, backfill
images, style tags, shapes, dimensions, assets, perceptual hashes, verify.
**The order is load-bearing.** To re-run only the parts that change when
tagging rules change:

```bash
pnpm catalog:refresh
```

The feeds themselves (`data/raw/`, 22MB of JSON plus 307MB of cached
product images) are NOT checked in, so a fresh clone cannot run
`catalog:rebuild` or `catalog:refresh` until it re-ingests. Running the
app needs neither.

Ingestion is deliberately manual, never a cron job. You want a human
between the scrape and the database — that path is where a bad family tag
would enter the catalog.

## Working with someone else

Two branches. `develop` is where work happens and is the repo default;
`main` is protected and only moves through a pull request.

```bash
git switch develop      # everything starts here
```

**The catalog is a binary, so only one person works at a time.** Git
cannot merge two versions of `data/modbench.db`. If both of you change it
on `develop`, the only resolutions are "keep mine" or "keep theirs" and
somebody's part approvals are lost — the database holds judgements that
the pipeline cannot regenerate. So the rule is a baton, not a lock:

1. **Pull before you start.** `git pull --ff-only` on `develop`. If that
   refuses to fast-forward, you have local work on an old base — sort that
   out before writing anything new, not after.
2. **Push when you stop.** Even mid-way. An unpushed day is the only way
   the other person can start from a stale catalog.
3. **Say when you pick the baton up and put it down.** This is the whole
   mechanism. There is nothing in git enforcing it.

If you do end up with `both modified: data/modbench.db`, do not guess.
Work out which side made catalog decisions the other does not have —
`sqlite3 data/modbench.db "SELECT COUNT(*) FROM part_merges"` and the same
for `merge_candidates` and approved `parts` is usually enough to tell —
keep that one with `git checkout --theirs` or `--ours`, and have the other
person redo their changes on top.

### Joining a clone that was made before this

A clone taken when `main` was the default still points at it. To move onto
`develop`, keeping work already done:

```bash
git fetch origin
git stash                              # only if you have uncommitted work
git switch -c develop origin/develop
git stash pop
```

If you already committed on your local `main`, those commits sit directly
on top of what `develop` branched from, so they can go straight on:

```bash
git fetch origin
git switch -c develop                  # at your current HEAD, with your work
git push -u origin develop
```

Prefer a pull request for anything you want the other person to read
before it lands. Nothing about `develop` requires one.

### Releasing to main

`main` exists to hold the last known-good state. Move it with a PR:

```bash
gh pr create --base main --head develop --fill
```

Direct pushes to `main` are rejected for everyone, owner included.

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

The preview draws the case, crown, chapter ring, bezel insert and hands as
SVG from `lib/preview/art/`, and shows the dial as the vendor's own
photograph. Only the dial needs a prepared asset; nothing fetches a vendor
image at request time.

```
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

## Style tags and search

```
pnpm backfill-style-tags            # assign the controlled vocabulary from listing names
pnpm backfill-style-tags --dry-run  # report the distribution, write nothing
```

`lib/style-vocabulary.ts` holds the 43-tag controlled vocabulary and is the
single source for both the model prompt and the validator, so the two
can't drift. Natural-language and image search parse to constraints and
then query deterministically — the model never picks a part and never
judges compatibility. Without `ANTHROPIC_API_KEY` both features fall back
to keyword parsing over the same vocabulary rather than failing.
