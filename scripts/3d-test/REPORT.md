# TEMPORARY — 3D case proof of concept (2026-09-22)

Disposable. Nothing here is imported by the app, the build, the tests or
`verify-catalog`. Delete `scripts/3d-test/` once the question is settled.

**Question:** can a procedurally generated 3D case, rendered with real
materials and light and pre-baked to PNG, beat the tab 6 facet render at
the one thing tab 6 cannot do: continuous surface falloff across an interior?

**Answer:** partly on falloff, not on silhouette, and it loses on legibility.
Not worth rolling out. Details below.

## Files

| file | what |
|---|---|
| `case_geometry.py` | Pure numpy. Builds a heightfield from `{caseDiameter, lugWidth, aperture}` and measures the result back off the grid. |
| `render_case.py` | Blender/Cycles scene: mesh, brushed-steel material, one area light, the preview's fixed ortho camera. Everything tunable is in `LOOK`. |
| `render-tab6.tsx` | Renders the production `CaseBody` on its own (tab 6) at 800px. |
| `compare.ts` | Flattens a render onto paper plus the SVG's RECESS disc, then builds the side-by-side sheet. |
| `out/COMPARISON-3way.png` | Tab 6, then the final 3D render, then vendor photo NMK942. |
| `out/final-37.8-flat.png` | The same pipeline run on the 37.8/20/28.5 dimension set. |

## Toolchain

Blender 4.5.14 LTS, portable zip, headless (`-b --factory-startup`), with
Cycles on the GPU (RTX 3050, OptiX). Blender wasn't installed, so it was
downloaded with permission, about 400MB.

Why Blender and not trimesh/pyrender: pyrender's PBR has no anisotropy,
so "brushed steel" would have been rough metal from the start, and the test
would have been rigged to fail. Cycles provides anisotropic GGX, custom
normals, per-vertex attributes for polished vs brushed, and is scriptable end
to end. Headless rendering worked first time. Each part costs about 3.7s to build
the mesh and about 6s to render at 800px/256spp.

The mesh is a **heightfield**: one vertex every 0.04mm, about 980k verts. From a
fixed top-down orthographic camera it contains every surface the camera can see,
so side walls, caseback and lug undersides are not modelled. This mesh
**cannot be rotated.** For this question that doesn't matter, but it matters
for any "3D viewer" idea later.

## Geometry vs the stated numbers

These are read back off the generated grid, not off the inputs:

| | stated | measured (42.5 set) | stated | measured (37.8 set) |
|---|---|---|---|---|
| case diameter | 42.5 | 42.463 | 37.8 | 37.825 |
| lug width (gap) | 22 | 21.991 | 20 | 19.992 |
| lug-to-lug | 46.0 (dia + 3.5) | 45.982 | 41.3 | 41.264 |

Every value is within one grid step (0.04mm).

**Caveat that matters:** only three inputs come from the catalog. Everything
else is a constant: lug root and tip thickness, lug overhang, fillet, crown
guard, edge chamfer, seat depth, lug-drop curve, and the 38mm insert seat.
Tab 6 uses exactly the same constants. The 37.8 render shows the result.
The seat is cut for a 38mm insert, so it is wider than the 37.8mm case,
and the case top rim disappears. **The production SVG has the same bug.**
`CaseBody` computes `seatR` from `m.insertOuter`, which defaults to 38 when
no insert is chosen, whatever the case size. So "16 correct meshes
automatically" is true for three numbers. Every other number repeats one
SKX-shaped guess 16 times.

## Does it beat tab 6?

**Interior falloff: yes, but only where the geometry curves or the light is
close.** It shows up in two places:
- The lug tops curve down toward the tips, so they grade from lit to dark
  along their length. Tab 6 can't produce that.
- With the light at 70mm rather than at infinity, the flat case rim picks up a
  gentle highlight gradient from top-left to bottom-right.

It is subtle at 800px. **A flat surface stays flat.** From an orthographic
top-down camera every point on a plane reflects the same direction, so the
falloff is there only because the light is close. The 3D render did not
produce the "interior surface character" the Route B note asked for. It
produced some falloff because the geometry has slopes and the light has a
position, and both of those are inputs we chose.

**Brushing: invisible.** At 16.5px/mm, brushing grain is below one pixel.
Anisotropy only shows up in the shape of a highlight, and a flat plane seen
top-down has almost no highlight to shape. At this scale, brushed and satin
render the same. The vendor photo shows brush lines because it is roughly 42px/mm and
shot at an angle.

**Silhouette accuracy: no gain, same outline.** The outline is the same
construction as `caseOutline()`, on purpose, so the difference comes from rendering and not
from reinterpreting the numbers. The smooth-union fillets are marginally
cleaner, and nobody would notice. Top-down 3D adds no silhouette
information. Silhouette accuracy is limited by the constants above, not by
the renderer.

