import type { Build, CatalogSlice, ToolKey } from "./types";
import { getPart } from "./types";

// Per specs/03-phase-2-compat-engine.md: "Cutting dial feet implies a dial
// feet cutter and dial dots. Fitting hands implies a hand press and hand
// removal levers. Opening the case implies a case back opener and a
// movement holder." Plus a baseline set for any build at all.
//
// Each operation is derived from what's actually IN the build, not
// guessed at -- a dial-dots requirement only fires when the selected
// dial's own hasFeet attribute says false (real evidence, see
// scripts/backfill-attributes.ts's parseDialComplication), not for every
// build regardless of dial.

export interface ToolCostRange {
  minGbp: number;
  maxGbp: number;
}

// Rough, real-world aftermarket tool pricing (GBP), not vendor-specific --
// these are commodity tools available from many sellers, unlike the parts
// catalog itself.
const TOOL_COST_RANGES: Record<ToolKey, ToolCostRange> = {
  blower: { minGbp: 3, maxGbp: 10 },
  gloves: { minGbp: 3, maxGbp: 8 },
  "dust-cover": { minGbp: 5, maxGbp: 15 },
  "dial-feet-cutter": { minGbp: 8, maxGbp: 20 },
  "dial-dots": { minGbp: 3, maxGbp: 8 },
  "hand-press": { minGbp: 10, maxGbp: 30 },
  "hand-removal-levers": { minGbp: 5, maxGbp: 15 },
  "case-back-opener": { minGbp: 8, maxGbp: 25 },
  "movement-holder": { minGbp: 5, maxGbp: 15 },
  "spring-bar-tool": { minGbp: 3, maxGbp: 10 },
  "bezel-insert-tool": { minGbp: 5, maxGbp: 12 },
};

export function getToolCostRange(tool: ToolKey): ToolCostRange {
  return TOOL_COST_RANGES[tool];
}

export function deriveTools(build: Build, catalog: CatalogSlice): ToolKey[] {
  const tools = new Set<ToolKey>(["blower", "gloves", "dust-cover"]);

  const movement = getPart(build, catalog, "movement");
  const caseP = getPart(build, catalog, "case");
  const dial = getPart(build, catalog, "dial");
  const hands = getPart(build, catalog, "hands");
  const bezelInsert = getPart(build, catalog, "bezelInsert");
  const strap = getPart(build, catalog, "strap");

  if (movement && caseP) {
    tools.add("case-back-opener");
    tools.add("movement-holder");
  }
  if (hands) {
    tools.add("hand-press");
    tools.add("hand-removal-levers");
  }
  if (dial && dial.attributes.hasFeet === false) {
    tools.add("dial-dots");
  }
  if (bezelInsert) {
    tools.add("bezel-insert-tool");
  }
  if (strap) {
    tools.add("spring-bar-tool");
  }

  return [...tools];
}
