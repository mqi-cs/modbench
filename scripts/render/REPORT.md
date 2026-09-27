# Render pipeline — WS2c: geometry-only passes and browser compositor

*2026-09-27. Earlier history: `scripts/3d-test/REPORT.md` (prototype, WS2a denoiser check).*

**Principle:** render geometry once, apply appearance in the browser. A new
dial costs no render; only a new shape does.

## How it works

1. `lib/render/shape-keys.ts` keys every part by what the renderer builds.
   Case and hands keys carry the finish (`case:round/42.5/22/28.5#gold`,
   `hands:sword#black`); printed layers are keyed by geometry only.
2. `lib/render/manifest.ts` lists the jobs. Printed layers — dial, date
   wheel, chapter ring, insert — are **surface** jobs; case, hands, strap and
   the case+strap pair are **beauty** jobs (finished images).
3. `run.ts` renders a surface job twice (`PASSES_GREY` 0.05 and 0.5), with
   the printed surfaces plain grey and opaque, writing linear 16-bit passes
   (combined, diffuse colour, diffuse light, UV and mask AOVs).
   `pack-passes.ts` packs them into four 8-bit PNGs the browser loads:
   - `uv`: U and V at 12 bits across RGB, coverage in A (browsers decode
     16-bit PNGs to 8 bits, so the plan's 16-bit UV is packed instead);
   - `light`: diffuse light on the printed surface for a black print (L0);
   - `bounce`: extra light per unit of print albedo (the print's own light
     bouncing off the polished bore wall — linear in albedo);
   - `base`: everything else (gloss, metal, shadow), premultiplied.
4. `lib/render/compositor.ts` (WebGL2, framework-free, embeddable) draws
   `date, dial, ring, hands, insert, case, strap` back to front. Per surface
   pixel, in linear light:
   `colour = base + coverage · print(uv) · (light + meanAlbedo(print) · bounce)`,
   the print averaged over the pixel's 1.5 px footprint (Cycles' pixel
   filter), its alpha cutting the date window through to the date layer,
   then Blender's AgX from a baked 33³ LUT (`make_agx_lut.py`).
5. `lib/render/scene.ts` turns a build into the layer stack and the labels;
   `lib/render/prints.ts` picks each print (vendor dial photo, or a generic
   generated print, always labelled). `components/build/Preview3D.tsx`
   shows it in the configurator and falls back to the SVG diagram, with the
   reason, when a build can't be drawn this way.

## Findings that shaped it

| Problem | Evidence | Fix |
|---|---|---|
| Light pass empty under dark print | Cycles divides colour out of the light passes; a black window left a filled error blob | Passes rendered with plain grey prints |
| Denoiser ghost of the rendered print | Error along the default dial's features in other dials' composites | Same: no print in the pass render |
| Print's own bounce light | Grey 0.5 made every composite +2.7–3.3 too bright | Two greys → L0 + a·slope |
| Cycles' image colour is premultiplied | Date window read black in Blender, white in ours | Sample prints premultiplied |
| three.js AgX ≠ Blender AgX | +11–13 levels too bright | LUT baked from Blender: MAD 0.41, p99 1.4 |
| Holding out parts drawn later | Bright rings at every bezel/ring edge (bezel band error 5.33) | Inner parts complete; case drawn over them, holding them out |
| Hands reflected nothing | Hands darker than the full render | Other parts invisible to camera but visible to reflections |
| Top view mis-scaled | Top renders are 800 px | Canvas takes the layers' size |

## Measurements

**Dial swap** (passes rendered once; another dial's photo composited;
compared with a full render of that dial; threshold set in advance MAD ≤ 1.5,
p99 ≤ 10): SKX 0.98 / 12, d03 1.27 / 19, d02 (mother of pearl) 1.76 / 23.
Decomposition alone 0.33 / 1; the residual is a print-edge fringe from the
pixel-filter difference. Visually indistinguishable at 100 % and 300 %;
**recorded passed by the owner** despite the threshold.

**Whole builds in the browser vs full Cycles renders** (threshold set in
advance MAD ≤ 3, p99 ≤ 30; 8-bit, flattened on white, over watch pixels):

| Build | View | MAD | p99 |
|---|---|---|---|
| V1 steel SKX, MOP dial, jubilee | three-quarter | 1.64 | 41 |
| V2 steel SKX, enamel dial | from above | 1.86 | 34 |
| V3 gold SKX, Explorer dial, jubilee | three-quarter | 1.13 | 19 |

Before the stacking fix: 2.23 / 58, 3.35 / 71, 2.2 / 78. MAD passes on all
three; p99 fails on V1 and V2. The remaining >30 errors (12,107 of 850,759
pixels in V1) sit on the polished hands, 81 % darker than the full render.

**Swap time** (compositor only, 6 layers, 1600 px): cached dial median
5.7 ms (max 7.4); a dial never loaded, including fetch, decode and upload,
38.8–43.2 ms. Target ≤ 50 ms: met.

**Metal finish tint** (step 6): tinted steel vs real render — gold MAD
7.67 / p99 58, rose 6.06 / 55, PVD 17.4 / 92, matte 24.7 / 87. Roughness
differs per finish, not only colour: **each finish is rendered**.

**Manifest:** 336 jobs — 21 case keys (6 shapes × the finishes the catalog
uses), 4 hand colours, 6 straps; printed layers shared across finishes.