**Where it is worse:**
- **Legibility of steps.** Tab 6 paints the bezel seat as a darker ring and
  the chamfer as a lighter rim. Those tones are invented, but they explain the stepped
  construction. In the 3D render the seat floor is the same metal facing the same
  way, so it takes the same tone, and the step reduces to a hairline. It is
  physically honest and less informative.
- **It invites photographic expectations.** Next to the vendor photo, the
  3D case reads as a clean CG render of a part. It no longer reads as a
  diagram, and it is plainly not a photograph: no machining marks, no brush
  texture, no crisp faceted lugs. This is the "mediocre 3D" failure the
  brief warned about. Tab 6 is read as a diagram, which is also what the
  caption says. The 3D render would get judged against the photo, and it loses.
- **Rounded edges look moulded.** The first profile, a 0.8mm quarter-round,
  read as pewter or plastic. The flat 45° chamfer, used in the final render, looks machined, and
  what it contributes is a constant-width band that is bright on one side
  and dark on the other. **That is the tab 6 facet, now emerging from
  geometry.** The single best-looking element of the 3D render is what
  tab 6 already draws.
- **"One light" doesn't hold up.** Under a strict single light with a black world,
  metal reads as dark chrome in a void, with black edges and black lower lugs,
  because metal only shows what it reflects. It started looking like steel
  only after I added a directional ambient surround (bright toward the key,
  dark away), which is really a second, shaped light source. A uniform grey
  surround turned every edge into a flat grey outline.

## Time: geometry vs look

| phase | wall clock | runs | converged? |
|---|---|---|---|
| geometry (heightfield, SDF outline, measure-back) | ~4 min | 3 (one bug in the *measurement*, none in the mesh) | yes, and checked against numbers |
| second dimension set | ~0 | 1 | geometry yes; exposed the constants problem |
| material + lighting | ~6 min | 14 renders | **no**; stopped at "acceptable" |

Wall clock is mine, not a person's, so read it as a ratio. The numbers
matter less than how the two phases behaved. Geometry was deterministic
and **verifiable**: it is right or wrong against a number. The look had no
anchor. The first light was about 50× too bright, each fix exposed a new failure
(blown top, then black edges, then grey outline, then pillowy rounds), and
the only judge was my eye against a photo taken at a different angle. The
look transferred unchanged to the 37.8 case, because the category, camera
and light are the same. It would not transfer to hands, crowns or inserts,
which need their own materials: lume, painted markings, ceramic or aluminium
inserts, knurling. Each category restarts the part that doesn't converge.

## Honest read

**It's a dead end at this scale, like Route B, for a related reason.**
Route B was closed because it improved edges, which were already strong.
3D improves interior falloff a little, where it was weak. The best part of
the result turned out to be the constant-width edge band tab 6 already has,
and it costs:
- a 400MB toolchain and an offline bake step per part,
- a look-tuning loop with no convergence criterion,
- a render that now invites comparison with the vendor's photograph and loses.

If interior character is still the goal, the finding points somewhere
cheaper: the one real gain, lug tops grading along their length, is a
**known profile under a fixed light**. It could be baked once per dimension
set as a gradient or a small raster ramp inside the existing SVG, with no
3D runtime and no per-category material work. That is a separate, small
experiment and is not proposed here.

Separately, and not temporary: the `seatR`-from-default-insert bug in
`CaseBody` affects every non-SKX case in production today.

## Data note

The brief said the SKX set (42.5/22/28.5) covers 367 of 401 cases, across
16 dimension sets. The catalog as checked in has **253 of 401 approved
cases** in that set (all family `skx007-case`). There are 17 raw combinations,
counting blanks and two obvious bad parses (case diameters of 7 and 8mm,
probably crown sizes). `caseDimensions()` already bounds case diameter to
30–48mm, so those two draw at the 42.5 default. The bad values are still in
`attributes`.
The 367 figure may come from a different catalog state.

---

## Follow-up: options A and D (full solid, 3/4 view)

`render_solid.py`. Seven separate meshes: case, caseback, bezel (120-notch
coin edge), insert, knurled crown, stem, dial. About 61k faces in total,
exported as `out/D-model.glb` at 1.7MB.

**Geometry (A)**, measured after construction: case 42.500, lug width
22.000, lug-to-lug 45.998. The case top is built explicitly, with a 45°
chamfer strip offset along the outline normal and the top surface
triangulated with Blender's constrained Delaunay, lifted to the lug-drop
curve. A bevel modifier over boolean output shredded the lug tops and
threw spikes, which cost two iterations. Heights such as case thickness and
lug underside are constants read off photos, not catalog values. The seat is
clamped inside the case, so this model does not repeat the production seat bug.

