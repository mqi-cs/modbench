# TEMPORARY -- 3D proof of concept. Not wired into anything; delete
# scripts/3d-test/ when the question is answered.
#
# Builds the procedural case from case_geometry.py into a Blender mesh,
# gives it a brushed-steel material, one light, and the preview's fixed
# top-down orthographic camera, and renders an 800x800 PNG with alpha at
# exactly the SVG preview's scale (PX_PER_MM = 800*0.95/46).
#
#   blender -b --factory-startup --python scripts/3d-test/render_case.py -- <out.png> [json overrides]
#
# Everything tunable in the look lives in LOOK so a tuning run is one
# JSON argument, not an edit -- and so the report can say exactly which
# numbers were tuned by eye and which came from the catalog.

import json
import os
import sys
import time

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import case_geometry as geo  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else os.path.join(HERE, "out", "3d-case.png"))

# The dimension set under test: SKX007 family, from attributes.
DIMS = json.loads(os.environ.get("CASE_DIMS", '{"caseDiameter": 42.5, "lugWidth": 22.0, "aperture": 28.5}'))

LOOK = {
    # One light. Top-left in screen space, like LIGHT in facets.tsx.
    "light_azimuth": 315.0,      # degrees clockwise from twelve
    "light_elevation": 50.0,     # degrees above the case plane
    "light_distance": 120.0,     # mm
    "light_size": 80.0,          # mm, square area light
    "light_power": 6.0e6,        # W, in a scene where 1 unit = 1mm
    # Uniform world. 0 = strictly one light and nothing else.
    "world": 0.0,
    # Steel.
    "base": [0.62, 0.62, 0.62],
    "brushed_rough": 0.28,
    "brushed_aniso": 0.75,
    "polished_rough": 0.06,
    "brush_bump": 0.04,
    "exposure": 0.0,
    "view": "AgX",
    "samples": 256,
}
if len(argv) > 1:
    LOOK.update(json.loads(argv[1]))

T0 = time.perf_counter()

# --- scene ---------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# --- mesh ----------------------------------------------------------------
xs, ys, z, inside, polish, recess = geo.build(DIMS)
n = len(xs)
X, Y = np.meshgrid(xs, ys)
co = np.stack([X.ravel(), Y.ravel(), z.ravel()], axis=1).astype(np.float32)

# A quad wherever all four corners are inside the outline.
q = inside[:-1, :-1] & inside[1:, :-1] & inside[:-1, 1:] & inside[1:, 1:]
iy, ix = np.nonzero(q)
v00 = iy * n + ix
quads = np.stack([v00, v00 + 1, v00 + n + 1, v00 + n], axis=1).astype(np.int32)

# Drop vertices no face uses, then reindex.
used = np.zeros(n * n, dtype=bool)
used[quads.ravel()] = True
remap = np.full(n * n, -1, dtype=np.int32)
remap[used] = np.arange(used.sum(), dtype=np.int32)
quads = remap[quads]
co = co[used]

mesh = bpy.data.meshes.new("case")
mesh.vertices.add(len(co))
mesh.vertices.foreach_set("co", co.ravel())
mesh.loops.add(quads.size)
mesh.loops.foreach_set("vertex_index", quads.ravel())
mesh.polygons.add(len(quads))
mesh.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
mesh.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
mesh.update()
mesh.polygons.foreach_set("use_smooth", np.ones(len(quads), dtype=bool))

# Analytic normals from the heightfield gradient, per vertex. Smooth
# shading alone averages across the seat and bore steps and blurs them.
gy, gx = np.gradient(z, ys, xs)
nrm = np.stack([-gx, -gy, np.ones_like(z)], axis=-1)
nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
mesh.normals_split_custom_set_from_vertices(nrm.reshape(-1, 3)[used].tolist())

for name, arr in (("polish", polish), ("recess", recess)):
    a = mesh.attributes.new(name, "FLOAT", "POINT")
    a.data.foreach_set("value", arr.ravel()[used])

# Planar UVs in mm, so the brushing tangent and texture are in real units.
uv = mesh.uv_layers.new(name="uv")
loop_xy = co[quads.ravel(), :2]
uv.data.foreach_set("uv", loop_xy.ravel())

obj = bpy.data.objects.new("case", mesh)
scene.collection.objects.link(obj)
T_MESH = time.perf_counter() - T0

# --- material ------------------------------------------------------------
mat = bpy.data.materials.new("steel")
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
N = nt.nodes.new
L = nt.links.new

out = N("ShaderNodeOutputMaterial")
bsdf = N("ShaderNodeBsdfPrincipled")
bsdf.inputs["Base Color"].default_value = (*LOOK["base"], 1)
bsdf.inputs["Metallic"].default_value = 1.0

pol = N("ShaderNodeAttribute"); pol.attribute_name = "polish"
rec = N("ShaderNodeAttribute"); rec.attribute_name = "recess"

rough = N("ShaderNodeMix"); rough.data_type = "FLOAT"
rough.inputs["A"].default_value = LOOK["brushed_rough"]
rough.inputs["B"].default_value = LOOK["polished_rough"]
L(pol.outputs["Fac"], rough.inputs["Factor"])
L(rough.outputs["Result"], bsdf.inputs["Roughness"])

aniso = N("ShaderNodeMix"); aniso.data_type = "FLOAT"
aniso.inputs["A"].default_value = LOOK["brushed_aniso"]
aniso.inputs["B"].default_value = 0.0
L(pol.outputs["Fac"], aniso.inputs["Factor"])
L(aniso.outputs["Result"], bsdf.inputs["Anisotropic"])

