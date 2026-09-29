# TEMPORARY -- 3D proof of concept. Not wired into anything; delete
# scripts/3d-test/ when the question is answered.
#
# Procedural SKX-family case geometry, from the part's own stored
# dimensions (attributes -> renderMm: caseDiameter, lugWidth, aperture).
#
# Pure numpy, no bpy, so it can be run and measured on its own:
#
#   blender -b --factory-startup --python-expr "import sys; sys.path.insert(0,'scripts/3d-test'); import case_geometry as g; g.selftest()"
#
# WHAT IT BUILDS
#
# A heightfield over the camera's own frame: one vertex per 0.04mm, z(x, y)
# in millimetres, faces only where the point is inside the case outline.
# The camera is fixed, orthographic and straight down, so a heightfield is
# every surface the camera can see -- side walls and the caseback are
# invisible from here, and modelling them buys nothing for this question.
# It is NOT a mesh you could turn around; see the report.
#
# The outline follows the same construction as caseOutline() in
# lib/preview/art/parts.tsx, deliberately, so the silhouette comparison is
# about rendering and not about two different interpretations of the
# numbers: the same lug root/tip thickness, the same 1.75mm lug overhang,
# the same fillet radius and the same crown-guard shoulder. What differs is
# that it is built as a signed distance field, so the fillet and the
# lug-to-body blend are true smooth unions rather than hand-placed curves.

import math

import numpy as np

# Constants first shared with lib/preview/art/parts.tsx and geometry.ts. The
# 3D outline was reworked on 2026-09-28 (the SVG diagram keeps the old one):
# SKX lugs are chunkier and straighter than the diagram's, with squared-off
# tips, and the crown guard hugs the crown on both sides instead of one long
# shoulder. Crown position and guard follow the case (dims "crownAngle",
# "guard"), from the vendor's title: "3 O'Clock", "No Crown Guard".
LUG_ROOT_MM = 7.0
LUG_TIP_MM = 5.2
LUG_FLANK_BULGE_MM = 0.35    # was 0.9: a straighter outer flank
LUG_TIP_CORNER_MM = 1.0      # squared tip with rounded corners (was a semicircle)
FILLET_MM = 1.6
GUARD_MM = 1.6
GUARD_HALF_DEG = 11.0        # guard plateau, each side of the crown
GUARD_RAMP_DEG = 14.0        # ramp from the case round into the guard
CROWN_ANGLE = 120.0          # degrees clockwise from twelve (3.8 o'clock)
LUG_OVERHANG_MM = 1.75       # lugToLug = caseDiameter + 3.5
INSERT_OUTER_MM = 38.0       # modal stated insert OD; the bezel seat is cut for it

# Surface model -- the only numbers here that are NOT from the catalog.
EDGE_CHAMFER_MM = 0.8        # polished edge round the whole silhouette
EDGE_CHAMFER_SLOPE = 0.9
EDGE_PROFILE = __import__("os").environ.get("EDGE_PROFILE", "round")  # "round" or "chamfer"
SEAT_DEPTH_MM = 1.2          # bezel seat floor below the case top
BORE_DEPTH_MM = 5.0          # dial aperture: straight down into the case
LUG_DROP_START_MM = 17.0     # where the lug tops start curving down
LUG_DROP_RADIUS_MM = 12.0    # radius of that curve, in the 12-6 plane

