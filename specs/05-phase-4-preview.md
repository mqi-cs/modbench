# Phase 4 — Visual Preview

Layered 2D compositing. **Roughly indicative, not photoreal.** The goal is "does this dial and hand combination read well together," not a render anyone would mistake for a photograph.

**Prerequisite:** Phase 3 pass measure met.

## Approach

Canvas 2D, drawn in z-order:

```
1. case body        (base plate, dial aperture masked transparent)
2. dial
3. chapter ring
4. hands            (hour, minute, second — composited as one asset set)
5. bezel + insert   (ring overlay, sits above the case edge)
6. crystal glare    (single static highlight overlay, low opacity)
```

Fixed canvas, 800×800, top-down only. No angles, no wrist shots, no 3D.

**Scope this phase to the `skx007-case` family only.** One case silhouette. Expanding to SKX013 is a later, cheap addition once the pipeline works.

## Asset preparation — the actual work

This is where the time goes, not the code. Vendor photography is shot at inconsistent angles, sizes, and white balance, so it cannot be used raw.

`scripts/prepare-assets.ts` using sharp:

1. Fetch the vendor image.
2. Normalise to 800×800, centred, transparent background.
3. Scale so the part's real-world diameter maps to a fixed pixel radius, using the `attributes` diameter fields. This is why those fields exist.
4. Write to `data/assets/<category>/<partId>.png` and record `assetState` on the part: `ready` | `needs-manual` | `unavailable`.

Automation will handle flat-on dial and insert photography reasonably well. It will fail on angled shots, lifestyle photos, and hands photographed as a loose set on a card. Expect to hand-edit a meaningful share, and expect hands to be the worst category.

**Draw the two case bases yourself.** Do not attempt to extract a case silhouette from vendor photos. Two clean top-down illustrations — case body and bezel ring — take an afternoon and give the whole preview visual coherence.

**Parts without a usable asset must still be selectable.** Show a labelled placeholder in the preview layer and a small note that this part isn't previewable. Never block a selection on a missing image, and never silently omit a layer — a preview that quietly drops the hands is worse than no preview.

## Implementation

```
lib/preview/composite.ts     // pure: layer list → draw calls
lib/preview/layers.ts        // z-order + per-category transforms
components/build/Preview.tsx // canvas element, redraws on build change
```

Keep `composite.ts` pure and testable: it takes a resolved layer list and a canvas context. Asset loading and caching live in the component.

Preload and cache decoded images in a `Map`. Redraw on any slot change. Target under 100ms redraw.

Add an export: render the canvas to a PNG blob for the share card in Phase 5.

## Honesty requirement

The preview must be visibly a diagram, not a photograph. Someone deciding to spend £300 must not believe they are seeing the finished watch.

Achieve this through the treatment — flat lighting, a visible construction feel, no fake reflections or depth-of-field — and a persistent caption stating it approximates part shapes and colours and that real finishes vary. This is a trust requirement, not a disclaimer to tuck away.

## Constraints

- No WebGL, no three.js, no 3D.
- No runtime image processing. Everything normalised offline.
- Assets served as static files. Never hotlink vendor images at runtime.
- Preview is progressive: draw whatever layers are ready as slots fill, don't wait for a complete build.
- `prefers-reduced-motion` — no transition animation between states, just redraw.

## Pass measure

1. **All three starter builds render** with every layer present.
2. **≥70% of approved dials, hands, and inserts** reach `assetState: 'ready'`. Below that the preview is too patchy to be worth showing — reassess before continuing.
3. **Missing assets degrade gracefully.** Deliberately mark five parts `unavailable` and confirm the preview still renders with labelled placeholders.
4. **Redraw under 100ms** on slot change with warm cache.
5. **Layer order is correct** in every combination — insert never behind the case, hands never behind the dial.
6. Show it to someone who doesn't mod watches. Ask what they're looking at. **If they say "a photo of a watch," the treatment has failed** the honesty requirement.
7. Canvas exports a valid PNG blob.

---

## Result — pass measure 2 is not reachable with this catalog's photography

**Measured, full catalog, after tuning:**

| Category | Ready | Total | % |
|---|---|---|---|
| Dials | 328 | 474 | 69.2% |
| Hands | 348 | 438 | 79.5% |
| Bezel inserts | 187 | 681 | 27.5% |
| Chapter rings | 355 | 378 | 93.9% |

Pass measure 2 asks for ≥70% across dials, hands and inserts. Aggregated
that is 863 / 1,593 = **54.2%**. Hands clear the bar, dials miss it by
0.8 points, and inserts miss it by 42. **Inserts fail structurally, not
from tuning.**

Ready rate for inserts, by vendor:

| Vendor | Ready | Total |
|---|---|---|
| watchandstyle | 165 | 168 (98%) |
| luciusatelier | 20 | 26 (77%) |
| namokimods | 0 | 237 (0%) |
| dlwwatches | 2 | 250 (0.8%) |

The two vendors at nil do not photograph bezel inserts. Namoki renders
every insert **already fitted to a complete watch** — dial, hands and all
— and DLW shoots them on wrists and on props. No image processing recovers
an isolated annulus from either: in the first case the pixels of the part
are there but inseparable from the watch around them, and in the second
the part is at an angle on a non-uniform background.

