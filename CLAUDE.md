# Modbench

Compatibility-checking configurator for Seiko watch mods (Next.js 15, TypeScript
strict, SQLite via Drizzle, Tailwind v4, Zod, Vitest, pnpm). Being extended into
a compatibility configurator + preview renderer sold to shops.

Current work plan: `specs/10-PIVOT-PLAN.md`. Read only the workstream section
you are working on — don't load the whole plan into every session.

**The pivot plan is private and must never be committed or pushed.** It is
kept out of git by `.git/info/exclude`, deliberately not `.gitignore`. Never
`git add -f` it, move or copy it to a tracked path, paste its contents into a
commit, PR, issue or tracked file, or add it to `.gitignore`. It exists only
in the main checkout, so a git worktree won't have it: read it at
`/Users/q/modbench/specs/10-PIVOT-PLAN.md`. Updating it in place there is
fine.

## Non-negotiables

These override everything else in this file, including plugin guidance.

- **The engine stays pure.** `evaluateBuild` (`lib/compat/index.ts`) never
  touches the database, network, environment or a model. Rules can't read a
  part's price or image; `CatalogPart` has no such fields. Keep it that way.
- **Zero false positives.** Never say two parts fit when they don't. Missing
  data → warn, don't guess. `ok-with-warnings` is the healthy state.
- **Only vendor-stated data may drive an error.** New sources (marketplace
  listings, user entries) get their own provenance values and limits.
- **The model never decides fitment.** `lib/llm.ts` turns text/images into
  constraints; code picks parts; the engine judges them.
- **Label anything that isn't the real product photo.**
- Two-layer messages. Rules independent of order (registration order in
  `RULES` is cosmetic).
- Report specific numbers, not summaries. Verify claims against the repo,
  especially after `/compact` — don't trust an earlier session's "done".
- Record every deferral in `specs/08-DEFERRED.md` with a reason, a restore
  signal and a cost.

## Minimal code: Ponytail

This project uses the Ponytail plugin (github.com/DietrichGebert/ponytail) to
keep changes small. It's declared in `.claude/settings.json`, but that
declaration doesn't reliably auto-install, so install it once per machine:

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
```

Its hooks need `node` on the non-interactive shell PATH.

How it applies here:

- Prefer reusing what exists before writing anything new: `lib/compat/tools.ts`
  (tool derivation), `components/build/StarterBuilds.tsx` and
  `data/fixtures/starter-builds.ts` (starter path), `lib/style-vocabulary.ts`,
  `lib/trademarks.ts`, `lib/dedup/`.
- **Never minimise away:** Zod validation of external data, provenance
  fields, "can't confirm" warnings, `verify-catalog` checks, bad-build
  fixtures with quoted sources, or tests. These are the product, not bloat.
- Ponytail marks shortcuts with `ponytail:` comments. A shortcut in
  `lib/compat/` or `scripts/` counts as a deferral — record it in
  `08-DEFERRED.md`, not just in the comment.

## Commands

```
pnpm dev                 # http://localhost:3000/build
pnpm check               # tsc + vitest + verify-catalog — run before calling anything done
pnpm test                # vitest only
pnpm test:coverage       # enforces ≥90% line coverage on lib/compat
pnpm verify-catalog      # data invariants over the live catalog
pnpm catalog:refresh     # re-tag → verify, after tagging-rule changes
pnpm catalog:rebuild     # full pipeline from raw feeds; order is load-bearing
pnpm db:generate         # after editing lib/db/schema.ts, then pnpm db:migrate
```

Ingestion is manual on purpose — never add a cron job or auto-ingest.
`data/modbench.db` **is committed** (only SQLite sidecars are gitignored);
the README says otherwise and is out of date.

## Where things live

- `lib/compat/` — the engine. `index.ts` entry, `types.ts` contracts,
  `platform.ts` family naming, `tools.ts` tool/cost derivation. 22 rules, one
  per file, in `lib/compat/rules/`. Tests in `lib/compat/__tests__/`
  (`known-builds`, `property`, `rules`).
- `lib/db/schema.ts` — Drizzle schema; parts are separate from listings.
  Migrations in `drizzle/`.
- `lib/catalog.ts` — server-side catalog snapshot for the engine.
- `lib/preview/` — SVG preview (`art/`); the dial is the only vendor photo.
- `lib/llm.ts`, `lib/intent.ts` — the only runtime model calls. Uses the
  Anthropic API via `ANTHROPIC_API_KEY`; falls back to keyword parsing
  without a key.
- `lib/pricing.ts`, `lib/money.ts` — totals; money in integer minor units.
- `lib/dedup/` — perceptual-hash + colour matching; merges are human-reviewed.
- `app/` — routes: `/build`, `/b/[id]` (shared builds), `/styles`,
  `/submit-match`, API routes under `app/api/`.
- `scripts/` — offline pipeline, run by hand.
- `data/fixtures/` — fixtures plus the findings that justify them.
- `specs/` — phase specs `00`–`08`, `09-COMPETITIVE-CONTEXT.md`, and the pivot
  plan `10-PIVOT-PLAN.md` (local only, never committed — see top).
- `lib/render/` — render manifest: `shape-keys.ts` (part → geometry key or
  reason), `manifest.ts` (jobs + content hashes), `load.ts` (read-only,
  optional vendor scope). Pure; tested under `pnpm check`.
- `scripts/render/` — the maintained 3D renderer (`render_solid.py`,
  `case_geometry.py`, `render_guards.py`) and `run.ts`, which renders
  missing manifest jobs to content-addressed `out/<hash>.png` (gitignored).
  Needs Blender 4.5 (`BLENDER=`) and the prototype's textures (D12e).
  Guard tests: `blender -b --factory-startup --python-exit-code 1 --python
  scripts/render/test_render_guards.py`.
- `scripts/3d-test/` — the 3D prototype's texture scripts, layer viewers,
  denoiser check and `REPORT.md`. Render output is gitignored.

## Working method

- One Claude Code session per workstream. `/clear` between unrelated
  workstreams; `/compact focus on <step>` mid-workstream if context fills.
- Don't start a workstream until its dependencies have passed their pass
  measures (dependency table in the plan).
- Before changing anything in a new area, check the plan's assumptions
  against the code and report mismatches.
- Stop and ask before any decision that changes direction; decide
  implementation details yourself.