tan = N("ShaderNodeTangent"); tan.direction_type = "UV_MAP"; tan.uv_map = "uv"
L(tan.outputs["Tangent"], bsdf.inputs["Tangent"])

# Brushing: fine grain across x, long along y (the 12-6 direction the
# lug tops are brushed in). Bump only where not polished.
tc = N("ShaderNodeTexCoord")
mp = N("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (60.0, 0.4, 1.0)
L(tc.outputs["UV"], mp.inputs["Vector"])
noise = N("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 1.0
noise.inputs["Detail"].default_value = 4.0
L(mp.outputs["Vector"], noise.inputs["Vector"])
inv = N("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0
L(pol.outputs["Fac"], inv.inputs[1])
bstr = N("ShaderNodeMath"); bstr.operation = "MULTIPLY"; bstr.inputs[1].default_value = LOOK["brush_bump"]
L(inv.outputs["Value"], bstr.inputs[0])
bump = N("ShaderNodeBump"); bump.inputs["Distance"].default_value = 0.002
L(bstr.outputs["Value"], bump.inputs["Strength"])
L(noise.outputs["Fac"], bump.inputs["Height"])
L(bump.outputs["Normal"], bsdf.inputs["Normal"])

# Dial aperture: held out (transparent), and compare.ts fills it with the
# SVG's own RECESS colour -- the dial is out of scope, and the bore must
# not become a point of difference between the two renders.
dark = N("ShaderNodeHoldout")
mix = N("ShaderNodeMixShader")
L(rec.outputs["Fac"], mix.inputs["Fac"])
L(bsdf.outputs["BSDF"], mix.inputs[1])
L(dark.outputs["Holdout"], mix.inputs[2])
L(mix.outputs["Shader"], out.inputs["Surface"])
if LOOK.get("clay"):
    # Debug: matte clay, to see the geometry's normals without the metal.
    clay = N("ShaderNodeBsdfDiffuse"); clay.inputs["Color"].default_value = (0.6, 0.6, 0.6, 1)
    L(clay.outputs["BSDF"], mix.inputs[1])
mesh.materials.append(mat)

# --- light ---------------------------------------------------------------
import math  # noqa: E402

az = math.radians(LOOK["light_azimuth"])
el = math.radians(LOOK["light_elevation"])
d = LOOK["light_distance"]
# Clockwise from twelve, world +y = twelve.
lx, ly, lz = d * math.cos(el) * math.sin(az), d * math.cos(el) * math.cos(az), d * math.sin(el)
ld = bpy.data.lights.new("key", "AREA")
ld.shape = "SQUARE"
ld.size = LOOK["light_size"]
ld.energy = LOOK["light_power"]
lo = bpy.data.objects.new("key", ld)
lo.location = (lx, ly, lz)
lo.rotation_euler = (0, 0, 0)
scene.collection.objects.link(lo)
track = lo.constraints.new("TRACK_TO")
track.target = obj
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"

world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = LOOK["world"]
if LOOK.get("world_grad"):
    # Directional surround: bright toward the key, dark away from it. Still
    # ambient, not a second light -- but it is what a tent with the key on
    # one side actually looks like to a mirror.
    wn = world.node_tree.nodes; wl = world.node_tree.links
    tc_w = wn.new("ShaderNodeTexCoord")
    dot = wn.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"
    dot.inputs[1].default_value = (math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el))
    wl.new(tc_w.outputs["Generated"], dot.inputs[0])
    ramp = wn.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = -1.0
    ramp.inputs["From Max"].default_value = 1.0
    ramp.inputs["To Min"].default_value = LOOK["world_grad"][0]
    ramp.inputs["To Max"].default_value = LOOK["world_grad"][1]
    wl.new(dot.outputs["Value"], ramp.inputs["Value"])
    wl.new(ramp.outputs["Result"], wn["Background"].inputs["Strength"])
scene.world = world

# --- camera: fixed, orthographic, straight down, SVG scale -----------------
cd = bpy.data.cameras.new("cam")
cd.type = "ORTHO"
cd.ortho_scale = geo.FRAME_MM
cd.clip_start = 1
cd.clip_end = 200
co_ = bpy.data.objects.new("cam", cd)
co_.location = (0, 0, 60)
scene.collection.objects.link(co_)
scene.camera = co_

# --- render --------------------------------------------------------------
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
        prefs.get_devices()
        if any(dv.type == kind for dv in prefs.devices):
            for dv in prefs.devices:
                dv.use = dv.type == kind
            scene.cycles.device = "GPU"
            break
    except TypeError:
        continue
scene.cycles.samples = LOOK["samples"]
scene.cycles.use_denoising = True
scene.render.resolution_x = geo.CANVAS_PX
scene.render.resolution_y = geo.CANVAS_PX
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.view_settings.view_transform = LOOK["view"]
scene.view_settings.exposure = LOOK["exposure"]
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUT

T1 = time.perf_counter()
bpy.ops.render.render(write_still=True)
T_RENDER = time.perf_counter() - T1

print(json.dumps({
    "out": OUT,
    "device": scene.cycles.device,
    "verts": len(co),
    "faces": len(quads),
    "mesh_s": round(T_MESH, 2),
    "render_s": round(T_RENDER, 2),
    "look": LOOK,
}))
