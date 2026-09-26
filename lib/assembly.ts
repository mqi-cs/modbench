// Assembly plan (WS3): how to put a build together, as structured data.
//
// Pure function of the build. The same object renders as a beginner's
// checklist on the public site and, later, as a shop's work order (WS7), so
// it carries no presentation -- just ordered steps, tools, cost and risk.
//
// Tools come from lib/compat/tools.ts, the one place tools are derived; a
// step only names tools that deriveTools also returns (tested).

import { deriveTools, getToolCostRange } from "./compat/tools";
import { getPart, type Build, type CatalogSlice, type SlotKey, type ToolKey } from "./compat/types";

export interface AssemblyStep {
  id: string;
  title: string;
  detail: string;
  slots: SlotKey[];
  tools: ToolKey[];
  /** Can't be undone: say so before the step, not after. */
  irreversible: boolean;
}

export interface AssemblyPlan {
  steps: AssemblyStep[];
  tools: ToolKey[];
  toolCostGbp: { min: number; max: number };
  /** Parts, shipping and tools, when the caller passes its totals (minor units, GBP). */
  totalMinor?: { low: number; high: number };
  /** 1 (straightforward) to 5 (hard for a first build). */
  difficulty: number;
  difficultyReasons: string[];
}

export interface PlanTotals {
  grandTotalMinorLow: number;
  grandTotalMinorHigh: number;
}

export function assemblyPlan(build: Build, catalog: CatalogSlice, totals?: PlanTotals): AssemblyPlan {
  const has = (slot: SlotKey) => Boolean(getPart(build, catalog, slot));
  const dial = getPart(build, catalog, "dial");
  const steps: AssemblyStep[] = [];
  const reasons: string[] = [];
  let hard = 0;
  const step = (s: Omit<AssemblyStep, "irreversible"> & { irreversible?: boolean }) => steps.push({ irreversible: false, ...s });

  step({
    id: "workspace",
    title: "Set up a clean workspace",
    detail: "Gloves on, dust cover ready, blower to hand. Dust under a crystal is the most common first-build flaw.",
    slots: [],
    tools: ["blower", "gloves", "dust-cover"],
  });

  if (has("movement") && dial) {
    const noFeet = dial.attributes.hasFeet === false;
    step({
      id: "dial",
      title: "Fit the dial to the movement",
      detail: noFeet
        ? "This dial has no feet: fix it to the movement with dial dots, centred on the pinion."
        : "Seat the dial's feet in the movement's holes and check it sits flat.",
      slots: ["movement", "dial"],
      tools: noFeet ? ["dial-dots"] : [],
    });
    if (noFeet) {
      hard += 1;
      reasons.push("dial fixed with dots");
    }
  }

  if (has("movement") && has("hands")) {
    step({
      id: "hands",
      title: "Press the hands on",
      detail: "Hour hand first, then minute, then seconds, with every hand pointing at 12. Press straight down; a bent pinion can't be fixed at home.",
      slots: ["hands", "movement"],
      tools: ["hand-press", "hand-removal-levers"],
    });
    hard += 2;
    reasons.push("hands");
  }

  if (has("case") && has("crystal")) {
    step({
      id: "crystal",
      title: "Press the crystal into the case",
      detail: "With its gasket, square to the case, before the movement goes in.",
      slots: ["crystal", "case"],
      tools: ["crystal-press"],
    });
    hard += 1;
    reasons.push("crystal pressed in");
  }

  if (has("case") && has("chapterRing")) {
    step({
      id: "chapter-ring",
      title: "Seat the chapter ring",
      detail: "Drop it into the case and line its 12 up with the crown at 3 before the movement goes in.",
      slots: ["chapterRing", "case"],
      tools: [],
    });
    hard += 1;
    reasons.push("chapter ring alignment");
  }

  if (has("movement") && has("case")) {
    step({
      id: "case-movement",
      title: "Put the movement in the case",
      detail: "Press the stem release and pull the stem, lower the movement in on its holder, then refit the stem until it clicks.",
      slots: ["movement", "case"],
      tools: ["movement-holder"],
    });
    // No listing states a stem length (crown-stem-length), so every build
    // that puts a movement in a case may need this, and it can't be undone.
    step({
      id: "stem",
      title: "Check the stem length; cut only if the crown won't close",
      detail: "Screw the crown down. If it stands proud, take the stem out, cut a little at a time and test again. A stem cut too short can't be lengthened.",
      slots: ["movement", "case", ...(has("crown") ? (["crown"] as SlotKey[]) : [])],
      tools: [],
      irreversible: true,
    });
    hard += 1;
    reasons.push("stem may need cutting");
    step({
      id: "caseback",
      title: "Close the caseback",
      detail: "Check the gasket is seated, then tighten the caseback evenly.",
      slots: ["case"],
      tools: ["case-back-opener"],
    });
  }

  if (has("bezelInsert")) {
    step({
      id: "insert",
      title: "Fit the bezel insert",
      detail: "Clean the bezel, line up the insert's marker, press it down evenly.",
      slots: ["bezelInsert", "case"],
      tools: ["bezel-insert-tool"],
    });
  }

  if (has("strap")) {
    step({
      id: "strap",
      title: "Fit the strap",
      detail: "Compress each spring bar and let it snap into the lug holes; tug to check both ends.",
      slots: ["strap", "case"],
      tools: ["spring-bar-tool"],
    });
  }

  const tools = deriveTools(build, catalog);
  const cost = tools.map(getToolCostRange).reduce((a, r) => ({ min: a.min + r.minGbp, max: a.max + r.maxGbp }), { min: 0, max: 0 });
  return {
    steps,
    tools,
    toolCostGbp: cost,
    ...(totals ? { totalMinor: { low: totals.grandTotalMinorLow, high: totals.grandTotalMinorHigh } } : {}),
    difficulty: Math.min(5, 1 + hard),
    difficultyReasons: reasons,
  };
}
