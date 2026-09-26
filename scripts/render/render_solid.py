# The 3D preview renderer. Moved out of the scripts/3d-test prototype in
# WS2b; jobs come from the render manifest (lib/render/, scripts/render/run.ts).
#
# Option A: the case as a real closed solid -- flanks, lug undersides,
# spring-bar holes, caseback -- plus a bezel with a coin edge, a plain
# insert, a knurled crown and a dial disc, each a separate object. Built
# from the same three catalog numbers as case_geometry.py, and measured
# back after the booleans and bevels have run.
#
# Option D: the same geometry with a surface treatment instead of clay:
# brushed tops, polished flanks and chamfers, black insert, the vendor's
# own dial photograph, lit by Blender's bundled CC0 studio HDRI.
#
#   blender -b --factory-startup --python-exit-code 1 --python scripts/render/render_solid.py -- <A|D> <top|34|hero> <out.png>
#
# Env: CASE_DIMS='{"caseDiameter":..,"lugWidth":..,"aperture":..}'

import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import case_geometry as geo  # noqa: E402
import render_guards  # noqa: E402

# Textures (prepared dial cut-outs, generated insert/ring/date prints) are
# made by the prototype scripts in scripts/3d-test and live in its gitignored
# out/. WS2c replaces baked textures with browser-side appearance.
TEX = os.environ.get("TEX_DIR", os.path.join(HERE, "..", "3d-test", "out"))

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
MODE = argv[0] if argv else "A"
VIEW = argv[1] if len(argv) > 1 else "34"
OUT = os.path.abspath(argv[2] if len(argv) > 2 else os.path.join(TEX, f"{MODE}-{VIEW}.png"))
# Per-build switches (all optional):
#   BUILD_TAG   picks dial-cut-<tag>, insert-<tag>, ring-<tag>, date-<tag> textures
#   HAND_COLOR  steel | gold          LUME  r,g,b (0-1)
#   CASE_FINISH steel | pvd
TAG = os.environ.get("BUILD_TAG")
def texf(stem, default):
    """Texture for a slot: <SLOT>_TAG, else BUILD_TAG, else the SKX default."""
    slot = {"dial-cut": "DIAL_TAG", "date": "DIAL_TAG", "insert": "INSERT_TAG", "ring": "RING_TAG"}[stem]
    t = os.environ.get(slot, TAG)
    if not t or t == "skx":
        return default
    return f"{stem}-{t}.png"
DIMS = json.loads(os.environ.get("CASE_DIMS", '{"caseDiameter": 42.5, "lugWidth": 22.0, "aperture": 28.5}'))

REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DIAL_PNG = os.path.join(REPO, "public", "assets", "dial", "ZDs4QjjlRw6lbypEnGaFV.webp")  # SKX Black Lume
HDRI = os.path.join(os.path.dirname(bpy.app.binary_path), f"{bpy.app.version[0]}.{bpy.app.version[1]}",
                    "datafiles", "studiolights", "world", "studio.exr")

# Heights, mm. NOT from the catalog -- read off SKX case photos, like the
# SVG's lug constants. Listed so the report can say exactly which is which.
Z_TOP = 9.0          # case top surface
LUG_UNDER = 3.2      # underside of the lugs
SEAT_DEPTH = 1.2
BORE_FLOOR = 5.2     # low enough for the day-date wheels under the dial
DIAL_Z = 6.4
BEZEL_TOP = 11.2
INSERT_POCKET = 0.3
CASEBACK = 1.6
CHAMFER = 0.45
HOLE_R = 0.55

R = DIMS["caseDiameter"] / 2
# OPEN QUESTION FOR THE OWNER (2026-09-23): the clamp below is a BUG FIX the
# production SVG has not had. lib/preview/art/parts.tsx CaseBody computes its
# bezel seat radius from m.insertOuter, which falls back to the modal 38mm when
# no insert is chosen -- whatever the case diameter. On the 37.8mm dimension set
# (36 approved cases) the seat comes out wider than the case and the top rim
# disappears. This prototype clamps the seat inside the case; production still
# draws it wrong. Fixing it changes production art, so it is left for the owner
# to decide. See docs/CHANGES-2026-09-23.md, "Known issues".
SEAT_R = min(geo.INSERT_OUTER_MM / 2 + 0.6, R - 1.0)
BORE_R = DIMS["aperture"] / 2 + 1.2
BEZEL_OUT = R - 1.1
BEZEL_IN = 31.8 / 2
INSERT_OUT = BEZEL_OUT - 1.15

T0 = time.perf_counter()
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# --- mesh helpers ----------------------------------------------------------
def link(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def prism(name, poly, z0, z1):
    """Closed extrusion of a CCW 2D polygon between z0 and z1."""
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in poly]
    top = [bm.verts.new((x, y, z1)) for x, y in poly]
    bm.faces.new(bot[::-1])
    bm.faces.new(top)
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.normal_update()
    return link(name, bm)


def circle(r, n=256, wave=None):
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    rr = r + (wave(a) if wave else 0)
    return np.stack([rr * np.cos(a), rr * np.sin(a)], axis=1)


def yz_prism(name, profile, x0, x1):
    """Extrude a CCW polygon drawn in the (y, z) plane along x."""
    ob = prism(name, profile, x0, x1)
    # Built as (y, z, x): rotate so local (u, v, w) -> world (y, z, x).
    # A cyclic permutation is a rotation, so the normals stay outward.
    me = ob.data
    for v in me.vertices:
        u, w, x = v.co
        v.co = (x, u, w)
    me.update()
    return ob


