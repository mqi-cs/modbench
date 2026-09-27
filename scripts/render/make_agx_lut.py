# Bakes Blender's own view transform (AgX, as render_solid.py uses) into a
# 33^3 lookup table, so the browser compositor tone-maps exactly as Blender
# does. The three.js AgX approximation came out 11-13 levels brighter (WS2c).
#
#   blender -b --factory-startup --python-exit-code 1 --python scripts/render/make_agx_lut.py -- <out.png>
#
# Input axis per channel: linear value 2^(MIN_EV + t*(MAX_EV-MIN_EV)), t in
# 0..1 over N steps (log shaper). Layout: N slices side by side, slice = blue
# index; within a slice x = red, y = green (row 0 at the top). 8-bit sRGB.

import sys

import bpy

N = 33
MIN_EV, MAX_EV = -12.0, 4.5
out = sys.argv[sys.argv.index("--") + 1]

scene = bpy.context.scene
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0
scene.display_settings.display_device = "sRGB"

img = bpy.data.images.new("lut", N * N, N, alpha=True, float_buffer=True)
img.colorspace_settings.name = "Linear Rec.709"
lin = [2 ** (MIN_EV + (MAX_EV - MIN_EV) * i / (N - 1)) for i in range(N)]
px = [0.0] * (N * N * N * 4)
for b in range(N):
    for g in range(N):
        for r in range(N):
            # Blender images are stored bottom row first; row g=0 goes on top.
            k = (((N - 1 - g) * N * N) + b * N + r) * 4
            px[k:k + 4] = [lin[r], lin[g], lin[b], 1.0]
img.pixels.foreach_set(px)
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.color_depth = "8"
img.save_render(out, scene=scene)
print(f"wrote {out}: {N}^3 AgX LUT, EV {MIN_EV}..{MAX_EV}")
