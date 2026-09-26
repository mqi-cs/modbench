// First-build mode (WS3): a short route to a complete watch for someone who
// has never built one. About five choices -- style, case, dial, hands,
// strap -- with the movement filled in, and the engine run on every step:
// an option is offered only if the build so far plus that part has zero
// errors. Target, set before building (owner, 2026-09-26): at most 6 parts.
//
// Pure. Style ranks the options, never filters them, so no style can leave a
// step empty. Kit preferences (crystal pre-installed, sold as a kit) wait
// for WS3 step 1's data (08-DEFERRED D13a).

import { evaluateBuild, familyPlatform } from "./compat";
import { listingsFor, type Build, type CatalogSlice, type SlotKey } from "./compat/types";

export const FIRST_BUILD_MAX_PARTS = 6;

export interface FirstBuildStyle {
  id: string;
  label: string;
  /** Style tags (lib/style-vocabulary.ts) that rank dial and hands options. */
  tags: string[];
}

export const FIRST_BUILD_STYLES: FirstBuildStyle[] = [
  { id: "diver", label: "Diver", tags: ["tool-watch", "dive-bezel", "lumed"] },
  { id: "dress", label: "Dress", tags: ["dressy", "enamel", "sunburst"] },
  { id: "field", label: "Field or pilot", tags: ["pilot", "arabic-numerals", "tool-watch"] },
  { id: "any", label: "No preference", tags: [] },
];

/**
 * Order of the steps. The movement is picked for the user, after the dial,
 * so the engine can match it to the dial's day and date windows.
 */
export const FIRST_BUILD_STEPS: { slot: SlotKey; auto: boolean; label: string }[] = [
  { slot: "case", auto: false, label: "Case" },
  { slot: "dial", auto: false, label: "Dial" },
  { slot: "movement", auto: true, label: "Movement" },
  { slot: "hands", auto: false, label: "Hands" },
  { slot: "strap", auto: false, label: "Strap" },
];

export interface FirstBuildOption {
  partId: string;
  name: string;
  priceMinorBase: number;
  warnings: number;
  /** Bracelet made for this case's platform. */
  matchedBracelet?: boolean;
}

const tagsOf = (a: Record<string, unknown>) => (Array.isArray(a.styleTags) ? (a.styleTags as string[]) : []);

/**
 * Case-slot parts that are components, not a case you can build in. The
 * engine doesn't reject them (no rule says a caseback isn't a case), so a
 * caseback in the case slot evaluates clean; shared with lib/suggest.ts.
 */
export const CASE_COMPONENT = /caseback|case back|gasket|tube|bezel|insert|ring|spacer/i;

/**
 * Movements a first build is offered: the three-hand automatics every
 * starter build uses. A VK6x chronograph is a complete movement the engine
 * accepts, but it needs subdial dials and chronograph hands -- not a first
 * build.
 */
export const FIRST_BUILD_CALIBERS = new Set(["NH35", "NH36"]);

/** A hand cap, or a single seconds/GMT hand sold on its own -- not a set. */
export function isHandComponent(name: string): boolean {
  return /\bcap\b/i.test(name) || (/\b(seconds?|gmt) hand\b(?!s)/i.test(name) && !name.includes("+"));
}

/**
 * Dials and hands for another movement: GMT (the NH34's fourth hand) or
 * chronograph (VK6x subdials). First builds use NH35/NH36, and the engine
 * doesn't flag GMT or chronograph hands on them (08-DEFERRED D13c).
 */
const forOtherMovement = (name: string, attributes: Record<string, unknown>) =>
  attributes.gmt === true || attributes.hasSubdials === true || /\bgmt\b|\bnh34\b|\bchrono|\bvk\d*\b/i.test(name);

function eligible(slot: SlotKey, name: string, attributes: Record<string, unknown>): boolean {
  if (slot === "case") return !CASE_COMPONENT.test(name);
  if (slot === "hands") return !isHandComponent(name) && !forOtherMovement(name, attributes);
  if (slot === "dial") return !forOtherMovement(name, attributes);
  if (slot === "movement") {
    // Standard variants only. The "@ 4H crown" / 3.8 variants are for
    // particular cases, and the catalog can't say which case wants one:
    // every SKX007-family case carries the family's 3.8 crown position,
    // including cases named "3 O'clock" (08-DEFERRED D13b).
    return typeof attributes.caliber === "string" && FIRST_BUILD_CALIBERS.has(attributes.caliber) && attributes.crownPosition === undefined;
  }
  return true;
}

/** Options for one step: in stock, zero errors with the build so far, best first. */
export function firstBuildOptions(slot: SlotKey, build: Build, catalog: CatalogSlice, style: FirstBuildStyle, limit = 6): FirstBuildOption[] {
  const casePart = build.parts.case ? catalog.parts[build.parts.case] : undefined;
  const casePlatform = casePart ? familyPlatform(casePart.family) : null;
  const scored: (FirstBuildOption & { score: number })[] = [];
  for (const part of Object.values(catalog.parts)) {
    if (part.slot !== slot || !eligible(slot, part.name, part.attributes)) continue;
    const inStock = listingsFor(catalog, part.id).filter((l) => l.inStock);
    if (inStock.length === 0) continue;
    const r = evaluateBuild({ parts: { ...build.parts, [slot]: part.id } }, catalog);
    if (r.findings.some((f) => f.severity === "error")) continue;
    const matchedBracelet = slot === "strap" && casePlatform !== null && part.family !== "generic-strap" && familyPlatform(part.family) === casePlatform;
    scored.push({
      partId: part.id,
      name: part.name,
      priceMinorBase: Math.min(...inStock.map((l) => l.priceMinorBase)),
      warnings: r.findings.filter((f) => f.severity === "warning").length,
      ...(slot === "strap" ? { matchedBracelet } : {}),
      score: (matchedBracelet ? 10 : 0) + tagsOf(part.attributes).filter((t) => style.tags.includes(t)).length,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.warnings - b.warnings || a.priceMinorBase - b.priceMinorBase);
  return scored.slice(0, limit).map(({ score: _score, ...o }) => o);
}

/** Walks the steps taking the top option each time: the default suggestion for a style. */
export function suggestFirstBuild(catalog: CatalogSlice, style: FirstBuildStyle): Build {
  const build: Build = { parts: {} };
  for (const { slot } of FIRST_BUILD_STEPS) {
    const top = firstBuildOptions(slot, build, catalog, style, 1)[0];
    if (top) build.parts[slot] = top.partId;
  }
  return build;
}
