# Where a render runs -- nothing here changes what it draws, so this file is
# not part of any output's content hash (render-config.json, referenceRenderer).
#
#   RENDER_DEVICE=auto|OPTIX|CUDA|METAL|HIP|ONEAPI|CPU  (default from render-config.json)
#   RENDER_DRY=1   build the scene, apply the config, pick the device, then stop

import json
import os

import bpy


def select_device(scene, config):
    """auto takes the first backend in the config's order that has a device,
    else the CPU. A named backend that isn't there is an error, not a silent
    CPU fallback. Returns what was used, for the RESULT line."""
    want = os.environ.get("RENDER_DEVICE", config["device"]["default"]).upper()
    if want == "CPU":
        scene.cycles.device = "CPU"
        return "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in config["device"]["order"] if want == "AUTO" else [want]:
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue  # backend not compiled into this Blender build (e.g. METAL off macOS)
        prefs.get_devices()
        if any(dv.type == kind for dv in prefs.devices):
            for dv in prefs.devices:
                dv.use = dv.type == kind
            scene.cycles.device = "GPU"
            return kind
    if want != "AUTO":
        raise SystemExit(f"RENDER_DEVICE={want}: no such device on this machine")
    scene.cycles.device = "CPU"
    return "CPU"


def dry_exit_if_asked(scene, device, hdri):
    """RENDER_DRY=1: report what would render, without rendering."""
    if os.environ.get("RENDER_DRY") != "1":
        return
    cy = scene.cycles
    print("DRY " + json.dumps({"device": device, "blender": bpy.app.version_string, "samples": cy.samples,
                               "adaptive": cy.adaptive_threshold, "denoise": cy.use_denoising, "filter": cy.filter_width,
                               "bounces": cy.max_bounces, "clamp_indirect": cy.sample_clamp_indirect,
                               "view": scene.view_settings.view_transform, "size": scene.render.resolution_x,
                               "hdri": os.path.basename(hdri)}))
    raise SystemExit(0)
