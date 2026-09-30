// Build -> 3D preview layer stack and labels (WS2c). Pure.
//
// Geometry comes from the render index (one render per shape); prints come
// from `prints` (a vendor photo or a generated texture), applied in the
// browser. So a new dial needs no render: the same surface job, another print.
//
// Every scene carries labels for what isn't the real product (non-negotiable
// "label what isn't real"): which prints are generated, which shapes are
// approximated, and that metal finishes aren't shown.

import type { Layer } from "./compositor";
import { PLACEHOLDER, STANDIN_KEYS, STANDIN_PRINT, ringStatus, type RingStatus } from "./standins";
import { geometryKey } from "./shape-keys";

export interface RenderIndex {
  order: string[];
  pair: { layer: string; replaces: string[]; views: string[] };
  jobs: Record<string, { stem: string; pass: "beauty" | "surface" }>;
  parts: Record<string, { key: string; approximated: boolean; actualShape?: string }>;
  notRenderable: Record<string, string>;
}

export interface Print {
  src: string;
  /** True for a texture Modbench made, not the vendor's photo. Required: an unlabelled print can't be built. */
  generated: boolean;
}

export interface SceneInput {
  index: RenderIndex;
  view: "hero" | "top";
  /** slot -> part id, as in a Build. */
  parts: Partial<Record<string, string>>;
  prints: Partial<Record<"dial" | "date" | "ring" | "insert", Print>>;
  /** The case's catalog attributes: its chapter ring (standins.ts ringStatus) and whether its bezel is built in. */
  caseAttributes?: Record<string, unknown>;
}

/**
 * Case shapes checked by eye in 3D: SKX 42.5 and 43.8 mm (WS2c), and 36,
 * 37.8, 38 and 39.5 mm since renderer revision 5 fixed their insert
 * (08-DEFERRED D12f). A shape rendered since falls back to the diagram
 * until it has been checked.
 */
export const CHECKED_CASE_SHAPES: ReadonlySet<string> = new Set(
  ["36/20", "37.8/20", "38/20", "39.5/20", "42.5/22", "43.8/22"].map((s) => `case:round/${s}/28.5`),
);

export type Scene = { ok: true; layers: Layer[]; labels: string[] } | { ok: false; reason: string };

const SLOT_OF_LAYER: Record<string, string> = { dial: "dial", date: "dial", ring: "chapterRing", insert: "bezelInsert", hands: "hands", strap: "strap" };
const NAMES: Record<string, string> = { dial: "Dial", date: "Date wheel", ring: "Chapter ring", insert: "Insert", hands: "Hands", strap: "Strap", crown: "Crown", bezel: "Bezel", crystal: "Crystal" };

const RING_WHY: Record<RingStatus, string> = {
  integrated: "part of the case (built-in rehaut)",
  required: "not chosen yet",
  unstated: "none chosen, and the case's vendor doesn't say whether it needs one",
};

