// URL <-> Build serialisation. The URL is the state store (00-PROJECT.md:
// "State lives in the URL, not a client store... Do not add Zustand or
// Redux"), which is what makes every build shareable and the back button
// correct without extra work.
//
// Pure and DOM-free so the round-trip can be tested directly -- pass
// measure 5 is "copy the URL, open in a new tab, get the identical build",
// which is exactly a round-trip property.
import { z } from "zod";
import type { Build, CatalogSlice, SlotKey } from "@/lib/compat";

// Short, stable query keys. `insert` and `chapter` are deliberately
// shorter than their slot names -- these end up in shared links.
export const SLOT_PARAM: Record<SlotKey, string> = {
  movement: "movement",
  case: "case",
  dial: "dial",
  hands: "hands",
  bezelInsert: "insert",
  bezel: "bezel",
  crystal: "crystal",
  chapterRing: "chapter",
  crown: "crown",
  strap: "strap",
};

// Spec: "Parse and validate with Zod." Part ids are nanoids; anything that
// isn't a plausible id is rejected before it's used as a lookup key. A
// query string is external input like any feed payload.
const PartIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export function readSlotParam(params: URLSearchParams, param: string): string | null {
  const raw = params.get(param);
  if (raw === null) return null;
  const parsed = PartIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function buildFromParams(params: URLSearchParams, known: CatalogSlice["parts"]): Build {
  const parts: Build["parts"] = {};
  for (const [slot, param] of Object.entries(SLOT_PARAM) as [SlotKey, string][]) {
    const id = readSlotParam(params, param);
    // Object.hasOwn, not truthiness: a bare `known[id]` lookup accepts
    // inherited keys, so "__proto__" resolved to Object.prototype, passed
    // the truthy check, and put a bogus part id into the build. Caught by
    // the round-trip test.
    if (id && Object.hasOwn(known, id)) parts[slot] = id;
  }
  return { parts };
}

export function paramsFromBuild(build: Build): string {
  const p = new URLSearchParams();
  for (const [slot, id] of Object.entries(build.parts) as [SlotKey, string | undefined][]) {
    if (id) p.set(SLOT_PARAM[slot], id);
  }
  return p.toString();
}

// Slots present in the URL that couldn't be resolved -- either malformed
// or pointing at a part no longer in the catalog. Shown as a notice so a
// stale shared link degrades visibly rather than silently.
export function droppedSlots(params: URLSearchParams, known: CatalogSlice["parts"]): SlotKey[] {
  const dropped: SlotKey[] = [];
  for (const [slot, param] of Object.entries(SLOT_PARAM) as [SlotKey, string][]) {
    if (params.get(param) === null) continue;
    const id = readSlotParam(params, param);
    if (!id || !Object.hasOwn(known, id)) dropped.push(slot);
  }
  return dropped;
}