def apply_all(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def boolean(ob, cutter, op="DIFFERENCE"):
    m = ob.modifiers.new("b", "BOOLEAN")
    m.operation = op
    m.object = cutter
    m.solver = "EXACT"
    apply_all(ob)
    bpy.data.objects.remove(cutter)


def bevel(ob, width, segments=1, angle=35, clamp=False):
    m = ob.modifiers.new("bev", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    # Clamp-overlap measures against the 0.1mm outline edges and shrinks
    # the chamfer to nothing; every feature here is far wider than it.
    m.use_clamp_overlap = clamp
    apply_all(ob)


def smooth(ob, angle=30):
    """Smooth shading, split at any edge sharper than `angle`."""
    me = ob.data
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.set_sharp_from_angle(angle=math.radians(angle))


# --- case ------------------------------------------------------------------
from mathutils.geometry import delaunay_2d_cdt  # noqa: E402


def top_z(y):
    """Case top height: flat, then the lug tops curve down toward the tips."""
    t = np.clip(np.abs(y) - geo.LUG_DROP_START_MM, 0, 11.5)
    return Z_TOP - (geo.LUG_DROP_RADIUS_MM - np.sqrt(geo.LUG_DROP_RADIUS_MM ** 2 - t * t))


def build_case():
    """
    The case body as one explicit mesh -- no bevel modifier.

    A bevel run over boolean output shredded the lug tops and threw spikes,
    so the top is built directly instead:
      * outline P, and the same outline pushed CHAMFER inward along its own
        normal (Q), one-to-one, so the chamfer strip is clean quads;
      * the top surface inside Q is a constrained Delaunay triangulation
        with extra points where the lug tops curve, every vertex lifted to
        top_z(y) -- the drop depends on y alone, so that is exact;
      * seat and bore walls from circles; flank from P straight down.
    """
    P = geo.outline_polygon(DIMS)
    n = len(P)
    tng = np.roll(P, -1, axis=0) - np.roll(P, 1, axis=0)
    tng /= np.linalg.norm(tng, axis=1, keepdims=True)
    inward = np.stack([-tng[:, 1], tng[:, 0]], axis=1)     # CCW polygon
    Q = P + inward * CHAMFER

    S = circle(SEAT_R, 360)
    B = circle(BORE_R, 360)

    # Steiner points where the top curves, clear of the boundaries.
    g = np.arange(-30, 30, 0.35)
    GX, GY = np.meshgrid(g, g)
    G = np.stack([GX.ravel(), GY.ravel()], axis=1)
    G = G[np.abs(G[:, 1]) > geo.LUG_DROP_START_MM - 0.5]
    G = G[np.hypot(G[:, 0], G[:, 1]) > SEAT_R + 0.25]
    sdq = geo.polygon_sdf(G[:, 0], G[:, 1], [tuple(q) for q in Q])
    G = G[sdq < -0.2]

    verts2d = [tuple(v) for v in np.vstack([Q, S, G])]
    q_idx = list(range(n))
    s_idx = list(range(n, n + len(S)))
    edges = [(q_idx[i], q_idx[(i + 1) % n]) for i in range(n)] +             [(s_idx[i], s_idx[(i + 1) % len(S)]) for i in range(len(S))]
    out_v, _, out_f, *_ = delaunay_2d_cdt(verts2d, edges, [q_idx], 1, 1e-6)

    bm = bmesh.new()
    V = lambda x, y, z: bm.verts.new((float(x), float(y), float(z)))  # noqa: E731

    # Top surface, minus whatever the triangulation put inside the seat.
    tv = [V(x, y, top_z(y)) for x, y in out_v]
    for f in out_f:
        cx = sum(out_v[i][0] for i in f) / len(f)
        cy = sum(out_v[i][1] for i in f) / len(f)
        if math.hypot(cx, cy) > SEAT_R:
            bm.faces.new([tv[i] for i in f])

    def ring(pts, zfun):
        return [V(x, y, zfun(y)) for x, y in pts]

    def band(a, b):
        m = len(a)
        for i in range(m):
            j = (i + 1) % m
            bm.faces.new((a[i], a[j], b[j], b[i]))

    Pz0 = ring(P, lambda y: 0.0)
    Ptop = ring(P, lambda y: top_z(y) - CHAMFER)
    Qtop = ring(Q, top_z)
    band(Pz0, Ptop)                                   # flank
    band(Ptop, Qtop)                                  # 45-degree chamfer
    bm.faces.new(Pz0[::-1])                           # bottom

    Stop = ring(S, top_z)
    Sfl = ring(S, lambda y: Z_TOP - SEAT_DEPTH)
    Bfl = ring(B, lambda y: Z_TOP - SEAT_DEPTH)
    Bbot = ring(B, lambda y: BORE_FLOOR)
    band(Stop, Sfl)                                   # seat wall
    band(Sfl, Bfl)                                    # seat floor
    band(Bfl, Bbot)                                   # bore wall
    bm.faces.new(Bbot)                                # bore floor

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link("case", bm)


case = build_case()

# Lugs are thinner than the body: cut away everything outside the body
# circle below the lug underside.
under = prism("under", circle(40, 64), -5, LUG_UNDER)
boolean(under, prism("keep", circle(R + 0.02, 512), -6, LUG_UNDER + 1))
boolean(case, under)

# Spring-bar holes through each lug, at the centre of the tip radius.
tip_cy = (DIMS["caseDiameter"] + 2 * geo.LUG_OVERHANG_MM) / 2 - geo.LUG_TIP_MM / 2
for sy in (1, -1):
    hole = prism("hole", circle(HOLE_R, 32), -30, 30)
    for v in hole.data.vertices:
        x, y, z = v.co
        v.co = (z, y + sy * tip_cy, x + LUG_UNDER + 1.3)
    hole.data.update()
    boolean(case, hole)
smooth(case)

caseback = prism("caseback", circle(R - 1.2), -CASEBACK, 0.0)
bevel(caseback, 0.6, segments=3)
smooth(caseback)

# --- bezel: coin edge, 120 notches, insert pocket ----------------------------
coin = lambda a: -0.22 * (np.cos(a * 120) > 0.3)  # noqa: E731
bezel = prism("bezel", circle(BEZEL_OUT, 120 * 8, coin), Z_TOP, BEZEL_TOP)
boolean(bezel, prism("bin", circle(BEZEL_IN), Z_TOP - 1, BEZEL_TOP + 1))
boolean(bezel, prism("pocket", circle(INSERT_OUT), BEZEL_TOP - INSERT_POCKET, BEZEL_TOP + 1))
bevel(bezel, 0.2, segments=2)
smooth(bezel)

insert = prism("insert", circle(INSERT_OUT - 0.05), BEZEL_TOP - INSERT_POCKET, BEZEL_TOP - 0.1)
boolean(insert, prism("iin", circle(BEZEL_IN + 0.05), BEZEL_TOP - 2, BEZEL_TOP + 1))
smooth(insert)

# --- crown: knurled, at four o'clock, half hidden by the guard ----------------
knurl = lambda a: -0.18 * (np.cos(a * 40) > 0)  # noqa: E731
crown = prism("crown", circle(3.5, 40 * 8, knurl), 0, 3.0)
bevel(crown, 0.3, segments=3, angle=60, clamp=True)
stem = prism("stem", circle(1.4, 48), -1.6, 0.1)
for ob in (crown, stem):
    ob.rotation_euler = (0, math.pi / 2, 0)              # local +z -> world +x
    ob.location = (0, 0, 0)
d = math.radians(geo.CROWN_ANGLE)
for ob in (crown, stem):
    ob.rotation_euler = (0, math.pi / 2, math.pi / 2 - d)
    ob.location = (R * math.sin(d), R * math.cos(d), Z_TOP * 0.5)
    ob.location += Vector((math.sin(d), math.cos(d), 0)) * 0.3
smooth(crown, 40)

# --- dial --------------------------------------------------------------------
dial = prism("dial", circle(DIMS["aperture"] / 2, 256), DIAL_Z - 0.4, DIAL_Z)
uv = dial.data.uv_layers.new(name="uv")
for loop in dial.data.loops:
    x, y, _ = dial.data.vertices[loop.vertex_index].co
    # Prepared dial photos are 800px across the preview's 48.42mm frame.
    uv.data[loop.index].uv = (x / geo.FRAME_MM + 0.5, y / geo.FRAME_MM + 0.5)

# --- hands (D only): ported from lib/preview/art/hands.tsx ------------------
# Sword silhouette (the catalog's shapeTag for the SKX hand sets), widths
# measured off a vendor photo in the shading work, reach at the modal
# stated 8.5 / 12.5 / 12.5mm. Ten past ten, second hand at six -- the
# same arrangement the SVG preview draws.
HAND_MM = {"hour": 8.5, "minute": 12.5, "second": 12.5}
HD = {
    "hour": {"boss": 2.58, "shaft": 1.49, "tail": 1.13, "angle": 305, "z": 6.55},
    "minute": {"boss": 2.13, "shaft": 1.55, "tail": 1.03, "angle": 62, "z": 6.85},
}
SEC = {"shaft": 0.28, "disc": 1.39, "discAt": 7.7, "tail": 3.4, "tailDisc": 0.93, "angle": 180, "z": 7.15}
HAND_T = 0.15


def ccw(poly):
    poly = np.asarray(poly, dtype=float)
    a = 0.5 * np.sum(poly[:, 0] * np.roll(poly[:, 1], -1) - np.roll(poly[:, 0], -1) * poly[:, 1])
    return poly if a > 0 else poly[::-1]


def placed(name, poly, z0, z1, angle):
    """Prism of a local hand polygon (tip toward +y), turned clockwise by `angle`."""
    th = math.radians(angle)
    cs, sn = math.cos(th), math.sin(th)
    P = ccw(poly)
    P = np.stack([P[:, 0] * cs + P[:, 1] * sn, -P[:, 0] * sn + P[:, 1] * cs], axis=1)
    return prism(name, P, z0, z1)


def disc(r, cy, n=48):
    return circle(r, n) + np.array([0.0, cy])


hand_metal, hand_lume = [], []
if MODE == "D":
    for role, d in HD.items():
        r, w, t = HAND_MM[role], d["shaft"], d["tail"]
        sword = [(0, r), (w * 0.5, r * 0.74), (w * 0.62, r * 0.44), (w * 0.32, -t),
                 (-w * 0.32, -t), (-w * 0.62, r * 0.44), (-w * 0.5, r * 0.74)]
        z0, z1 = d["z"], d["z"] + HAND_T
        hand_metal.append(placed(role, sword, z0, z1, d["angle"]))
        hand_metal.append(placed(role + "_boss", disc(d["boss"] / 2, 0), z0, z1, d["angle"]))
        lw = w * 0.25
        hand_lume.append(placed(role + "_lume", [(-lw, d["boss"] * 0.3), (lw, d["boss"] * 0.3), (lw, r * 0.78), (-lw, r * 0.78)],
                                z1, z1 + 0.04, d["angle"]))
        hand_lume.append(placed(role + "_bl", disc(d["boss"] / 2 - 0.4, 0), z1, z1 + 0.04, d["angle"]))
    z0, z1 = SEC["z"], SEC["z"] + 0.1
    sw = SEC["shaft"] / 2
    hand_metal.append(placed("second", [(-sw, -SEC["tail"]), (sw, -SEC["tail"]), (sw, HAND_MM["second"]), (-sw, HAND_MM["second"])], z0, z1, SEC["angle"]))
    hand_metal.append(placed("sec_disc", disc(SEC["disc"] / 2, SEC["discAt"]), z0, z1, SEC["angle"]))
    hand_metal.append(placed("sec_tail", disc(SEC["tailDisc"] / 2, -SEC["tail"]), z0, z1, SEC["angle"]))
    hand_lume.append(placed("sec_lume", disc(SEC["disc"] / 2 - 0.16, SEC["discAt"]), z1, z1 + 0.04, SEC["angle"]))
    hand_metal.append(prism("cap", circle(1.0, 64), z1, z1 + 0.25))
    for ob in hand_metal:
        bevel(ob, 0.05, segments=1, angle=60, clamp=True)
    for ob in hand_metal + hand_lume:
        smooth(ob, 40)

    # Flat mineral crystal, seated just below the insert.
    CRYSTAL = os.environ.get("CRYSTAL", "none")      # none (chosen) | flat | dome
    if CRYSTAL == "dome":
        # Double-domed: both faces bowed by the same sag, so the thickness
        # stays 1.15mm and the edge distorts like a real domed sapphire.
        cr, sag, n_r, n_a = BEZEL_IN - 0.02, 0.9, 48, 256
        zt, zb = BEZEL_TOP - 0.25, BEZEL_TOP - 1.4
        bm = bmesh.new()
        def cap(z0, up):
            rows = [[bm.verts.new((0, 0, z0 + sag))]]
            for i in range(1, n_r + 1):
                r = cr * i / n_r
                z = z0 + sag * (1 - (r / cr) ** 2)
                rows.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for a in np.linspace(0, 2 * np.pi, n_a, endpoint=False)])
            for j in range(n_a):
                k = (j + 1) % n_a
                f = (rows[0][0], rows[1][j], rows[1][k])
                bm.faces.new(f if up else f[::-1])
                for i in range(1, n_r):
                    q = (rows[i][j], rows[i + 1][j], rows[i + 1][k], rows[i][k])
                    bm.faces.new(q if up else q[::-1])
            return rows[-1]
        top_edge, bot_edge = cap(zt, True), cap(zb, False)
        for j in range(n_a):
            k = (j + 1) % n_a
            bm.faces.new((bot_edge[j], bot_edge[k], top_edge[k], top_edge[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        crystal = link("crystal", bm)
        crystal.data.polygons.foreach_set("use_smooth", [True] * len(crystal.data.polygons))
    else:
        crystal = prism("crystal", circle(BEZEL_IN - 0.02, 256), BEZEL_TOP - 1.4, BEZEL_TOP - 0.25)
        bevel(crystal, 0.2, segments=2, angle=60, clamp=True)
        # Sharp at every bevel step. Smoothing the flat faces into the
        # bevel curved their normals across the whole face, turning a flat
        # crystal into a lens that bent the hands at any IOR above ~1.1.
        smooth(crystal, 10)

    # Insert print: generated texture spanning the stated 38mm outer diameter.
    iuv = insert.data.uv_layers.new(name="uv")
    for loop in insert.data.loops:
        x, y, _ = insert.data.vertices[loop.vertex_index].co
        iuv.data[loop.index].uv = (x / 38.0 + 0.5, y / 38.0 + 0.5)

# --- remaining visible parts (D only) -------------------------------------------
def frustum(name, r0, z0, r1, z1, n=256):
    """Angled ring: sloped face from (r0, z0) up to (r1, z1), outer wall down to z0."""
    bm = bmesh.new()
    a = np.linspace(0, 2 * np.pi, n, endpoint=False)
    ring_ = lambda r, z: [bm.verts.new((r * math.cos(t), r * math.sin(t), z)) for t in a]  # noqa: E731
    lo_in, hi_out, lo_out = ring_(r0, z0), ring_(r1, z1), ring_(r1, z0)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((lo_in[i], lo_in[j], hi_out[j], hi_out[i]))     # print face
        bm.faces.new((hi_out[i], hi_out[j], lo_out[j], lo_out[i]))   # outer wall
        bm.faces.new((lo_out[i], lo_out[j], lo_in[j], lo_in[i]))     # underside
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return link(name, bm)


def planar_uv(ob, span):
    uvl = ob.data.uv_layers.new(name="uv")
    for loop in ob.data.loops:
        x, y, _ = ob.data.vertices[loop.vertex_index].co
        uvl.data[loop.index].uv = (x / span + 0.5, y / span + 0.5)


def box(bm, cx, cy, cz, sx, sy, sz, rot_x=0.0):
    """Axis box (sizes in mm), rotated about x through its centre, into `bm`."""
    from mathutils import Matrix
    m = Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(rot_x, 4, "X") @ Matrix.Diagonal((sx, sy, sz, 1))
    bmesh.ops.create_cube(bm, size=1.0, matrix=m)


bracelet_brushed, bracelet_polished = [], []
if MODE == "D":
    # Chapter ring: modal stated 30.5 / 27.7mm, angled, overlapping the
    # dial edge by 0.4mm a side as the spec records.
    ring_ob = frustum("chapter_ring", 27.7 / 2, DIAL_Z + 0.01, 30.5 / 2, DIAL_Z + 1.3)
    planar_uv(ring_ob, 30.5)

    # Crystal gasket: closes the bare-steel gap between ring and bezel.
    gasket = prism("gasket", circle(BEZEL_IN + 0.05, 256), BEZEL_TOP - 1.5, BEZEL_TOP - 1.35)
    boolean(gasket, prism("gin", circle(30.5 / 2 - 0.1, 256), BEZEL_TOP - 3, BEZEL_TOP))

    # Day-date wheels: a printed plate under the cut-out window, in the
    # dial photo's own frame.
    date_ob = prism("date_wheels", circle(DIMS["aperture"] / 2 - 0.3, 128), DIAL_Z - 0.75, DIAL_Z - 0.7)
    planar_uv(date_ob, geo.FRAME_MM)

    # --- strap: STRAP = jubilee | oyster | mesh | rubber | leather | nato --------
    # One of each strap shapeTag the catalog carries (strap-jubilee,
    # strap-oyster, strap-bracelet, strap-band x2, strap-nato), on the same
    # 30mm wrist curve so the options compare like for like.
    STRAP = os.environ.get("STRAP", "jubilee")
    LW = DIMS["lugWidth"]
    tip = (DIMS["caseDiameter"] + 2 * geo.LUG_OVERHANG_MM) / 2 - geo.LUG_TIP_MM / 2
    bar_z = LUG_UNDER + 1.3
    WRIST = 30.0

    def end_link(sign):
        el = bmesh.new()
        box(el, 0, sign * (tip + 0.4), bar_z + 0.3, LW - 0.1, 5.4, 3.8)
        ob = link("end_link", el)
        boolean(ob, prism("hug", circle(R + 0.08, 256), -10, 20))
        bevel(ob, 0.35, segments=2, angle=30, clamp=True)
        smooth(ob, 35)
        return ob

    def link_rows(sign, pitch, rows, layout, y0):
        """layout: list of (stagger, x_centre, width, thick, lift, key)."""
        bms = {}
        for k in range(rows):
            for stagger, cx, w, t, lift, key in layout:
                s_ = (k + stagger) * pitch + pitch / 2
                phi = s_ / WRIST
                yy = sign * (y0 + WRIST * math.sin(phi))
                zz = bar_z + 0.2 + lift - WRIST * (1 - math.cos(phi))
                box(bms.setdefault(key, bmesh.new()), cx, yy, zz, w, pitch - 0.08, t, -sign * phi)
        return bms

    def band(name, sign, length, w0, w1, thick, round_r, y_start, crown=0.0, n_s=160, n_x=24):
        """
        A strap swept along the wrist arc. Cross-section: rounded rectangle,
        optionally crowned (padded leather). UVs are in millimetres --
        u across the width from the centre line, v along the strap -- so
        every texture below is authored at real scale.
        """
        bm = bmesh.new()
        uvs = []
        loops = []
        for i in range(n_s + 1):
            sv = length * i / n_s
            phi = sv / WRIST
            w = w0 + (w1 - w0) * (i / n_s)
            py = sign * (y_start + WRIST * math.sin(phi))
            pz = bar_z - WRIST * (1 - math.cos(phi))
            ny, nz = sign * math.sin(phi), math.cos(phi)       # section "up"
            pts = []
            for j in range(n_x + 1):                            # top, left to right
                x = -w / 2 + w * j / n_x
                e = min(x + w / 2, w / 2 - x)
                edge = 1.0 if e >= round_r else math.sqrt(max(0.0, 1 - ((round_r - e) / round_r) ** 2))
                pts.append((x, thick / 2 * edge + crown * (1 - (2 * x / w) ** 2)))
            for j in range(n_x, -1, -1):                        # bottom, back
                x = -w / 2 + w * j / n_x
                e = min(x + w / 2, w / 2 - x)
                edge = 1.0 if e >= round_r else math.sqrt(max(0.0, 1 - ((round_r - e) / round_r) ** 2))
                pts.append((x, -thick / 2 * edge))
            ring_ = []
            for x, h in pts:
                ring_.append(bm.verts.new((x, py + ny * h, pz + nz * h)))
                uvs.append((x, sv))
            loops.append(ring_)
        m = len(loops[0])
        for i in range(n_s):
            for j in range(m):
                k = (j + 1) % m
                bm.faces.new((loops[i][j], loops[i][k], loops[i + 1][k], loops[i + 1][j]))
        bm.faces.new(loops[0][::-1])
        bm.faces.new(loops[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = link(name, bm)
        uvl = ob.data.uv_layers.new(name="uv")
        # Vertices were created in the same order as `uvs`.
        for loop in ob.data.loops:
            uvl.data[loop.index].uv = uvs[loop.vertex_index]
        ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
        return ob

    strap_parts = []   # (object, material key)
    for sign in (1, -1):
        if STRAP in ("jubilee", "oyster", "mesh"):
            bracelet_brushed.append(end_link(sign))
        if STRAP == "jubilee":
            bms = link_rows(sign, 4.8, 11, [
                (0.0, LW / 2 - 2.8, 5.4, 2.8, 0.0, "outer"), (0.0, -(LW / 2 - 2.8), 5.4, 2.8, 0.0, "outer"),
                (0.5, -3.75, 3.5, 2.5, 0.15, "centre"), (0.5, 0.0, 3.5, 2.5, 0.15, "centre"), (0.5, 3.75, 3.5, 2.5, 0.15, "centre"),
            ], tip + 3.1)
            for key, bm_ in bms.items():
                ob = link(key + "_links", bm_)
                bevel(ob, 0.8 if key == "outer" else 1.1, segments=5, angle=30, clamp=True)
                smooth(ob, 35)
                (bracelet_brushed if key == "outer" else bracelet_polished).append(ob)
        elif STRAP == "oyster":
            # Three flat links a row, broad centre, no stagger.
            bms = link_rows(sign, 6.2, 9, [
                (0.0, LW / 2 - 3.0, 5.9, 2.9, 0.0, "outer"), (0.0, -(LW / 2 - 3.0), 5.9, 2.9, 0.0, "outer"),
                (0.0, 0.0, 9.6, 3.0, 0.1, "centre"),
            ], tip + 3.1)
            for key, bm_ in bms.items():
                ob = link(key + "_links", bm_)
                bevel(ob, 0.45, segments=3, angle=30, clamp=True)
                smooth(ob, 35)
                bracelet_brushed.append(ob)
        elif STRAP == "mesh":
            strap_parts.append((band("mesh", sign, 55, LW - 0.2, LW - 2, 2.2, 0.6, tip + 2.9), "mesh"))
        elif STRAP == "rubber":
            strap_parts.append((band("rubber", sign, 58, LW, LW - 2, 3.4, 1.2, tip - 0.4), "rubber"))
        elif STRAP == "leather":
            strap_parts.append((band("leather", sign, 58, LW, LW - 2, 3.0, 0.9, tip - 0.4, crown=0.5), "leather"))
        elif STRAP == "nato":
            strap_parts.append((band("nato", sign, 60, 20.0, 20.0, 1.2, 0.3, tip - 0.2), "nato"))
    if STRAP == "nato":
        # The run under the case, and the two drops down behind the bars.
        under = bmesh.new()
        box(under, 0, 0, -CASEBACK - 0.7, 20.0, 2 * tip + 1.6, 1.2)
        for sgn in (1, -1):
            box(under, 0, sgn * (tip + 0.3), (bar_z - CASEBACK - 1.3) / 2, 20.0, 1.2, bar_z + CASEBACK + 1.3)
        ob = link("nato_under", under)
        bevel(ob, 0.3, segments=2, angle=30, clamp=True)
        strap_parts.append((ob, "nato"))
        # Two steel keepers on the six o'clock side.
        for sv in (9.0, 15.5):
            phi = sv / WRIST
            yy = -(tip - 0.2 + WRIST * math.sin(phi))
            zz = bar_z - WRIST * (1 - math.cos(phi))
            kb = bmesh.new()
            box(kb, 0, yy, zz, 21.4, 3.2, 2.6, phi)
            keeper = link("keeper", kb)
            hole = bmesh.new()
            box(hole, 0, yy, zz, 20.2, 5.0, 1.4, phi)
            boolean(keeper, link("keeper_hole", hole))
            bevel(keeper, 0.25, segments=2, angle=30, clamp=True)
            smooth(keeper, 35)
            bracelet_polished.append(keeper)

T_MESH = time.perf_counter() - T0


# --- measure the solid, not the inputs ------------------------------------------
def extent(ob):
    co = np.array([v.co[:] for v in ob.data.vertices])
    return co


co = extent(case)
# The flanks are vertical, so the outline survives as the ring of
# vertices on the bottom face and on the lug undersides.
ring = lambda z: co[np.abs(co[:, 2] - z) < 0.005]  # noqa: E731
body = ring(0.0)
lugs = ring(LUG_UNDER)
# Straight inner face: past the root fillet, before the round tip cap.
tip_cy_ = (DIMS["caseDiameter"] + 2 * geo.LUG_OVERHANG_MM) / 2 - geo.LUG_TIP_MM / 2
tips = lugs[(np.abs(lugs[:, 1]) > tip_cy_ - 0.7) & (np.abs(lugs[:, 1]) < tip_cy_) & (np.abs(lugs[:, 0]) > 6)]
MEASURE = {
    "caseDiameter (x extent of body)": round(body[:, 0].max() - body[:, 0].min(), 3),
    "lugToLug (y extent of lugs)": round(lugs[:, 1].max() - lugs[:, 1].min(), 3),
    "lugWidth (inner faces, beyond body)": round(2 * np.abs(tips[:, 0]).min(), 3),
    "case faces": len(case.data.polygons),
}


# --- materials --------------------------------------------------------------------
def principled(name, color, metallic, rough, aniso=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    b.inputs["Anisotropic"].default_value = aniso
    return m, b


def brushed(name):
    """Brushed steel: anisotropic, with visible grain along 12-6."""
    m, b = principled(name, (0.62, 0.62, 0.62), 1.0, 0.22, 0.8)
    nt, N, L = m.node_tree, m.node_tree.nodes.new, m.node_tree.links.new
    tc = N("ShaderNodeTexCoord")
    tan = N("ShaderNodeTangent"); tan.direction_type = "RADIAL"; tan.axis = "X"
    L(tan.outputs["Tangent"], b.inputs["Tangent"])
    mp = N("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (7.0, 0.08, 7.0)
    L(tc.outputs["Object"], mp.inputs["Vector"])
    nz = N("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1.0; nz.inputs["Detail"].default_value = 6.0
    L(mp.outputs["Vector"], nz.inputs["Vector"])
    bp = N("ShaderNodeBump"); bp.inputs["Strength"].default_value = 0.12; bp.inputs["Distance"].default_value = 0.01
    L(nz.outputs["Fac"], bp.inputs["Height"])
    L(bp.outputs["Normal"], b.inputs["Normal"])
    return m


if MODE == "A":
    clay, _ = principled("clay", (0.55, 0.55, 0.55), 0.0, 0.55)
    for ob in (case, caseback, bezel, insert, crown, stem, dial):
        ob.data.materials.append(clay)
else:
    steel_b = brushed("brushed")
    # Finish classes, ordered by how much of the catalog they cover:
    # silver-tone/polished/brushed (steel), black (pvd), black+matte,
    # gold-tone, gold+rose. Base colour and roughness only -- same mesh.
    FINISHES = {
        "steel": None,
        "pvd": ((0.04, 0.04, 0.045), 0.34, (0.05, 0.05, 0.055), 0.20),
        "matte": ((0.055, 0.055, 0.06), 0.52, (0.06, 0.06, 0.065), 0.42),
        "gold": ((0.94, 0.72, 0.32), 0.30, (0.96, 0.76, 0.38), 0.10),
        "rose": ((0.92, 0.66, 0.53), 0.30, (0.95, 0.70, 0.58), 0.10),
    }
    FIN = FINISHES.get(os.environ.get("CASE_FINISH", "steel"))
    PVD = FIN is not None
    steel_p, _ = principled("polished", (0.66, 0.66, 0.66), 1.0, 0.07)
    if PVD:
        bc, br, pc, pr = FIN
        steel_b.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*bc, 1)
        steel_b.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = br
        steel_p.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*pc, 1)
        steel_p.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = pr
    black, _ = principled("insert", (0.015, 0.015, 0.017), 0.6, 0.32)
    case.data.materials.append(steel_b)
    case.data.materials.append(steel_p)
    # Brushed where the surface faces up (tops), polished everywhere else
    # (flanks, chamfers, lug sides) -- the SKX's finishing split.
    nz_ = np.array([p.normal.z for p in case.data.polygons])
    case.data.polygons.foreach_set("material_index", (nz_ < 0.9).astype(np.int32))
    for ob in (caseback, bezel, crown, stem):
        ob.data.materials.append(steel_p)
    # Printed insert: the generated SKX print, anodised black under it.
    im, ib = principled("insert_print", (1, 1, 1), 0.0, 0.3)
    itex = im.node_tree.nodes.new("ShaderNodeTexImage")
    itex.image = bpy.data.images.load(os.path.join(TEX, texf("insert", "insert-skx.png")))
    itex.extension = "CLIP"
    im.node_tree.links.new(itex.outputs["Color"], ib.inputs["Base Color"])
    ib.inputs["Coat Weight"].default_value = 0.3
    insert.data.materials.append(im)

    HAND_RGB = {
        "steel": (0.75, 0.75, 0.75), "gold": (0.95, 0.72, 0.40),
        "rose": (0.92, 0.66, 0.53), "black": (0.045, 0.045, 0.05),
    }
    hand_rgb = HAND_RGB.get(os.environ.get("HAND_COLOR", "steel"), HAND_RGB["steel"])
    hand_steel, _ = principled("hand_steel", hand_rgb, 1.0, 0.16 if os.environ.get("HAND_COLOR") == "black" else 0.08)
    lume_rgb = tuple(float(v) for v in os.environ.get("LUME", "0.86,0.85,0.78").split(","))
    lume_m, _ = principled("lume", lume_rgb, 0.0, 0.6)
    for ob in hand_metal:
        ob.data.materials.append(hand_steel)
    for ob in hand_lume:
        ob.data.materials.append(lume_m)

    # Glass that doesn't black out the dial: shadow rays pass straight
    # through (Cycles has no caustics by default, so real refractive glass
    # would cast a solid shadow). Reduced specular stands in for an AR coat.
    gm = bpy.data.materials.new("crystal")
    gm.use_nodes = True
    gnt = gm.node_tree
    gb = gnt.nodes["Principled BSDF"]
    gb.inputs["Transmission Weight"].default_value = 1.0
    gb.inputs["Roughness"].default_value = 0.0
    # IOR, not "Specular IOR Level", sets a glass BSDF's reflectance. 1.5
    # (real mineral glass) reflects ~4% and put the key light and softboxes
    # on the crystal as grey discs over the dial; 1.1 reflects ~0.2%, about
    # what an AR coating does. A flat 1.15mm slab barely bends light either
    # way, so the lower IOR costs nothing visible.
    gb.inputs["IOR"].default_value = float(os.environ.get("CRYSTAL_IOR", "1.1"))
    lp = gnt.nodes.new("ShaderNodeLightPath")
    tr_ = gnt.nodes.new("ShaderNodeBsdfTransparent")
    gmix = gnt.nodes.new("ShaderNodeMixShader")
    gnt.links.new(lp.outputs["Is Shadow Ray"], gmix.inputs["Fac"])
    gnt.links.new(gb.outputs["BSDF"], gmix.inputs[1])
    gnt.links.new(tr_.outputs["BSDF"], gmix.inputs[2])
    gnt.links.new(gmix.outputs["Shader"], gnt.nodes["Material Output"].inputs["Surface"])
    tint = os.environ.get("CRYSTAL_TINT")
    if tint:
        # AR-coated sapphire: the coating reflects a narrow band, so what
        # little it does reflect comes back blue-violet.
        gb.inputs["Specular Tint"].default_value = (*[float(v) for v in tint.split(",")], 1)
    crystal.data.materials.append(gm)



    def textured(name, path, rough):
        m, b = principled(name, (1, 1, 1), 0.0, rough)
        t_ = m.node_tree.nodes.new("ShaderNodeTexImage")
        t_.image = bpy.data.images.load(os.path.join(TEX, path))
        t_.extension = "CLIP"
        m.node_tree.links.new(t_.outputs["Color"], b.inputs["Base Color"])
        return m

    ring_ob.data.materials.append(textured("chapter_ring", texf("ring", "ring-skx.png"), 0.45))
    date_ob.data.materials.append(textured("date_wheels", texf("date", "date-skx.png"), 0.5))
    rubber, _ = principled("gasket", (0.02, 0.02, 0.02), 0.0, 0.7)
    gasket.data.materials.append(rubber)
    for ob in bracelet_brushed:
        ob.data.materials.append(steel_b)
    for ob in bracelet_polished:
        ob.data.materials.append(steel_p)

    def strap_material(key):
        m = bpy.data.materials.new(key)
        m.use_nodes = True
        nt = m.node_tree
        N, L = nt.nodes.new, nt.links.new
        b = nt.nodes["Principled BSDF"]
        uv = N("ShaderNodeUVMap"); uv.uv_map = "uv"
        sep = N("ShaderNodeSeparateXYZ"); L(uv.outputs["UV"], sep.inputs["Vector"])
        bump = N("ShaderNodeBump"); L(bump.outputs["Normal"], b.inputs["Normal"])
        rgb = tuple(float(v) for v in os.environ["STRAP_RGB"].split(",")) if os.environ.get("STRAP_RGB") else None
        if key == "rubber":
            # FKM tropic: rubber, a basket-weave of raised blocks.
            b.inputs["Base Color"].default_value = (*(rgb or (0.012, 0.012, 0.013)), 1)
            b.inputs["Roughness"].default_value = 0.62
            br = N("ShaderNodeTexBrick"); br.inputs["Scale"].default_value = 1.0
            br.inputs["Mortar Size"].default_value = 0.35
            br.inputs["Brick Width"].default_value = 2.4
            br.inputs["Row Height"].default_value = 1.2
            # A hard 0/1 mortar mask gives the bump node one-pixel edges and
            # nothing else; smoothed mortar gives the grooves a real slope.
            br.inputs["Mortar Smooth"].default_value = 0.7
            L(uv.outputs["UV"], br.inputs["Vector"])
            L(br.outputs["Fac"], bump.inputs["Height"])
            bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.4
        elif key == "leather":
            # Brown leather: pebble grain plus a stitch line near each edge.
            b.inputs["Roughness"].default_value = 0.55
            vor = N("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 2.2
            L(uv.outputs["UV"], vor.inputs["Vector"])
            L(vor.outputs["Distance"], bump.inputs["Height"]); bump.inputs["Strength"].default_value = 0.6; bump.inputs["Distance"].default_value = 0.1
            ax = N("ShaderNodeMath"); ax.operation = "ABSOLUTE"; L(sep.outputs["X"], ax.inputs[0])
            off = N("ShaderNodeMath"); off.operation = "SUBTRACT"; off.inputs[1].default_value = LW / 2 - 1.5
            L(ax.outputs["Value"], off.inputs[0])
            aoff = N("ShaderNodeMath"); aoff.operation = "ABSOLUTE"; L(off.outputs["Value"], aoff.inputs[0])
            line = N("ShaderNodeMath"); line.operation = "LESS_THAN"; line.inputs[1].default_value = 0.18
            L(aoff.outputs["Value"], line.inputs[0])
            dash = N("ShaderNodeMath"); dash.operation = "PINGPONG"; dash.inputs[1].default_value = 0.9
            L(sep.outputs["Y"], dash.inputs[0])
            dsh = N("ShaderNodeMath"); dsh.operation = "GREATER_THAN"; dsh.inputs[1].default_value = 0.3
            L(dash.outputs["Value"], dsh.inputs[0])
            st = N("ShaderNodeMath"); st.operation = "MULTIPLY"
            L(line.outputs["Value"], st.inputs[0]); L(dsh.outputs["Value"], st.inputs[1])
            mix = N("ShaderNodeMix"); mix.data_type = "RGBA"
            mix.inputs["A"].default_value = (*(rgb or (0.20, 0.095, 0.045)), 1)
            mix.inputs["B"].default_value = (0.78, 0.70, 0.55, 1)
            L(st.outputs["Value"], mix.inputs["Factor"]); L(mix.outputs["Result"], b.inputs["Base Color"])
        elif key == "nato":
            # "Bond" seatbelt NATO: black with two grey stripes, woven.
            b.inputs["Roughness"].default_value = 0.7
            ax = N("ShaderNodeMath"); ax.operation = "ABSOLUTE"; L(sep.outputs["X"], ax.inputs[0])
            ramp = N("ShaderNodeValToRGB")
            cr = ramp.color_ramp; cr.interpolation = "CONSTANT"
            cr.elements[0].position = 0.0; cr.elements[0].color = (0.02, 0.02, 0.022, 1)
            cr.elements[1].position = 0.29; cr.elements[1].color = (0.20, 0.21, 0.22, 1)
            cr.elements.new(0.5).color = (0.02, 0.02, 0.022, 1)
            cr.elements.new(0.71).color = (0.20, 0.21, 0.22, 1)
            cr.elements.new(0.86).color = (0.02, 0.02, 0.022, 1)
            sc = N("ShaderNodeMath"); sc.operation = "DIVIDE"; sc.inputs[1].default_value = 10.0
            L(ax.outputs["Value"], sc.inputs[0]); L(sc.outputs["Value"], ramp.inputs["Fac"])
            L(ramp.outputs["Color"], b.inputs["Base Color"])
            wv = N("ShaderNodeTexWave"); wv.inputs["Scale"].default_value = 1.8; wv.bands_direction = "Y"
            L(uv.outputs["UV"], wv.inputs["Vector"])
            L(wv.outputs["Fac"], bump.inputs["Height"]); bump.inputs["Strength"].default_value = 0.35
        elif key == "mesh":
            # Milanese: fine steel weave, two crossed diagonal waves.
            b.inputs["Base Color"].default_value = (0.62, 0.62, 0.62, 1)
            b.inputs["Metallic"].default_value = 1.0
            b.inputs["Roughness"].default_value = 0.28
            w1 = N("ShaderNodeTexWave"); w1.wave_type = "BANDS"; w1.bands_direction = "DIAGONAL"; w1.inputs["Scale"].default_value = 1.1
            w2 = N("ShaderNodeTexWave"); w2.wave_type = "BANDS"; w2.bands_direction = "DIAGONAL"; w2.inputs["Scale"].default_value = 1.1
            flip = N("ShaderNodeMapping"); flip.inputs["Scale"].default_value = (-1, 1, 1)
            L(uv.outputs["UV"], w1.inputs["Vector"]); L(uv.outputs["UV"], flip.inputs["Vector"])
            L(flip.outputs["Vector"], w2.inputs["Vector"])
            mul = N("ShaderNodeMath"); mul.operation = "MULTIPLY"
            L(w1.outputs["Fac"], mul.inputs[0]); L(w2.outputs["Fac"], mul.inputs[1])
            # Real Milanese weave is ~0.3mm, below a pixel at this distance --
            # drawn at ~0.9mm so it reads at all. An exaggeration, labelled.
            L(mul.outputs["Value"], bump.inputs["Height"])
            bump.inputs["Strength"].default_value = 1.0; bump.inputs["Distance"].default_value = 0.25
        return m

    _strap_mats = {}
    for ob, key in strap_parts:
        if key not in _strap_mats:
            _strap_mats[key] = strap_material(key)
        ob.data.materials.append(_strap_mats[key])
    # Low specular: the dial is the vendor's photograph and should keep
    # its own colours, not take on a sheen from the environment.
    dm, db = principled("dial", (1, 1, 1), 0.0, 0.6)
    db.inputs["Specular IOR Level"].default_value = 0.15
    tex = dm.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(TEX, texf("dial-cut", "dial-cut.png")))
    tex.extension = "CLIP"
    dm.node_tree.links.new(tex.outputs["Color"], db.inputs["Base Color"])
    dm.node_tree.links.new(tex.outputs["Alpha"], db.inputs["Alpha"])
    dial.data.materials.append(dm)

# --- light: bundled CC0 studio HDRI + one soft key, top-left -----------------------
world = bpy.data.worlds.new("w")
world.use_nodes = True
wn, wl = world.node_tree.nodes, world.node_tree.links
env = wn.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(HDRI)
wmap = wn.new("ShaderNodeMapping")
wmap.inputs["Rotation"].default_value = (0, 0, math.radians(135))
wtc = wn.new("ShaderNodeTexCoord")
wl.new(wtc.outputs["Generated"], wmap.inputs["Vector"])
wl.new(wmap.outputs["Vector"], env.inputs["Vector"])
# TENT: add a flat white surround on top of the studio HDRI -- the light
# tent vendors shoot cases in. Metal is only as bright as what it reflects.
tent = float(os.environ.get("TENT", "0"))
add = wn.new("ShaderNodeMix"); add.data_type = "RGBA"; add.blend_type = "ADD"
add.inputs["Factor"].default_value = 1.0
# Bright above the horizon, dark floor below it: vertical polished
# faces then pick up a light-to-dark band, which is what makes a flank
# read as a curved mirror instead of a flat grey card.
sep = wn.new("ShaderNodeSeparateXYZ")
wl.new(wtc.outputs["Generated"], sep.inputs["Vector"])
hz = wn.new("ShaderNodeMapRange")
hz.inputs["From Min"].default_value = -0.15
hz.inputs["From Max"].default_value = 0.45
hz.inputs["To Min"].default_value = float(os.environ.get("FLOOR", "0.3")) * tent
hz.inputs["To Max"].default_value = tent
wl.new(sep.outputs["Z"], hz.inputs["Value"])
wl.new(hz.outputs["Result"], add.inputs["B"])
wl.new(env.outputs["Color"], add.inputs["A"])
wl.new(add.outputs["Result"], wn["Background"].inputs["Color"])
wn["Background"].inputs["Strength"].default_value = 0.8 if MODE == "D" else 0.6
scene.world = world

key = bpy.data.lights.new("key", "AREA")
key.shape = "DISK"
key.size = 60
key.energy = 5.0e4 if MODE == "D" else 3.0e4
ko = bpy.data.objects.new("key", key)
az, el, dist = math.radians(315), math.radians(55), 90
ko.location = (dist * math.cos(el) * math.sin(az), dist * math.cos(el) * math.cos(az), dist * math.sin(el))
scene.collection.objects.link(ko)
target = bpy.data.objects.new("target", None)
target.location = (0, 0, Z_TOP * 0.6)
scene.collection.objects.link(target)
tr = ko.constraints.new("TRACK_TO"); tr.target = target; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"

# Crystal presentation extras -- need the key light and target to exist.
if MODE == "D":
    if os.environ.get("KEY_ON_CRYSTAL", "1") == "0":
        # Light linking: the key still lights every metal part, but the
        # crystal never sees it -- no hot disc over the dial.
        rc = bpy.data.collections.new("key_receivers")
        rc.objects.link(crystal)
        ko.light_linking.receiver_collection = rc
        rc.collection_objects[0].light_linking.link_state = "EXCLUDE"

    if os.environ.get("CRYSTAL", "none") == "none":
        crystal.hide_render = True

    if os.environ.get("STREAK"):
        # Photographer's strip softbox: a long thin card, visible only in
        # reflections, placed on the mirror bounce of the 3/4 camera.
        card = bpy.data.meshes.new("card")
        cbm = bmesh.new()
        bmesh.ops.create_grid(cbm, x_segments=1, y_segments=1, size=1.0)
        cbm.to_mesh(card); cbm.free()
        co_card = bpy.data.objects.new("streak", card)
        scene.collection.objects.link(co_card)
        co_card.scale = (46, 5, 1)
        a_, e_, d_ = math.radians(330), math.radians(38), 140
        co_card.location = (d_ * math.cos(e_) * math.sin(a_), d_ * math.cos(e_) * math.cos(a_), d_ * math.sin(e_))
        tt = co_card.constraints.new("TRACK_TO"); tt.target = target; tt.track_axis = "TRACK_Z"; tt.up_axis = "UP_Y"
        em = bpy.data.materials.new("streak")
        em.use_nodes = True
        en = em.node_tree.nodes
        en.remove(en["Principled BSDF"])
        emi = en.new("ShaderNodeEmission")
        # Soft falloff across the short side: a real strip box fades at its
        # edges; a hard-edged card reflects as a sticker on the glass.
        tcc = en.new("ShaderNodeTexCoord")
        sxyz = en.new("ShaderNodeSeparateXYZ")
        em.node_tree.links.new(tcc.outputs["Generated"], sxyz.inputs["Vector"])
        tri = en.new("ShaderNodeMath"); tri.operation = "PINGPONG"; tri.inputs[1].default_value = 0.5
        em.node_tree.links.new(sxyz.outputs["Y"], tri.inputs[0])
        pw = en.new("ShaderNodeMath"); pw.operation = "POWER"; pw.inputs[1].default_value = 2.5
        em.node_tree.links.new(tri.outputs["Value"], pw.inputs[0])
        mul = en.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = float(os.environ.get("STREAK")) * 16
        em.node_tree.links.new(pw.outputs["Value"], mul.inputs[0])
        em.node_tree.links.new(mul.outputs["Value"], emi.inputs["Strength"])
        em.node_tree.links.new(emi.outputs["Emission"], en["Material Output"].inputs["Surface"])
        card.materials.append(em)
        co_card.visible_camera = False
        co_card.visible_diffuse = False
        co_card.visible_shadow = False


# --- camera ---------------------------------------------------------------------------
cam = bpy.data.cameras.new("cam")
co_ = bpy.data.objects.new("cam", cam)
scene.collection.objects.link(co_)
scene.camera = co_
if VIEW in ("top", "topw"):
    cam.type = "ORTHO"
    # "topw" pulls back to show the bracelet; "top" is the preview's frame.
    cam.ortho_scale = geo.FRAME_MM if VIEW == "top" else 100
    co_.location = (0, 0, 80)
    size = geo.CANVAS_PX if VIEW == "top" else 1200
else:
    # Three-quarter, from the crown side and slightly below twelve-six --
    # the angle vendors shoot cases at.
    cam.lens = 100
    caz, cel, cdist = math.radians(150), math.radians(38), {"34": 165, "hero": 225}.get(VIEW, 300)
    co_.location = (cdist * math.cos(cel) * math.sin(caz), cdist * math.cos(cel) * math.cos(caz), cdist * math.sin(cel))
    ct = co_.constraints.new("TRACK_TO"); ct.target = target; ct.track_axis = "TRACK_NEGATIVE_Z"; ct.up_axis = "UP_Y"
    size = 1600 if VIEW == "hero" else 1200
cam.clip_start, cam.clip_end = 1, 1000

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
# 256 spp + OIDN: chosen by the WS2a side-by-side (REPORT.md), replacing
# 768-1024 spp with no denoise. Closer to a 4096 spp ground truth than 768 on
# every layer, in about 60% of the render time.
scene.cycles.samples = int(os.environ.get("SAMPLES", "256"))
# SAMPLES is a ceiling: adaptive sampling stops each pixel once its noise is
# under ADAPTIVE (Blender's default 0.01, which every layer so far used).
# ADAPTIVE=0 renders every pixel to SAMPLES -- the WS2a ground truth.
_adaptive = float(os.environ.get("ADAPTIVE", "0.01"))
scene.cycles.use_adaptive_sampling = _adaptive > 0
if _adaptive > 0:
    scene.cycles.adaptive_threshold = _adaptive
# DENOISE=on (default) | off | rgb. OIDN guides itself with albedo and
# normal passes taken at the FIRST surface hit -- behind a crystal that is
# flat glass, so it treats the dial's print as noise and smooths it away.
# render_guards refuses denoising with a crystal (use DENOISE=off
# SAMPLES=2048 for crystal renders) and on any data pass.
# "rgb" drops the guides; "off" relies on samples.
render_guards.denoise_config(scene, os.environ.get("DENOISE", "on"),
                             os.environ.get("CRYSTAL", "none") if MODE == "D" else "none")
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.film_transparent = True
scene.view_settings.view_transform = "AgX"
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = OUT

# --- LAYER: render one slot on its own, for browser-side compositing -------------
# Each layer keeps only its own part. Anything that can sit IN FRONT of it
# and whose geometry never changes between options (case group, insert,
# chapter ring) becomes a holdout, so the layer's alpha already has those
# pixels cut away -- the browser can then stack layers in a fixed order
# without any depth information. The hands layer keeps the dial as a
# shadow catcher, so its shadow travels with it onto whichever dial is
# underneath.
LAYER = os.environ.get("LAYER")
if LAYER:
    CASE_G = {"case", "caseback", "bezel", "crown", "stem", "gasket"}
    HAND_G = {"hour", "hour_boss", "hour_lume", "hour_bl", "minute", "minute_boss", "minute_lume",
              "minute_bl", "second", "sec_disc", "sec_tail", "sec_lume", "cap"}

    def category(ob):
        base = ob.name.split(".")[0]
        if base in CASE_G:
            return "case"
        if base in HAND_G:
            return "hands"
        if base in ("dial", "date_wheels"):
            return "dial"
        if base == "chapter_ring":
            return "ring"
        if base == "insert":
            return "insert"
        if base in ("crystal", "streak"):
            return "none"
        return "strap"

    # "casestrap" renders the case group and the strap in ONE layer, so the
    # two light each other properly: the strap's shadow on the lugs, the
    # strap reflected in the case, the case reflected in a steel bracelet.
    # The cost is multiplicative but only inside the pair (finishes x straps).
    LAYER_PARTS = {"casestrap": {"case", "strap"}}.get(LAYER, {LAYER})
    HOLD = {
        "casestrap": set(),
        "case": set(),
        "dial": {"case", "insert", "ring"},
        "ring": {"case", "insert"},
        "hands": {"case", "insert", "ring"},
        "insert": {"case"},
        "strap": {"case"},
    }[LAYER]
    for ob in list(scene.objects):
        if ob.type != "MESH":
            continue
        cat = category(ob)
        if cat in LAYER_PARTS:
            continue
        if cat in HOLD:
            ob.is_holdout = True
            if LAYER == "hands":
                # The dial layer already carries the case's shadow; the
                # shadow catcher must record only what the hands add.
                ob.visible_shadow = False
                ob.visible_diffuse = False
                ob.visible_glossy = False
                ob.visible_transmission = False
        elif LAYER == "hands" and cat == "dial":
            ob.is_shadow_catcher = True
        else:
            ob.hide_render = True

render_guards.assert_data_passes_not_denoised(scene)
T1 = time.perf_counter()
bpy.ops.render.render(write_still=True)
print("RESULT " + json.dumps({"out": OUT, "mesh_s": round(T_MESH, 1), "render_s": round(time.perf_counter() - T1, 1), "measure": MEASURE}))

if os.environ.get("EXPORT_GLB"):
    # The shadow-ray trick is a Cycles node graph glTF can't carry; give the
    # crystal a plain transmissive material so web viewers see glass, not a
    # grey lid over the dial.
    if MODE == "D":
        plain = bpy.data.materials.new("crystal")
        plain.use_nodes = True
        pb = plain.node_tree.nodes["Principled BSDF"]
        pb.inputs["Transmission Weight"].default_value = 1.0
        pb.inputs["Roughness"].default_value = 0.0
        pb.inputs["IOR"].default_value = 1.5
        crystal.data.materials.clear()
        crystal.data.materials.append(plain)
    bpy.ops.export_scene.gltf(filepath=OUT.replace(".png", ".glb"), export_apply=True)
