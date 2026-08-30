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
