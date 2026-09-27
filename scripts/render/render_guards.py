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

# Render-layer outputs that carry numbers, not light. Lighting passes
# (diffuse/glossy direct and indirect) may be denoised; these never.
DATA_SOCKETS = {"UV", "Vector", "Normal", "Depth", "Position", "Mist", "IndexOB", "IndexMA", "Alpha",
                "Denoising Normal", "Denoising Albedo", "Denoising Depth"}


def _upstream_sources(socket, seen=None):
    """Every render-layer output that feeds `socket`, through any chain of nodes."""
    seen = set() if seen is None else seen
    out = []
    for link in socket.links:
        node = link.from_node
        if node.type == "R_LAYERS":
            out.append((node, link.from_socket.name))
        elif node.name not in seen:
            seen.add(node.name)
            for inp in node.inputs:
                out += _upstream_sources(inp, seen)
    return out


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
    """Refuse any compositor Denoise node whose image traces back to a data pass or AOV."""
    tree = scene.node_tree if scene.use_nodes else None
    if tree is None:
        return
    aovs = {a.name for vl in scene.view_layers for a in vl.aovs}
    for node in tree.nodes:
        if node.type != "DENOISE":
            continue
        for rl, name in _upstream_sources(node.inputs["Image"]):
            if name in DATA_SOCKETS or name in aovs:
                raise ValueError(
                    f"compositor node {node.name!r} denoises {rl.name}.{name}: "
                    "light passes may be denoised, never a data pass (UV, mask, AOV)"
                )
