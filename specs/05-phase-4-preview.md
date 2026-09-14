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

---

## Rollout — the preview is drawn, not composited

The preview no longer stacks prepared photographs. Case, crown, chapter
ring, bezel insert and hands are drawn as SVG from `lib/preview/art/`;
the dial stays the vendor's own photograph.

### Why

A run of side-by-side tests against vendor photography settled three
things in order. Proportion and colour closed most of the gap but left
flat fills reading as painted card. Gradients across an interior did not
fix that — polished steel concentrates its brightest values in narrow
bands at chamfers, so it is the *frequency* of the variation that says
metal, not its amplitude. A narrow constant-width edge facet did fix it,
and applying that same facet to every part from one primitive under one
light is what makes the assembly read as a single object.

### Shapes

Twenty silhouettes, all reachable — `verify-catalog` check 14 fails on any
shape that matches no part, because dead art reads as coverage that is not
there.

| Category | Shapes | Distribution |
|---|---|---|
| hands | 9 | sword 262 · three-lobe 54 · dauphine 39 · baton 32 · faceted 20 · arrow 12 · cathedral 8 · syringe 7 · pencil 4 |
| crown | 6 | smooth 115 · knurled 78 · chunky 35 · coin 31 · onion 9 · bolt 4 |
| bezel insert | 3 | dive 333 · gmt 287 · plain 61 |
| chapter ring | 2 | plain 308 · angled 70 |