# Frame: identical to the SVG's 800px viewBox. PX_PER_MM = 800*0.95/46.
CANVAS_PX = 800
PX_PER_MM = CANVAS_PX * 0.95 / 46.0
FRAME_MM = CANVAS_PX / PX_PER_MM     # 48.421mm across
STEP_MM = 0.04


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def smin(a, b, k):
    """Polynomial smooth minimum: a fillet of roughly radius k where two SDFs meet."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def polygon_sdf(px, py, poly):
    """Signed distance to a closed polygon, negative inside. Loops over edges, not points."""
    d = np.full(px.shape, np.inf)
    inside = np.zeros(px.shape, dtype=bool)
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        wx, wy = px - ax, py - ay
        t = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0.0, 1.0)
        dx, dy = wx - ex * t, wy - ey * t
        np.minimum(d, dx * dx + dy * dy, out=d)
        cond = ((ay > py) != (by > py)) & (px < (bx - ax) * (py - ay) / (by - ay + 1e-12) + ax)
        inside ^= cond
    d = np.sqrt(d)
    return np.where(inside, -d, d)


def lug_polygon(dims):
    """One lug in the +x/+y quadrant (world y up), tip cap included."""
    R = dims["caseDiameter"] / 2
    inner_x = dims["lugWidth"] / 2
    outer_x = inner_x + LUG_ROOT_MM
    tip_x = inner_x + LUG_TIP_MM
    reach = (dims["caseDiameter"] + 2 * LUG_OVERHANG_MM) / 2
    rc = LUG_TIP_CORNER_MM
    tip_cy = reach - rc
    root_y = math.sqrt(max(R * R - min(outer_x, R * 0.995) ** 2, 1e-6))

    pts = [(inner_x, root_y - 4.0), (outer_x, root_y - 4.0), (outer_x, root_y)]
    # Flank: quadratic from root to tip, control = chord midpoint pushed
    # out along its own radius.
    mx, my = (outer_x + tip_x) / 2, (root_y + tip_cy) / 2
    ln = math.hypot(mx, my)
    cx, cy = mx + mx / ln * LUG_FLANK_BULGE_MM, my + my / ln * LUG_FLANK_BULGE_MM
    for i in range(1, 17):
        t = i / 16
        x = (1 - t) ** 2 * outer_x + 2 * (1 - t) * t * cx + t * t * tip_x
        y = (1 - t) ** 2 * root_y + 2 * (1 - t) * t * cy + t * t * tip_cy
        pts.append((x, y))
    # Squared tip: outer rounded corner, flat end, inner corner meets the lug's inner face.
    for i in range(1, 9):
        a = math.pi / 2 * i / 8
        pts.append((tip_x - rc + rc * math.cos(a), tip_cy + rc * math.sin(a)))
    pts.append((inner_x, reach))
    return pts


def outline_sdf(X, Y, dims):
    """Signed distance to the case silhouette (negative inside), in mm."""
    R = dims["caseDiameter"] / 2
    r = np.hypot(X, Y)
    theta = np.degrees(np.arctan2(X, Y)) % 360     # clockwise from twelve

    # Body, with the crown guard as a shoulder either side of the crown.
    c = dims.get("crownAngle", CROWN_ANGLE)
    guard = 0.0
    if dims.get("guard", True):
        dist = np.abs(theta - c)
        guard = GUARD_MM * (1 - smoothstep(GUARD_HALF_DEG, GUARD_HALF_DEG + GUARD_RAMP_DEG, dist))
    sd_body = r - (R + guard)

    sd_lug = polygon_sdf(np.abs(X), np.abs(Y), lug_polygon(dims))
    return smin(sd_body, sd_lug, FILLET_MM)


def build(dims, step=STEP_MM):
    """Returns (xs, ys, z, inside, polish, recess) over the camera frame."""
    half = FRAME_MM / 2
    n = int(round(FRAME_MM / step)) + 1
    xs = np.linspace(-half, half, n)
    ys = np.linspace(-half, half, n)
    X, Y = np.meshgrid(xs, ys)
    r = np.hypot(X, Y)
    sd = outline_sdf(X, Y, dims)
    inside = sd < 0
    depth = -sd                                         # distance in from the silhouette

    # --- height ---------------------------------------------------------
    z = np.zeros_like(X)
    t = np.clip(np.abs(Y) - LUG_DROP_START_MM, 0, None)
    t = np.minimum(t, LUG_DROP_RADIUS_MM * 0.99)
    z -= LUG_DROP_RADIUS_MM - np.sqrt(LUG_DROP_RADIUS_MM ** 2 - t * t)

    # Rounded edge, quarter-circle profile. A flat 45-degree chamfer has one
    # normal, so under one light it is either all lit or all dark; a round
    # has every normal from flat to vertical, so the lit side finds its
    # glint somewhere across it -- which is what tab 6's facet paints.
    if EDGE_PROFILE == "round":
        c = EDGE_CHAMFER_MM
        u = np.clip(c - depth, 0, c)
        z -= c - np.sqrt(np.maximum(c * c - u * u, 0))
    else:
        edge = np.clip(EDGE_CHAMFER_MM - depth, 0, None)
        z -= edge * EDGE_CHAMFER_SLOPE
    polish = (depth < EDGE_CHAMFER_MM).astype(np.float32)

    seat_r = INSERT_OUTER_MM / 2 + 0.6                  # same as CaseBody seatR
    bore_r = dims["aperture"] / 2 + 1.2                 # same as CaseBody apertureR
    z = np.where(r < seat_r, -SEAT_DEPTH_MM, z)
    # Narrow polished lip on the seat wall, like the SVG's inner facet.
    polish = np.maximum(polish, ((r >= seat_r) & (r < seat_r + 0.25)).astype(np.float32))
    recess = (r < bore_r).astype(np.float32)
    z = np.where(r < bore_r, -BORE_DEPTH_MM, z)

    return xs, ys, z, inside, polish, recess


def measure(dims, xs, ys, inside):
    """Reads the dimensions back off the generated grid, not off the inputs."""
    step = xs[1] - xs[0]
    mid = len(ys) // 2
    row = inside[mid]                     # y = 0, the 9-3 line
    col = inside[:, len(xs) // 2]         # x = 0, between the lugs
    left_edge = xs[np.argmax(row)]
    top_edge = ys[len(ys) - 1 - np.argmax(col[::-1])]
    bot_edge = ys[np.argmax(col)]
    # Lug-to-lug: furthest y reached by any inside point.
    any_row = inside.any(axis=1)
    l2l = ys[len(ys) - 1 - np.argmax(any_row[::-1])] - ys[np.argmax(any_row)]
    # Lug gap: where the straight inner face meets the round tip cap. The
    # body circle still crosses this row near the centre, so skip past it
    # and take the first inside point on each lug.
    yi = np.argmin(np.abs(ys - (l2l / 2 - LUG_TIP_MM / 2)))
    body_x = math.sqrt(max((dims["caseDiameter"] / 2) ** 2 - ys[yi] ** 2, 0)) + 0.5
    xs_in = xs[inside[yi]]
    gap = xs_in[xs_in > body_x].min() - xs_in[xs_in < -body_x].max()
    return {
        "caseDiameter (9 o'clock radius x2)": round(-left_edge * 2 + step, 3),
        "caseDiameter (12-6, between lugs)": round(top_edge - bot_edge + step, 3),
        "lugToLug": round(l2l + step, 3),
        "lugWidth (gap between lugs)": round(gap - step, 3),
    }


def selftest():
    dims = {"caseDiameter": 42.5, "lugWidth": 22.0, "aperture": 28.5}
    xs, ys, z, inside, _, _ = build(dims)
    print("grid", len(xs), "x", len(ys), "inside", int(inside.sum()))
    for k, v in measure(dims, xs, ys, inside).items():
        print(f"  {k:40s} {v}")


def outline_polygon(dims, step=0.02, spacing=0.1):
    """
    The silhouette as one closed CCW polygon, in mm.

    Marching squares on the outline SDF, chained into loops; the longest
    loop is the case. Resampled to even `spacing` so a solid built from it
    has no clustered or skinny side faces. numpy only -- Blender's bundled
    Python has no scikit-image, and this is small enough not to need it.
    """
    half = (dims["caseDiameter"] + 2 * LUG_OVERHANG_MM) / 2 + GUARD_MM + 1.0
    n = int(round(2 * half / step)) + 1
    xs = np.linspace(-half, half, n)
    X, Y = np.meshgrid(xs, xs)
    sd = outline_sdf(X, Y, dims)
    inside = sd < 0
    idx = (inside[:-1, :-1] * 1 | inside[:-1, 1:] * 2 | inside[1:, 1:] * 4 | inside[1:, :-1] * 8)
    cells = np.argwhere((idx != 0) & (idx != 15))

    def point(e):
        kind, i, j = e
        if kind == "h":   # (i,j)-(i,j+1)
            a, b = sd[i, j], sd[i, j + 1]
            t = a / (a - b)
            return (xs[j] + t * (xs[j + 1] - xs[j]), xs[i])
        a, b = sd[i, j], sd[i + 1, j]
        t = a / (a - b)
        return (xs[j], xs[i] + t * (xs[i + 1] - xs[i]))

    adj = {}
    for i, j in cells:
        c = idx[i, j]
        b = [(c >> k) & 1 for k in range(4)]          # v0 BL, v1 BR, v2 TR, v3 TL
        edges = []
        if b[0] != b[1]: edges.append(("h", i, j))
        if b[1] != b[2]: edges.append(("v", i, j + 1))
        if b[3] != b[2]: edges.append(("h", i + 1, j))
        if b[0] != b[3]: edges.append(("v", i, j))
        pairs = [(edges[0], edges[1])] if len(edges) == 2 else [(edges[0], edges[3]), (edges[1], edges[2])]
        for a, bb in pairs:
            adj.setdefault(a, []).append(bb)
            adj.setdefault(bb, []).append(a)

    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while True:
            seen.add(cur)
            loop.append(point(cur))
            nxt = [e for e in adj[cur] if e != prev]
            if not nxt or nxt[0] == start:
                break
            prev, cur = cur, nxt[0]
        loops.append(loop)
    pts = np.array(max(loops, key=len))

    # CCW, starting at twelve o'clock.
    area = 0.5 * np.sum(pts[:, 0] * np.roll(pts[:, 1], -1) - np.roll(pts[:, 0], -1) * pts[:, 1])
    if area < 0:
        pts = pts[::-1]
    top = np.argmax(pts[:, 1] - 10 * np.abs(pts[:, 0]))
    pts = np.roll(pts, -top, axis=0)

    # Resample to even arc length.
    closed = np.vstack([pts, pts[:1]])
    seg = np.hypot(*np.diff(closed, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    m = int(s[-1] / spacing)
    t = np.linspace(0, s[-1], m, endpoint=False)
    return np.stack([np.interp(t, s, closed[:, 0]), np.interp(t, s, closed[:, 1])], axis=1)
