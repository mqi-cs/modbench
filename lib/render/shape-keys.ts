// Shape keys for the 3D render pipeline (WS2b).
//
// A shape key names the GEOMETRY the renderer builds for a part, and nothing
// else. Two parts with the same key render to the same pixels, whoever sells
// them, so outputs are shared across vendors and tenants. Appearance -- dial
// print, insert print, colour, finish -- is not in the key; WS2c applies it
// in the browser.
//
// Pure: no database, no filesystem. Every approved part gets either a key or
// an explicit reason it can't be rendered.
//
// The key holds only what scripts/render/render_solid.py actually consumes.
// Today that is the case's three stated millimetres and the strap's build;
// every other part is one modelled shape, sized from the case. Where a part's
// own shape isn't modelled it takes the nearest one that is and is marked
// `approximated`, and the preview must label it so (owner's decision,
// 2026-09-26). Adding geometry to the renderer means adding keys here.

import { caseDimensions } from "../preview/dimensions";

export interface RenderPart {
  id: string;
  category: string;
  family: string;
  name: string;
  attributes: Record<string, unknown>;
}

/** The slot's own layer in the renderer (`LAYER=`), or the layer it is drawn in. */
export type RenderSlot = "case" | "dial" | "ring" | "hands" | "insert" | "strap";

export interface Renderable {
  ok: true;
  slot: RenderSlot;
  /** e.g. `case:round/42.5/22/28.5`, `strap:jubilee`, `hands:sword`. */
  key: string;
  /** Environment the renderer takes for this geometry. */
  env: Record<string, string>;
  /** The part's own shape isn't modelled; `key` is the nearest one that is. */
  approximated: boolean;
  /** The part's own shape, when it differs from what is rendered. */
  actualShape?: string;
}

export interface NotRenderable {
  ok: false;
  reason: string;
}

export type ShapeKey = Renderable | NotRenderable;

/**
 * Case families whose outline is the round SKX-style one the generator
 * builds (owner's decision, 2026-09-26). Turtle (cushion), VK63/64
 * (chronograph pushers) and Namoki N4 need their own outline -- a paid setup
 * job in the plan, not an approximation.
 */
export const ROUND_CASE_FAMILIES = new Set(["skx007-case", "skx013-case", "srpe-case", "alpinist-style-case"]);

const no = (reason: string): NotRenderable => ({ ok: false, reason });
const yes = (slot: RenderSlot, key: string, env: Record<string, string>, actualShape?: string): Renderable =>
  actualShape ? { ok: true, slot, key, env, approximated: true, actualShape } : { ok: true, slot, key, env, approximated: false };

/** The one modelled shape per slot, and the catalog shapeTag it is exact for. */
const MODELLED = {
  hands: { key: "hands:sword", exact: "hand-sword" },
  ring: { key: "ring:angled", exact: "ring-angled" },
  crown: { key: "crown:knurled", exact: "crown-knurled" },
} as const;

function strapKey(p: RenderPart): ShapeKey {
  const shape = p.attributes.shapeTag;
  const build = (s: string, exact: boolean) =>
    yes("strap", `strap:${s}`, { STRAP: s }, exact ? undefined : String(shape));
  switch (shape) {
    case "strap-jubilee":
      return build("jubilee", true);
    case "strap-oyster":
      return build("oyster", true);
    case "strap-nato":
      return build("nato", true);
    case "strap-bracelet":
      // The renderer's third bracelet is a Milanese mesh.
      return build("mesh", /\bmesh\b|\bmilanese\b/i.test(p.name));
    case "strap-band":
      // Leather and rubber are different builds (crowned band with stitching
      // vs flat block tread); the catalog has no tag for which, so the
      // vendor's own name decides, and anything else is approximated.
      if (/\bleather\b|\bsuede\b|\bcordovan\b/i.test(p.name)) return build("leather", true);
      return build("rubber", /\brubber\b|\bfkm\b|\bsilicone\b|\btropic\b|\bwaffle\b/i.test(p.name));
    default:
      return no(`strap with no shapeTag (${String(shape)})`);
  }
}

export function shapeKey(p: RenderPart): ShapeKey {
  const tag = typeof p.attributes.shapeTag === "string" ? p.attributes.shapeTag : undefined;
  switch (p.category) {
    case "case": {
      if (!ROUND_CASE_FAMILIES.has(p.family)) return no(`case family ${p.family} needs its own outline; the generator draws round SKX-style cases only`);
      const d = caseDimensions(p.attributes);
      const missing = (["caseDiameter", "lugWidth", "aperture"] as const).filter((k) => d[k] === undefined);
      if (missing.length) return no(`case states no ${missing.join(", ")}`);
      const dims = { caseDiameter: d.caseDiameter, lugWidth: d.lugWidth, aperture: d.aperture };
      return yes("case", `case:round/${dims.caseDiameter}/${dims.lugWidth}/${dims.aperture}`, { CASE_DIMS: JSON.stringify(dims) });
    }
    case "dial":
      // The dial disc is cut to the case's aperture; the print is appearance.
      return yes("dial", "dial:disc", {});
    case "bezel_insert":
      // A flat annulus sized from the case's bezel (outer = case diameter
      // - 4.5mm). A sloped profile isn't modelled.
      return yes("insert", "insert:flat", {}, p.attributes.profile === "slope" ? "insert-slope" : undefined);
    case "chapter_ring":
      return yes("ring", MODELLED.ring.key, {}, tag === MODELLED.ring.exact ? undefined : (tag ?? "ring-unknown"));
    case "hands":
      return yes("hands", MODELLED.hands.key, {}, tag === MODELLED.hands.exact ? undefined : (tag ?? "hand-unknown"));
    case "crown":
      // Drawn in the case layer, so it doesn't add a layer of its own.
      return yes("case", MODELLED.crown.key, {}, tag === MODELLED.crown.exact ? undefined : (tag ?? "crown-unknown"));
    case "strap":
      return strapKey(p);
    case "bezel":
      return no("drawn with the case: the renderer builds the bezel from the case diameter");
    case "crystal":
      return no("no crystal in the preview (removed; WS2a denoiser check assumes none)");
    case "movement":
      return no("hidden inside the case");
    default:
      return no(`category ${p.category} has no render slot`);
  }
}