**Surface (D):** five lighting passes. The bundled studio HDRI alone
rendered the steel as black chrome. A flat white tent made it washed out, with
featureless flanks. A tent with a horizon gradient and a light grey floor gave
the final look. The dial is the prepared vendor photo at low specular.

**Read:**
- At 3/4 in clay, A looks like competent product CAD, in the same genre
  as Meshy's clay view. It is crisper and dimensionally right, but it has
  less organic detail: no machining marks, hands or crystal.
- D is the first render in this whole investigation that reads as a
  steel watch case rather than a drawing of one. The camera angle and the
  environment do most of the work, which matches the prediction.
- Top-down, A and D still lose the tab 6 legibility argument, as before.
- The brushed/polished split is visible at 3/4 but the brush grain is
  not, for the same pixel-density reason as before.
- The glTF in a stock web viewer does not reproduce the Blender lighting.
  A live 3D viewer would need its own environment work.

---

## Follow-up: D completed with hands, crystal and printed insert

- **Hands:** the catalog's `hand-sword` shapeTag for the SKX hand sets,
  with the widths ported from `lib/preview/art/hands.tsx`, which were measured off a vendor
  photo. Modal stated reach 8.5 / 12.5 / 12.5mm, at 10:10. Polished steel with
  raised lume inlays, 0.15mm thick, stacked at real heights. They cast shadows
  on the dial.
- **Crystal:** flat, 1.15mm. At mineral-glass IOR 1.5 it put the key light
  and softboxes on the dial as grey discs. Blender's "Specular IOR Level" has no
  effect on a glass BSDF (**a wasted pass**). IOR 1.1, about 0.2% reflectance
  and roughly an AR coating, fixed it. Shadow rays pass through, because Cycles
  has no caustics by default. glTF export gets a plain transmissive stand-in.
- **Insert:** a **generated** SKX-style print (`make-insert.ts`) at the
  stated 38 / 31.8mm. Every lumed black SKX-style insert asset in the catalog
  was photographed with its lume glowing, so none was usable for a daylight
  render. This is an approximation of the design, not a catalog photo.
- **Not modelled:** chapter ring (the grey band inside the insert is bare
  steel; a real SKX has a black printed ring there), date wheel, strap.
- The dial renders charcoal rather than the photo's black, because the tent lights it.
- Export: `out/D2-model.glb`, 2.0MB, about 67k faces, 21 meshes.

**Read:** top-down, this is now recognisably an SKX007 at the right
proportions. It is the first image in this investigation that could stand in
for a product photo at a glance. At 3/4 it reads as a CG product render.
Each new part (hands, crystal, insert) was cheap as geometry: one pass, and
correct first time against the measured widths and stated lengths. Each part
needed its own material decision, and the crystal cost three passes. That is the
same geometry-vs-look split as every earlier round.

---

## Follow-up: full build (chapter ring, day-date, gasket, jubilee)

- **Chapter ring:** an angled frustum at the modal stated 30.5 / 27.7mm,
  overlapping the dial edge. The print is **generated** (`make-textures.ts`),
  because all the catalog's chapter-ring assets are three-quarter perspective photos
  that can't be projected onto a top-down ring.
- **Day-date:** the vendor dial photo shows its window as solid white. The
  window is found by flood fill and cut to alpha, and a generated TUE 22 wheel
  plate sits underneath. The bore floor was lowered 0.8mm to make room.
- **Gasket:** black rubber ring under the crystal. It hides the bare-steel band
  that read as a missing chapter ring.
