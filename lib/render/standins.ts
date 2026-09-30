// Stand-ins for the 3D preview (WS2c follow-up, 2026-09-28). Pure.
//
// Every layer drawn over the dial, ring and insert was rendered with those
// parts held out, so leaving one out leaves a hole (and the dial's rim keeps
// the ring's shadow). The preview therefore always draws all three: the
// chosen part, the case's own built-in ring, or a stand-in. Stand-ins live
// only in the render layer -- never in a Build, never seen by the engine.
//
// A stand-in is not a suggestion. Its shape is the modal shape key per slot
// in the render index (scene.test.ts checks this), never picked by
// price, vendor or popularity; its look is one flat clay colour, unlike any
// generated print, and every one is labelled.

/** Flat clay, no print: #A89880. The generic steel insert averages (150, 154, 157). */
export const STANDIN_PRINT = "/render/prints/standin-clay.webp";

/** The modal shape key per printed slot (the only one each has today). */
export const STANDIN_KEYS = { dial: "dial:disc", ring: "ring:angled", insert: "insert:flat" } as const;

/** Every stand-in's label ends with this. */
export const PLACEHOLDER = "placeholder shape, not part of this build";

/** Generic print for a ring built into the case (the case's own photo isn't usable). */
export const INTEGRATED_RING_PRINT = "/render/prints/ring-black-white.webp";

export type RingStatus = "integrated" | "required" | "unstated";

/** What the case's vendor says about a chapter ring; see requires-chapter-ring and chapter-ring-unstated. */
export function ringStatus(caseAttributes: Record<string, unknown> | undefined): RingStatus {
  if (caseAttributes?.integratedChapterRing === true) return "integrated";
  if (caseAttributes?.requiresChapterRing === true) return "required";
  return "unstated";
}
