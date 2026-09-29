// Render manifest (WS2b): the set of render jobs a catalog needs.
//
// Pure apart from hashing. Input is a list of parts -- the whole catalog or
// one tenant's scope -- and the renderer version; output is every job
// (layer x case shape x view x pass) with a content hash. The same geometry
// hashes the same whichever catalog asked for it, so tenants share outputs
// and a rerun with nothing changed renders nothing.
//
// Why every layer carries a case key: each layer holds out the case group
// (scripts/3d-test/REPORT.md, "Scaling caveat"), so its alpha is cut for one
// case shape. Jobs multiply by case shapes; they add across parts.

import { createHash } from "node:crypto";
import { geometryKey, shapeKey, type RenderPart, type Renderable } from "./shape-keys";

export const VIEWS = ["hero", "top"] as const;

/**
 * Layers whose look is a print the browser applies (WS2c): rendered once as
 * geometry-only passes ("surface": UV, light, bounce, base), so a new dial,
 * insert or ring print costs no render. The rest are finished images
 * ("beauty"), whose look is the geometry and its finish.
 */
export const SURFACE_LAYERS = new Set(["dial", "date", "ring", "insert"]);
export const passFor = (layer: string) => (SURFACE_LAYERS.has(layer) ? "surface" : "beauty");

/** Layers the renderer draws for every case shape, besides straps. The date wheel shares the dial's key. */
const PER_CASE: { layer: string; slot: Renderable["slot"] }[] = [
  { layer: "case", slot: "case" },
  { layer: "date", slot: "dial" },
  { layer: "dial", slot: "dial" },
  { layer: "ring", slot: "ring" },
  { layer: "hands", slot: "hands" },
  { layer: "insert", slot: "insert" },
];

export interface RenderJob {
  /** `<view>/<pass>/<layer>/<caseKey>[/<partKey>]` -- stable and readable. */
  id: string;
  layer: string;
  view: string;
  pass: string;
  caseKey: string;
  partKey?: string;
  env: Record<string, string>;
  /** sha256 of everything that decides the pixels; the output file name. */
  hash: string;
}

export interface PartEntry {
  key: string;
  approximated: boolean;
  actualShape?: string;
}

export interface Manifest {
  rendererVersion: string;
  jobs: RenderJob[];
  parts: Record<string, PartEntry>;
  notRenderable: Record<string, string>;
  /** Distinct shape keys per render slot, across the scope. */
  keysPerSlot: Record<string, string[]>;
}

export { geometryKey };
const withoutFinish = ({ CASE_FINISH: _f, CASE_CROWN: _c, CASE_GUARD: _g, ...env }: Record<string, string>) => env;

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

export function buildManifest(parts: RenderPart[], rendererVersion: string): Manifest {
  const partsOut: Record<string, PartEntry> = {};
  const notRenderable: Record<string, string> = {};
  const bySlot = new Map<string, Map<string, Renderable>>();
  for (const p of parts) {
    const k = shapeKey(p);
    if (!k.ok) {
      notRenderable[p.id] = k.reason;
      continue;
    }
    partsOut[p.id] = k.actualShape ? { key: k.key, approximated: true, actualShape: k.actualShape } : { key: k.key, approximated: false };
    const slot = k.key.startsWith("crown:") ? "crown" : k.slot;
    if (!bySlot.has(slot)) bySlot.set(slot, new Map());
    bySlot.get(slot)!.set(k.key, k);
  }

  const keysOf = (slot: string) => [...(bySlot.get(slot)?.values() ?? [])].sort((a, b) => a.key.localeCompare(b.key));
  const jobs: RenderJob[] = [];
  const add = (layer: string, view: string, pass: string, c: Renderable, part?: Renderable) => {
    const env = { LAYER: layer, ...c.env, ...(part?.env ?? {}) };
    const decides = { layer, view, pass, caseKey: c.key, partKey: part?.key, env, rendererVersion };
    jobs.push({
      id: [view, pass, layer, c.key, part?.key].filter(Boolean).join("/"),
      layer,
      view,
      pass,
      caseKey: c.key,
      ...(part ? { partKey: part.key } : {}),
      env,
      hash: hash(decides),
    });
  };

  // A case key is geometry + crown variant + finish (`/c3#gold`). Layers
  // that only hold the case out depend on its geometry, so they're keyed by
  // that and shared across variants and finishes; the case itself and the
  // case+strap pair carry both.
  const cases = keysOf("case");
  const geometry = [...new Map(cases.map((c) => [geometryKey(c.key), { ...c, key: geometryKey(c.key), env: withoutFinish(c.env) }])).values()];
  for (const view of VIEWS) {
    for (const c of cases) {
      add("case", view, "beauty", c);
      // Case and strap in one layer so they light each other; the junction
      // barely shows from straight above, so hero only.
      if (view === "hero") for (const s of keysOf("strap")) add("casestrap", view, "beauty", c, s);
    }
    for (const g of geometry) {
      for (const { layer, slot } of PER_CASE) {
        if (slot === "case") continue;
        for (const part of keysOf(slot)) add(layer, view, passFor(layer), g, part);
      }
      for (const s of keysOf("strap")) add("strap", view, "beauty", g, s);
    }
  }

  const keysPerSlot: Record<string, string[]> = {};
  for (const slot of [...bySlot.keys()].sort()) keysPerSlot[slot] = keysOf(slot).map((k) => k.key);
  return { rendererVersion, jobs, parts: partsOut, notRenderable, keysPerSlot };
}