export function resolveScene({ index, view, parts, prints, caseAttributes }: SceneInput): Scene {
  const caseId = parts.case;
  if (!caseId) return { ok: false, reason: "no case chosen" };
  const caseEntry = index.parts[caseId];
  if (!caseEntry) return { ok: false, reason: index.notRenderable[caseId] ?? "case not in the render index" };
  const geo = geometryKey(caseEntry.key);
  if (!CHECKED_CASE_SHAPES.has(geo)) return { ok: false, reason: "this case size isn't checked in 3D yet" };
  if (caseAttributes?.integratedBezel === true) return { ok: false, reason: "this case's bezel is built in, and its shape isn't modelled in 3D" };
  // Square, octagonal, shrouded (Tuna) and cushion (Turtle) cases, named in
  // the vendor's title: the renderer draws one round SKX outline.
  if (typeof caseAttributes?.outline === "string") return { ok: false, reason: `this case's ${caseAttributes.outline} shape isn't modelled in 3D` };
  const ring = ringStatus(caseAttributes);
  const keyOf = (slot: string) => (parts[slot] ? index.parts[parts[slot]!]?.key : undefined);
  const strapKey = keyOf("strap");
  const paired = Boolean(strapKey) && index.pair.views.includes(view);

  const layers: Layer[] = [];
  const labels = ["Shape from the case's stated dimensions"];
  const need = (id: string) => index.jobs[id] ?? null;

  // The case (and the case+strap pair) carry the finish and crown variant;
  // everything else is keyed by the case's geometry alone.
  const caseJob = paired ? need(`${view}/beauty/casestrap/${caseEntry.key}/${strapKey}`) : need(`${view}/beauty/case/${caseEntry.key}`);
  if (!caseJob) return { ok: false, reason: "case not rendered yet" };

  for (const layer of index.order) {
    if (layer === "case") {
      // Rendered with the inner parts held out: seams add, not overlap.
      layers.push({ kind: "beauty", src: `${caseJob.stem}.png`, blend: "disjoint" });
      continue;
    }
    if (layer === "strap" && paired) continue;
    const slot = SLOT_OF_LAYER[layer];
    if (!slot) continue;
    const partKey = keyOf(slot);
    if (!partKey && layer in STANDIN_KEYS) {
      // Dial, ring and insert are always drawn: the case layer holds them out
      // and the dial was lit with the ring. Without a drawable chosen part:
      // the case's own ring, or a labelled stand-in (standins.ts).
      const l = layer as keyof typeof STANDIN_KEYS;
      const job = need(`${view}/surface/${l}/${geo}/${STANDIN_KEYS[l]}`);
      if (!job) return { ok: false, reason: `${l} not rendered yet` };
      const own = l === "ring" && !parts.chapterRing && ring === "integrated" && prints.ring;
      layers.push({ kind: "surface", stem: job.stem, print: own ? prints.ring!.src : STANDIN_PRINT });
      const why = parts[slot] ? "the chosen part can't be previewed" : l === "ring" ? RING_WHY[ring] : "not chosen yet";
      labels.push(`${NAMES[l]}: ${why} · ${own ? "generic print generated by Modbench, not this case's own design" : PLACEHOLDER}`);
      continue;
    }
    // Not chosen or not drawable: hands and strap are left out (labelled
    // below); the date wheel only shows through a real dial's window.
    if (!partKey) continue;
    const job = need(`${view}/${layer === "date" || layer === "dial" || layer === "ring" || layer === "insert" ? "surface" : "beauty"}/${layer}/${geo}/${partKey}`);
    if (!job) return { ok: false, reason: `${layer} not rendered yet` };
    if (job.pass === "surface") {
      const print = prints[layer as keyof SceneInput["prints"]];
      if (!print) {
        if (layer === "dial") return { ok: false, reason: "no dial photo" };
        continue;
      }
      layers.push({ kind: "surface", stem: job.stem, print: print.src });
      labels.push(`${NAMES[layer]}: ${print.generated ? "generic print generated by Modbench, not this part's own design" : "print from vendor photo"}`);
    } else {
      // A separate strap holds out the case; polished hands mix with the dial in linear light.
      const blend = layer === "strap" ? "disjoint" : layer === "hands" ? "linear" : undefined;
      layers.push({ kind: "beauty", src: `${job.stem}.png`, ...(blend ? { blend } : {}) });
    }
  }
  if (paired) labels.push("Strap: shape only, colour not shown");

  for (const [slot, id] of Object.entries(parts)) {
    if (!id) continue;
    const e = index.parts[id];
    const name = NAMES[Object.keys(SLOT_OF_LAYER).find((l) => SLOT_OF_LAYER[l] === slot) ?? slot] ?? slot;
    if (e?.approximated) labels.push(`${name} shape approximated: ${e.actualShape} drawn as ${e.key.split(":")[1]!.split("#")[0]}`);
    // Any chosen part the index doesn't know -- a recorded reason, a part
    // added since the last render run, a submitted (byo_) part -- isn't in
    // the picture (a dial, ring or insert shows as a stand-in), so it must be
    // named. The movement sits hidden.
    if (!e && slot !== "case" && slot !== "movement") labels.push(`${name} not previewed: ${index.notRenderable[id] ?? "not in the render index"}`);
  }
  return { ok: true, layers, labels };
}