That sets a hard ceiling. Even at 100% recovery of every image from the
two vendors who *do* photograph inserts alone, the best attainable is
(474 + 438 + 194) / 1,593 = **69.4%** — still under the bar, before any
dial or hand is rejected at all. **The measure cannot be met, and the gap
is not something more work on the pipeline can close.**

### Reassessment

The spec's instruction is "below that the preview is too patchy to be
worth showing — reassess before continuing." The reassessment:

- **Ship it, scoped.** Dials, hands and chapter rings — the three layers
  that carry nearly all of a watch's visual character — are at 69%, 80%
  and 94%. A build whose insert cannot be drawn still shows a recognisable
  watch, because the drawn bezel ring is always present and only the
  printed scale inside it is missing.
- **The placeholder path is load-bearing, not a fallback.** It runs for
  roughly one insert in three, so it was built and tested first rather
  than bolted on: a part with no asset is named under the canvas as "not
  drawn — no usable vendor photograph", and the alt text says how many
  layers of how many were drawn.
- **What would actually move the number** is asking the two vendors for
  product shots of inserts alone. That is the same channel already open
  for dial date positions (D7). Added as **D9**.
- **Not attempted: extracting the insert annulus from Namoki's fitted
  renders.** Their renders are synthetic and consistently framed, so
  masking a radius band would half-work. It was rejected because the
  arithmetic above shows it cannot clear the bar even if perfect, and a
  vendor-specific geometric hack that silently degrades when their
  template changes is a bad trade for a number that still fails.

## Amendments

**A. Scale comes from platform geometry, not part attributes.** The spec
says to scale each part by its own `attributes` diameter field ("this is
why those fields exist"). Those fields are empty: `outerDiameterMm` is
null for all 681 inserts and `lengthSetMm` is null for all 438 hand sets,
because no vendor states either in a feed. Only dial `diameterMm` is
populated, and it is the same 28.5 for all 467 that carry it. Render
geometry is therefore keyed on the case platform in `lib/preview/layers.ts`.
This is the more accurate source, not a workaround: these parts are
interchangeable *because* their dimensions are fixed by the case they
mount to. The constants never enter `lib/compat` and no rule can read them.

**B. Assets are WebP, not PNG.** The layers are photographic, so PNG
cannot compress them — the full set came to 82MB, and lossless WebP
(130KB against 144KB on a sampled dial) and palette quantisation (140KB;
alpha defeats it) both landed within 10%. Lossy WebP at quality 88 with
alpha kept lossless is 2.6× smaller for no visible difference at this
size, taking the set to 34MB. Alpha stays at 100 because a soft cut-out
edge reads as a glow around every part, which is the photographic look the
honesty requirement rules out. The Phase 5 canvas export is still PNG.

**C. Chapter rings are un-projected, not photographed flat.** Every vendor
shoots chapter rings at a shallow oblique — 182 of 186 sampled, from all
four — because the printed minute track sits on the ring's inner wall and
is invisible from directly above. A top-down layer needs a circle, so the
ellipse is un-projected by stretching its minor axis back to the major.
Angular positions around the ring survive this exactly, which is the
property a diagram needs; foreshortened wall height does not, so a
corrected ring reads slightly wider than the real part.

**D. Assets live in `public/assets/`, not `data/assets/`.** Next.js serves
static files from `public/`; `data/` is not web-reachable.

## Pass measures — status

1. **All three starter builds render with every layer present.** Met, and
   enforced by a test against the live database rather than a fixture.
   Two starters had to have their bezel insert swapped for an equivalent
   part from a vendor who photographs inserts alone — a starter build is
   the first thing a visitor sees, so "we can draw it" is now a curation
   criterion.
2. **≥70% ready.** **Not met, and not attainable.** See above.
3. **Missing assets degrade gracefully.** Met. Tested by resolving layers
   with an empty previewable set and asserting every part-backed layer
   becomes a labelled placeholder rather than vanishing.
4. **Redraw under 100ms with warm cache.** Met for the work this code
   owns: resolving layers and issuing draw calls measures under 10ms per
   redraw over 200 iterations. Decoding is excluded by the "warm cache"
   premise and rasterising is the browser's.
5. **Layer order correct in every combination.** Met, tested over all 32
   subsets of the part-backed slots rather than by spot check.
6. **Show it to someone who doesn't mod watches.** **Outstanding — needs a
   person.** Cannot be self-assessed; the treatment is flat-lit with no
   gradients or specular highlights anywhere, and a persistent caption
   sits directly under the canvas, but whether that reads as "diagram"
   to a stranger is exactly what the measure exists to find out.
7. **Canvas exports a valid PNG blob.** Partially met. The browser half
   (`canvas.toBlob`) could not be exercised — the Chrome extension would
   not connect this session. Everything it depends on is tested offline:
   each draw call names a file that exists, decodes, is canvas-sized and
   has alpha, and compositing a starter build's layers in order yields a
   buffer with a valid PNG signature.