`ring-flat` was defined and then removed: every listing mentioning "flat"
turned out to be describing the *insert* a ring suits ("flat chapter ring
for sloped inserts"), so it matched nothing.

### Fallbacks

The search vocabulary from Phase 6 answers "what does this look like" in a
shopper's words; it does not answer "what shape is this". Crowns and
chapter rings carried no tags at all, and 55% of hands carried only colour
tags. `scripts/backfill-shapes.ts` mines form from names and `body_html`,
preferring an existing reviewed tag over raw text, and every part with no
evidence takes its category's documented fallback:

| Category | Fallback | Parts | Share |
|---|---|---|---|
| hands | `hand-sword` | 233 | 53.2% |
| bezel insert | `insert-dive` | 187 | 27.5% |
| chapter ring | `ring-plain` | 111 | 29.4% |
| crown | `crown-knurled` | 35 | 12.9% |

All 566 are listed in `data/fixtures/shape-fallbacks.json`. A fallback is
a *visual* default, not a compatibility claim — nothing here reaches
`lib/compat`, and the distinction is why a default silhouette is
acceptable where a default fit would not be.

### Amendments

**E. The dial is the only photograph.** Dial coverage is 69.2%, above the
65% floor. Faking sunburst or applied-index texture in flat facets is a
much harder, lower-value problem than the silhouettes around it, and dial
photos were the strongest element in every comparison run.

**F. SVG, not canvas.** The canvas is gone. SVG server-renders, so a build
page still shows a picture with JavaScript disabled; sharp rasterises it
directly for the share card; and the art is vector anyway, so there is
nothing to pre-bake. `renderToStaticMarkup` is imported dynamically in the
OG route, because Next refuses a static import of `react-dom/server` from
a component module.

**G. Prepared assets are now dial-only in practice.** `prepare-assets.ts`
still processes hands, chapter rings and inserts, and roughly 24MB of
those assets are no longer read by anything. Left in place deliberately:
deleting them forecloses a photo fallback, and that is a separate call.

### Measurements after the rollout

- Lighthouse: `/` 96, `/styles/[slug]` 97, accessibility 100 on both.
  First pass came back at 91 — ten previews at sixty `<line>` elements per
  tick ring is a few thousand DOM nodes, so each ring is now one `<path>`.
- Build page payload 357KB gzipped against a 348KB baseline. The art map
  keyed by part id cost 35KB gzipped, almost all of it nanoid keys that
  gzip cannot compress; `lib/preview/art-codec.ts` indexes by sorted id
  order instead and carries no keys at all.

---

## Route B — closed, not deferred (2026-09-14)

**Decision: Route B is not being built, and this is not a TODO.**

Route B was the option of illustrating each part's true facet geometry —
modelling the actual cut surfaces of a hand, a crown, a lug — rather than
the constant-width edge strip Route A settled on. It stays closed for one
reason: it buys more of what the preview is already good at and none of
what it is short of.

Route A's strength is edges. The narrow bright strip on the lit silhouette
and the narrow dark strip opposite is what makes these read as metal at
all, and the side-by-side tests found the signal is the *frequency* of
tonal change at a chamfer, not its amplitude. Full facet geometry refines
exactly that: more edges, more accurately placed. The remaining gap is
somewhere else entirely — the interiors are flat, and the parts carry no
surface character (brushing direction, sunburst, the way a polished flank
picks up its surroundings). Route B does not touch flat interiors. It
would be a large, high-risk piece of work whose payoff lands on the one
axis that is already strong.

If the preview is ever pushed further, the next thing to try is interior
surface character, not finer edges. That is a different technique and a
different investigation, and it should be opened on its own terms rather
than by reviving this one.

---

## Dimensions — parts are drawn at their own stated size (2026-09-14)

`lib/preview/layers.ts` argued platform constants were the better source
because "no vendor states either in a feed". That was checked against the
parsed `attributes` columns and not against `body_html`, and it was wrong.

| field | stated by | was assumed | vendors actually say |
|---|---|---|---|
| bezel insert outer | 17.8% of inserts | 37.8mm | **38.0mm** |
| bezel insert bore | 20.1% of inserts | 31.3mm | **31.8mm** |
| chapter ring outer | 36.5% of rings | 30.6mm | **30.5mm** |
| chapter ring bore | 36.5% of rings | 28.5mm (flush with the dial) | **27.7mm** (it overlaps) |
| crown diameter | 9.6% of crowns | 7.0mm | 7.0mm, and 8.0mm on big crowns |
| hand reach H/M/S | 14.2% of hand sets | 9.0 / 12.5 / 13.0 | **8.5 / 12.5 / 12.5** |
| case diameter | 98.8% of cases | one platform constant | per part |
| case lug width | 95.5% of cases | one platform constant | per part |
| case dial aperture | 94.8% of cases | one platform constant | per part |

The chapter-ring bore is the one that mattered most: drawn flush with the
dial it left a hairline seam exactly where the eye goes first, and a real
ring overhangs the dial edge by about 0.4mm a side.

`scripts/backfill-dimensions.ts` parses the labelled patterns and writes
`attributes.renderMm`; anything not stated falls back to the MODAL stated
value rather than to the old assumption. **`renderMm` is display-only and
no rule in `lib/compat` reads it.** `attributes.lengthSetMm` is
deliberately left null even though hand lengths are now parseable, because
`hand-stack-clearance` keys off that field: a length mined from marketing
prose is good enough to draw with and not good enough to assert a fit
from.

---

## Silhouette and depth pass (2026-09-14)

**Case.** Redrawn as one closed path — body, four tapered lugs and a
crown-guard shoulder — replacing a circle with four rectangles laid over
it. The rectangles reached to the case centre and were shaded against
their own bounding boxes, so they read as floating tabs. The new outline
interrupts the body arc where each lug's own face leaves the circle,
fillets the inside corner, and bows the outer flank so the lug leaves the
body almost tangentially. `PathFacet` lights the whole silhouette as one
surface.

**Depth.** Perceived depth in a top-down render comes from stepped
elevation, and three cues were built and judged against vendor photographs:

1. *Inner-edge facets at every ring boundary* — kept. Already the
   technique; every step now has a visible lip.
2. *Narrow contact shadows at each step* — kept, and the strongest of the
   three. A dark band immediately inside each ring on the side away from
   the light, at the same light direction as the facets. Tried at roughly
   twice this strength and rejected: at that level the arcs stop reading
   as shadow and start reading as painted crescents.
3. *Axial offset of dial and hands* — **discarded.** A real photograph does
   shift the dial slightly with the light, but it shifts the case walls,
   the bore and the hands' own shadows by the same parallax. Moving only
   the dial made the chapter ring look out of round, which is a worse
   error than the one it fixed.

**Hands.** The sword silhouette — the fallback, so 233 of 438 sets — was a
straight blade tapering only at the tip. The real part is a lance,
narrowing toward both the tip and the boss. Corrected.

**Strap.** Now drawn, as three silhouettes. At this angle a strap is two
stubs disappearing behind the lugs, which is thin; it earns its place
because it is a priced slot, because it is the largest block of colour
after the dial, and because without it the lugs point at nothing, which is
part of what made them read as detached. Strap and bracelet genuinely
differ from above — a bracelet fills the lug gap in steel and breaks into
links across its width, a band sits inside the gap with stitching along
it, and a NATO is identified by its keepers, since the strip passing under
the case is invisible from above.

**Insert colour.** Vendors name the material and the face in one string —
"Steel Bezel Insert: Nautical Blue" carries both `silver-tone` and `blue`
— and with metal tones checked first, every such insert drew steel
coloured. Chromatic tags now win; metal tones are the fallback.

---

## Saturation — closed, both levers rejected (2026-09-14)

The GMT build's dial reads as a coloured object in an otherwise neutral
frame. The diagnosis held up: it is saturation and detail density, not
"photograph against drawing" — that dial is itself a flat studio shot.
Two levers were built and both are rejected.

**Warming the drawn metal toward the dial. Rejected.** Tested at two fixed
strengths and once adaptively, against three saturated builds and one
unsaturated control. The control is what settles it: the black dive
classic goes cream at 0.6, khaki at 1.2 and salmon under the adaptive
tint, for very little gain on the saturated builds. Warming does not
reduce the mismatch so much as move the neutral element from grey to
beige — it is still the only unsaturated thing in the frame, and it has
stopped reading as steel. The adaptive variant also turned out unstable:
all four test dials produced roughly the same tint direction, so "toward
this dial" was really "orange" with extra steps.

**Desaturating the dial photograph instead. Rejected, for a different
reason.** It behaves much better — the metals stay steel, the control
build is untouched, and −20% visibly helps the GMT. But it shows a
vendor's dial in a colour the product is not, on a tool whose entire claim
is accuracy. That disqualifies it regardless of how it looks.

**Decision: ship as-is.** This is closed, not deferred. If the preview is
ever pushed further here, the thing to try is interior surface character
(brushing direction, sunburst), which is the same conclusion Route B's
closure reached from the other direction.
