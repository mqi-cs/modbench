# Render handoff: renderer revision 4 on the OptiX machine (3050)

Written 2026-09-28 on the Mac, for whoever (person or Claude session) finishes
the render on the RTX 3050 machine. Everything needed is in this repo on
branch `top-view-look` (PR #7, draft, against `develop`). Nothing here needs
the private pivot plan; the one rule it contributes is repeated in
"Rules" below.

## Aim

Finish **renderer revision 4** and leave the 3D preview library complete,
checked and committed:

1. Render all **528** jobs of the revision-4 manifest on **OptiX**.
2. Prune the revision-3 outputs they replace.
3. Re-render the three full-render references `check-v1..3.png`.
4. Re-measure `accuracy.ts`, confirm it's inside the WS2c threshold, and set
   the new baseline.
5. Check the result by eye, commit, push to `top-view-look`, update PR #7.

Do **not** merge.

## What revision 4 contains (already coded, tested, committed)

Two changes stacked on the same branch. Both are finished in code; only
rendering remains.

**Revision 3: the view from above** (commit `a39fce2`, D20 in
`specs/08-DEFERRED.md`). The top view used to be orthographic under a flat
white tent and read as an illustration. Now:
- a real **85 mm lens** from above (same framing at the case top), so the
  flanks, lug sides and bezel edge show;
- a top-down **studio set seen only in reflections**: a dim surround for
  glossy rays, two long strip lights either side (no shadow, no diffuse), and
  an overhead softbox the camera shoots through (keeps hands and brushed
  tops bright). Diffuse light is unchanged, so dial prints and lume light as
  before;
- brushed grain 0.12 → 0.3 in the top view only.
Hero view untouched. Revision 3 was rendered on the Mac (Metal) by the
owner's decision; revision 4 redoes everything on OptiX anyway.

**Revision 4: the case outline** (this handoff's commit, D21):
- A better generic SKX outline in `scripts/render/case_geometry.py`: lugs
  7.0 mm at the root, 5.2 mm at the tip, straighter flank (bulge 0.35 mm),
  squared tips with 1.0 mm corners; the crown guard is a shoulder either
  side of the crown (±11°, 14° ramps) instead of one long shoulder.
- **Crown position and guard from the case's own title** (vendor-stated):
  `case.crownAtThree` ("3 O'Clock", "3H", 50 cases) and `case.noCrownGuard`
  ("No Crown Guard", "NCG", 32). They reach the renderer as `CASE_CROWN=3` /
  `CASE_GUARD=0` and add `/c3`, `/ng` to the case layer's shape key only
  (`lib/render/shape-keys.ts`); every other layer stays keyed by the plain
  geometry (`geometryKey`), so only case and case+strap jobs multiply.
  Case shape keys went from 21 to 45.
- Spring-bar holes are drilled through each lug only (a full-width drill
  grooved the case body between the lugs once the tips grew).
- Cases whose title names a non-round outline (`case.outline`: B&R /
  "Square Case", Nautilus, Tuna, Turtle; 38 drawn before) now fall back to
  the SVG diagram with the reason (`lib/render/scene.ts`), commit
  `c74231b`. They still get rendered (D21e); that's expected.

`scripts/render/render-config.json`: `referenceRenderer.revision` is **4**,
`sourceFingerprint.sha256` matches the code (the test in `pnpm check`
proves it). The committed `public/render/layers/index.json` is still the
revision-3 index; the run below replaces it.

## Machine setup

- **Blender 4.5.14 LTS exactly.** `run.ts` refuses any other version
  (`render-config.json` pins it). Download:
  https://download.blender.org/release/Blender4.5/
- NVIDIA driver with OptiX (RTX 3050). `RENDER_DEVICE=OPTIX` forces it and
  fails loudly if it's missing.
- Node 20+ and pnpm (the Mac used Node 25 and pnpm 11).
- Git LFS (`git lfs install` once). Layers, references and input textures are
  in LFS.
- Google Chrome (headless) for `accuracy.ts`.

```bash
git fetch origin
git checkout top-view-look
git pull
git lfs pull
pnpm install --frozen-lockfile
pnpm check        # expect: tsc clean, 505/505 tests, verify-catalog 0 hard failures
```

If `pnpm check` fails on `render-config.test.ts` ("sourceFingerprint"), the
checkout's renderer source doesn't match the config: stop, don't edit the
hash, check you're on the right commit (see Troubleshooting).

## Steps

Set these once per shell. Paths are examples; use this machine's.

bash (Git Bash / WSL / Linux):
```bash
export BLENDER="/c/Program Files/Blender Foundation/Blender 4.5/blender.exe"
export RENDER_DEVICE=OPTIX
export CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
```
PowerShell:
```powershell
$env:BLENDER = "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe"
$env:RENDER_DEVICE = "OPTIX"
$env:CHROME = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### 1. Dry run

```bash
npx tsx scripts/render/run.ts --dry-run
```
Expect: `shape keys: case 45, crown 1, dial 1, hands 4, insert 1, ring 1, strap 6`
and `jobs: 528; to render: 528; already rendered: 0`. Anything else: stop
(Troubleshooting).

### 2. Render (the long part)

```bash
npx tsx scripts/render/run.ts
```
Each job is its own Blender process; the log line is
`  n/528 <seconds>s <job id>`. On the Mac jobs took 9–17 s (~14 s typical,
~2 h total); expect the same order or faster on OptiX. Surface jobs (dial,
date, ring, insert) run Blender twice. `run.ts` renders only what's missing,
so if it's interrupted, just run it again: it resumes. It writes
`public/render/layers/index.json` at the end.

Check it finished: `npx tsx scripts/render/run.ts --dry-run` →
`to render: 0; already rendered: 528`.

### 3. Prune the outputs revision 4 replaced

```bash
npx tsx scripts/render/run.ts --prune
```
Renders nothing (all 528 exist), then deletes layer files no job references
(the revision-3 set). Keeps `check-*.png`. Expect about 480 files pruned.

### 4. Re-render the three references

```bash
npx tsx scripts/render/references.ts
```
Writes `public/render/layers/check-v1.png` (hero, steel), `check-v2.png`
(top, steel), `check-v3.png` (hero, gold): full renders of the builds
`accuracy.ts` composites. ~10–20 s each.

### 5. Accuracy

```bash
npx tsx scripts/render/accuracy.ts --out ./accuracy-out
```
It prints `V1/V2/V3: MAD x p99 y (baseline a / b) ok|OUTSIDE` and exits 1 if
any is outside ±0.1 MAD / ±1 p99 of `BASELINE` in the script. After a
renderer revision, OUTSIDE is expected. Decide as follows:

- **Hard limit (WS2c threshold, set before testing): MAD ≤ 3 and p99 ≤ 30 on
  all three.** If any build breaks it, **stop**: don't re-baseline, don't
  commit renders. Report the numbers and look at `accuracy-out/V*.png`
  against `check-v*.png`.
- Inside the limit: set `BASELINE` in `scripts/render/accuracy.ts` to the
  new numbers, and add a line to its comment:
  `Revision 4, <date> (case outline, crown variants; rendered on OptiX): V1 …, V2 …, V3 …`.
  Re-run; all three must print `ok`.

For reference, revision 3 measured V1 0.95/14, V2 2.36/28, V3 0.76/10 (V1/V3
were OptiX-era hero layers; V2 was Metal).

### 6. Look at it

```bash
pnpm dev     # http://localhost:3000/build
```
Check, in both the "Three-quarter" and "From above" buttons:
1. Starter **Classic diver**: new lugs (straighter, squared tips), crown
   guard either side of the crown, drilled lug holes; top view has depth
   (flanks visible) and banded metal; dial and hands as bright as before.
2. A crown-at-3 case, e.g. **"Case - SKX007 Classic 3H - Polished Steel (With
   Case Back)"**: crown at 3 o'clock.
3. A no-guard case, e.g. **"NMK905 No Crown Guard SKX007/SRPD Watch Case"**:
   no guard.
4. **"NMK921 B&R …"** or **"NMK920 Tuna …"**: diagram, with "this case's
   square/shrouded shape isn't modelled in 3D".
5. No holes, seams or dark bands anywhere around the dial, ring or insert.

### 7. Commit and push

```bash
pnpm check
git add -A
git commit -m "Renderer revision 4 rendered on OptiX: 528 jobs, references, accuracy baseline" \
  -m "<numbers from step 5; files pruned from step 3; anything seen in step 6>"
git push
```
Then add a comment to PR #7 with the step 5 numbers and the job count/time.
**Don't merge.**

## Rules (don't break these)

- **Glossy renders on OptiX** (the 3050) — metal finishes, polished parts.
  Matte/geometry-only passes may go on either machine. That's why this
  render moved here.
- **Never commit or push `specs/10-PIVOT-PLAN.md`** (private; it isn't on this
  machine anyway).
- **Don't change engine data** to match the drawing. In particular
  `case.crownPosition` stays as it is even where the title says 3 o'clock
  (D21a, owner's decision pending).
- **Don't edit `sourceFingerprint` or `revision`** to make a test pass. If the
  code and config disagree, find out why first.
- Don't hand-edit `index.json` or rename layer files; `run.ts` owns them.
- Commit with the attribution trailer the repo's other commits use.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `renderer source changed since render-config.json's sourceFingerprint` | Checkout doesn't match the branch head, or CRLF conversion (the fingerprint is LF-normalised, so it's rarely this). `git status`, `git log -1`; re-pull. |
| `Blender X found; render-config.json's referenceRenderer pins 4.5.14 LTS` | Wrong Blender. Install 4.5.14 and point `BLENDER` at it. |
| `missing renderer inputs (TEX_DIR=…)` | `git lfs pull` didn't fetch `scripts/3d-test/out/*`. |
| Dry run doesn't say 528 | The catalog DB differs from the branch's `data/modbench.db` (don't run ingestion here), or the checkout is behind. |
| `render failed: <job>` | Re-run `run.ts` (it resumes); if the same job fails twice, stop and report its id and the error lines. |
| `accuracy.ts` times out | `CHROME` path wrong, or headless Chrome has no WebGL2 on this machine. |
| OPTIX not found | Driver; or run `RENDER_DRY=1 npx tsx scripts/render/run.ts --dry-run` to see which device Blender picks. |

## Sources

- `specs/08-DEFERRED.md`: **D19** (stand-ins, revision 2 dial shadow fix),
  **D20** (top-view look, revision 3; D20a Metal render, D20b V2 accuracy),
  **D21** (case outline accuracy; D21a engine crownPosition, D21b–e open).
- `scripts/render/REPORT.md`: how the renderer, passes and compositor work;
  WS2c measurements.
- `scripts/render/render_solid.py` (scene, lights, layers),
  `scripts/render/case_geometry.py` (outline), `scripts/render/run.ts`
  (manifest runner), `scripts/render/references.ts`,
  `scripts/render/accuracy.ts`, `scripts/render/render-config.json`.
- `lib/render/shape-keys.ts` (case keys incl. crown variants),
  `lib/render/manifest.ts`, `lib/render/scene.ts` (guardrails),
  `lib/render/__tests__/` (tests that pin all of this).
- `data/fixtures/attribute-provenance.md`: where `outline`, `crownAtThree`,
  `noCrownGuard`, `integratedBezel` come from.
- `CLAUDE.md`: project rules and commands.
- Look-dev images (Mac only, not in git): `~/modbench/temp/top-view-look/`,
  `~/modbench/temp/case-shape/current-results.png`.
