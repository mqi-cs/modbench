# Tests for render_guards.py. Runs inside Blender; exits non-zero on failure.
#   blender -b --factory-startup --python-exit-code 1 --python scripts/render/test_render_guards.py
# Without --python-exit-code, Blender exits 0 even when the script crashes.

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_guards as g  # noqa: E402

failures = []


def check(name, fn, raises):
    try:
        fn()
        ok = not raises
    except ValueError:
        ok = raises
    print(("ok   " if ok else "FAIL ") + name)
    if not ok:
        failures.append(name)


def fresh():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.use_nodes = True
    tree = scene.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    scene.view_layers[0].use_pass_uv = True
    bpy.ops.scene.view_layer_add_aov()
    scene.view_layers[0].active_aov.name = "lume_mask"
    rl = tree.nodes.new("CompositorNodeRLayers")
    dn = tree.nodes.new("CompositorNodeDenoise")
    return scene, tree, rl, dn


def denoise_from(socket):
    scene, tree, rl, dn = fresh()
    tree.links.new(rl.outputs[socket], dn.inputs["Image"])
    g.assert_data_passes_not_denoised(scene)


check("beauty image into a Denoise node is allowed", lambda: denoise_from("Image"), raises=False)
check("UV pass into a Denoise node is refused", lambda: denoise_from("UV"), raises=True)
check("AOV mask into a Denoise node is refused", lambda: denoise_from("lume_mask"), raises=True)
check("no compositor is allowed", lambda: (setattr(bpy.context.scene, "use_nodes", False),
                                           g.assert_data_passes_not_denoised(bpy.context.scene)), raises=False)

scene = bpy.context.scene
check("denoise on without a crystal is allowed", lambda: g.denoise_config(scene, "on", "none"), raises=False)
check("denoise on with a flat crystal is refused", lambda: g.denoise_config(scene, "on", "flat"), raises=True)
check("denoise rgb with a domed crystal is refused", lambda: g.denoise_config(scene, "rgb", "dome"), raises=True)
check("denoise off with a crystal is allowed", lambda: g.denoise_config(scene, "off", "flat"), raises=False)
check("unknown DENOISE value is refused", lambda: g.denoise_config(scene, "yes", "none"), raises=True)

g.denoise_config(scene, "on", "none")
check("config sets OIDN with albedo+normal guides",
      lambda: None if (scene.cycles.use_denoising and scene.cycles.denoiser == "OPENIMAGEDENOISE"
                       and scene.cycles.denoising_input_passes == "RGB_ALBEDO_NORMAL") else (_ for _ in ()).throw(ValueError()),
      raises=False)

print(f"{len(failures)} failed")
sys.exit(1 if failures else 0)
