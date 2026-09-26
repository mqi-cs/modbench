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
import { shapeKey, type RenderPart, type Renderable } from "./shape-keys";

export const VIEWS = ["hero", "top"] as const;
/** Beauty only until WS2c adds the UV / shading / highlight passes. */
export const PASSES = ["beauty"] as const;

/** Layers the renderer draws for every case shape, besides straps. */
const PER_CASE: { layer: string; slot: Renderable["slot"] }[] = [
  { layer: "case", slot: "case" },
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

  for (const c of keysOf("case")) {
    for (const view of VIEWS) {
      for (const pass of PASSES) {
        for (const { layer, slot } of PER_CASE) {
          // The case layer is the case itself; the rest only if the scope has that slot.
          if (slot === "case") add(layer, view, pass, c);
          else for (const part of keysOf(slot)) add(layer, view, pass, c, part);
        }
        for (const s of keysOf("strap")) {
          add("strap", view, pass, c, s);
          // Case and strap in one layer so they light each other; the junction
          // barely shows from straight above, so hero only.
          if (view === "hero") add("casestrap", view, pass, c, s);
        }
      }
    }
  }

  const keysPerSlot: Record<string, string[]> = {};
  for (const slot of [...bySlot.keys()].sort()) keysPerSlot[slot] = keysOf(slot).map((k) => k.key);
  return { rendererVersion, jobs, parts: partsOut, notRenderable, keysPerSlot };
}
