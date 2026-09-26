# Render-config guards for the 3D preview renderer (WS2a).
#
# Denoising is safe on the beauty image only. Two ways it goes wrong, and
# both are refused here rather than left to a flag:
#
# 1. A data pass is denoised. UV, mask and AOV passes carry numbers, not
#    light; smoothing them moves texture lookups and blurs mask edges.
#    Cycles's own denoiser writes only the Combined pass, so the one route
#    to a denoised data pass is a compositor Denoise node fed by something
#    other than the render layer's image.
# 2. A crystal is in the scene. OIDN takes its albedo and normal guides at
#    the FIRST surface hit, which is the crystal, and smooths the dial print
#    away behind it. The WS2a side-by-side was run with no crystal; if one
#    comes back, rerun it (scripts/3d-test/denoise-check.ts) before lifting
#    this.
#
# Plain bpy, no scene building, so it can be tested on its own:
#   blender -b --factory-startup --python-exit-code 1 --python scripts/render/test_render_guards.py

BEAUTY_SOCKETS = {"Image", "Noisy Image"}


def denoise_config(scene, mode, crystal):
    """Apply DENOISE=on|off|rgb to the scene. Raises on an unsafe combination."""
    if mode not in ("on", "off", "rgb"):
        raise ValueError(f"DENOISE={mode!r}: expected on, off or rgb")
    if mode != "off" and crystal != "none":
        raise ValueError(
            f"DENOISE={mode} with CRYSTAL={crystal}: OIDN smooths the dial print behind a crystal. "
            "Rerun the WS2a denoiser check with the crystal before allowing this."
        )
    c = scene.cycles
    c.use_denoising = mode != "off"
    c.denoiser = "OPENIMAGEDENOISE"
    c.denoising_use_gpu = True
    c.denoising_prefilter = "ACCURATE"
    c.denoising_input_passes = "RGB" if mode == "rgb" else "RGB_ALBEDO_NORMAL"


def assert_data_passes_not_denoised(scene):
    """Refuse any compositor Denoise node whose image is not the beauty pass."""
    tree = scene.node_tree if scene.use_nodes else None
    if tree is None:
        return
    for node in tree.nodes:
        if node.type != "DENOISE":
            continue
        for link in node.inputs["Image"].links:
            src = link.from_socket
            if link.from_node.type != "R_LAYERS" or src.name not in BEAUTY_SOCKETS:
                raise ValueError(
                    f"compositor node {node.name!r} denoises {link.from_node.name}.{src.name}: "
                    "only the beauty image may be denoised, never a data pass (UV, mask, AOV)"
                )