- **Bracelet:** 22mm jubilee (the catalog's `strap-jubilee` shape). Female end
  links are booleaned against the case cylinder so they hug it. Brushed outer
  links, polished centre links offset half a pitch, curved on a 30mm wrist radius.
  The first pass read as square tiles; heavy rounding (0.8 / 1.1mm) and tighter
  rows fixed that in one pass. It still reads slightly toy-like, because the real
  outer links are curved lozenges, not rounded blocks.
- Export `out/D3-model.glb`: 3.2MB, about 119k faces, 30 meshes, 4 textures.

**Cost pattern held:** every geometry addition worked first or second time.
The two material-type problems this round were both about images, not light: the
ring photos can't be reprojected, and the dial window is painted white. Both
were solved by generating the texture, so **these renders now mix vendor
photographs (the dial) with generated designs (insert, ring, date) that look
equally real.** For a tool whose claim is accuracy, that mix is the thing to
decide on before this goes anywhere near production.

---

## Follow-up: crystal options

The dial looked blurred through the crystal for three separate reasons, and
none of them was glass physics:

1. **Denoiser.** OIDN takes its albedo and normal guides from the first
   surface hit, which is the crystal, so it smoothed the dial print as noise.
   The options render at 2048 spp with denoising off (≈50s each on the 3050).
2. **Key light in the crystal.** Even at about 0.2% reflectance, the very bright
   key showed as a pale disc over the dial. Light linking now excludes the
   crystal from the key, which still lights all the metal.
3. **A shading bug of mine.** The crystal's flat faces were smooth-shaded
   into its bevel, so normals curved across the whole face and it became a
   lens. It bent the hands at IOR 1.3–1.5. It is now sharp at every bevel step.

Options, all in `out/cr-*.png`, with a switcher at the top of the viewer page:
clear AR (almost indistinguishable from no crystal), stock mineral IOR 1.5
(an honest sheen), blue-AR sapphire, double-domed sapphire (edge
magnification), clear plus a soft strip-softbox streak, and a no-crystal control.

---

## Follow-up: crystal removed, strap options

**Crystal:** option 7 (none) chosen. That is now the default, with the denoiser off at
1024 spp, as option 7 was rendered.

**Straps:** one of each catalog shapeTag, all on the same 30mm wrist curve
(`STRAP=` env):

| option | catalog tag (count) | built as |
|---|---|---|
| jubilee | strap-jubilee (27) | links: brushed outer, staggered polished pills |
| oyster | strap-oyster (29) | links: three flat per row, broad centre |
| mesh | strap-bracelet (21) | swept band, crossed-wave bump |
| rubber | strap-band (146) | swept band, tropic-style block bump |
| leather | strap-band | swept crowned band, pebble grain, stitch lines |
| nato | strap-nato (29) | thin band plus run under the case, two keepers |

- The swept bands carry UVs in millimetres, so every texture is authored at
  real scale. It took one pass to discover that a hard 0/1 pattern (brick mortar) gives
  the bump node one-pixel edges and nothing else. Smoothing the mortar fixed it.
- The Milanese weave is drawn at about 0.9mm. The real weave is about 0.3mm, which is below a
  pixel at this distance. That is an exaggeration so the texture reads, and it is labelled.
- Colours are representative and not taken from a specific listing.
- Each render takes 8–10s at 1024 spp.

---

## Follow-up: option 2 demo, pre-rendered layers

`LAYER=case|dial|ring|hands|insert|strap` renders one slot alone. Anything
that can sit in front of it and never changes shape between options (case
group, insert, chapter ring) is a **holdout**, so the layer's alpha is already
cut. The browser stacks the layers in a fixed order with no depth data
(`out/layers.html`).

- Hands carry their own shadow: in the hands layer the dial is a **shadow
  catcher**. Two failed passes first: the catcher also recorded the case's shadow and the
  light the masked objects bounced onto the dial. The masked objects are now
  invisible to shadow, diffuse, glossy and transmission rays in that layer only.
- Library: 21 variants per view x 2 views = 42 renders, 11 minutes on the
  RTX 3050 at 768 spp. 25MB PNG, **1.3MB WebP** (about 39KB per hero layer and 22KB per top-down layer).
  1,152 combinations per view from 21 images.
- Browser: about 0.9s cold first load, then **about 20–40ms per swap**.
- Versus a full render of the same build (`LAYERED-vs-FULL-green.png`): very
  close. What's lost is cross-part light only. The strap isn't shaded by the case at the lugs, and
  the case and bezel don't reflect the strap.
- **Scaling caveat:** holdouts assume the occluding geometry never changes.
  That holds within one case shape. Every case shape (and every insert or ring
  shape that differs in geometry, not just print) needs its own full set of
  layers for the parts behind it: layers x case shapes, not layers + case shapes.

---

## Correction: the strap looked detached because of a compositing bug

The earlier claim that "the layered build loses cross-part light" was only
half right, and the visible half was my own bug.

**The bug.** Each layer holds out the case, so its alpha is already cut where
the case is genuinely in front. The demo then drew the case *over* the strap,
so the case won wherever they overlapped, including where the strap is in
front. The strap read as running under the case instead of plugging into the
lugs. **Fix: draw the strap last.** Free.

**What remained after the fix.** The strap was still about 15% too bright at the
lugs (mean 56 vs the full render's 49), because a layer rendered alone never
sees the case's shadow.

**Fix for that: pair the interacting parts.** `LAYER=casestrap` renders the
case group and the strap in one image. The junction then measures 49, the same
as the full render, and the crops are indistinguishable
(`STRAP-JUNCTION-4way.png`).

| | junction brightness | images for 1,152 builds |
|---|---|---|
| separate, old order | 34 (strap hidden) | 21 |
| separate, fixed order | 56 (no shadow) | 21 |
| paired case+strap | **49** | 25 (12 pairs replace 2 + 6) |
| full render | 49 | one per build |

The paired set cost 24 renders (~7 min) and 1.6MB of WebP. The general rule:
**group the parts that visibly light each other, keep the rest separate.** The
count multiplies only inside a group — 6 finishes x 20 straps is 120 images,
about 40 minutes, once.
