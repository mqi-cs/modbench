import type { Build, CatalogSlice, SlotKey } from "./compat";
import { evaluateBuild } from "./compat";
import type { ParsedIntent } from "./intent";
import { tagLabel } from "./style-vocabulary";
import { CASE_COMPONENT } from "./first-build";

// Deterministic candidate assembly.
//
// specs/07-phase-6-nl-image-input.md: "Your own code queries the catalog
// against the parsed constraints and assembles 2-3 candidate builds.
// Every candidate runs through evaluateBuild. Anything blocked is
// discarded, never shown." The model parses and explains; it never picks
// a part and never judges fitment.

export interface CandidatePart {
  slot: SlotKey;
  partId: string;
  name: string;
  priceMinorBase: number;
  /** Vocabulary tags this part matched from the query. */
  matched: string[];
}

export interface Candidate {
  parts: Partial<Record<SlotKey, string>>;
  chosen: CandidatePart[];
  totalMinorBase: number;
  /** How many of the requested tags the whole build satisfies. */
  tagsMatched: string[];
  tagsMissed: string[];
  warnings: string[];
}

export interface SuggestOptions {
  /** Part ids with a prepared preview layer, preferred so results can be shown. */
  previewable?: ReadonlySet<string>;
  maxCandidates?: number;
}

interface Priced {
  id: string;
  slot: SlotKey;
  name: string;
  family: string;
  price: number;
  tags: string[];
}

function styleTagsOf(attributes: Record<string, unknown>): string[] {
  const tags = attributes.styleTags;
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [];
}

function cheapestPrice(catalog: CatalogSlice, partId: string): number | null {
  const listings = catalog.listingsByPart?.[partId] ?? catalog.listings.filter((l) => l.partId === partId);
  if (!Array.isArray(listings) || listings.length === 0) return null;
  return listings.reduce((best, l) => Math.min(best, l.priceMinorBase), Infinity);
}

/**
 * Ranks parts in a slot by how much of the query they satisfy, then by price.
 *
 * Score is the count of requested tags the part carries, so a part
 * matching two of three beats one matching one. Price breaks ties
 * upward-cheapest, because a suggestion the user cannot afford is not a
 * suggestion.
 */
function rank(pool: Priced[], wanted: string[], previewable?: ReadonlySet<string>): Priced[] {
  return [...pool].sort((a, b) => {
    const aScore = a.tags.filter((t) => wanted.includes(t)).length;
    const bScore = b.tags.filter((t) => wanted.includes(t)).length;
    if (aScore !== bScore) return bScore - aScore;
    // Preferring a previewable part is a display concern, not a
    // correctness one, so it only ever breaks a tie between parts that
    // match the query equally well.
    if (previewable) {
      const aP = previewable.has(a.id) ? 1 : 0;
      const bP = previewable.has(b.id) ? 1 : 0;
      if (aP !== bP) return bP - aP;
    }
    return a.price - b.price;
  });
}

const CORE_SLOTS: SlotKey[] = ["movement", "case", "dial", "hands", "bezelInsert"];

export function suggestBuilds(intent: ParsedIntent, catalog: CatalogSlice, options: SuggestOptions = {}): Candidate[] {
  const maxCandidates = options.maxCandidates ?? 3;
  const wanted = intent.styleTags;

  const pools = new Map<SlotKey, Priced[]>();
  for (const part of Object.values(catalog.parts)) {
    const price = cheapestPrice(catalog, part.id);
    if (price === null || !Number.isFinite(price)) continue;
    const slot = part.slot as SlotKey;
    if (!CORE_SLOTS.includes(slot)) continue;
    const priced: Priced = { id: part.id, slot, name: part.name, family: part.family, price, tags: styleTagsOf(part.attributes) };
    const pool = pools.get(slot);
    if (pool) pool.push(priced);
    else pools.set(slot, [priced]);
  }

  // Movement: the only slot the parsed intent constrains functionally
  // rather than stylistically.
  const movements = (pools.get("movement") ?? []).filter((m) => {
    if (intent.requiresGmt === true && !/gmt|nh34/i.test(m.name)) return false;
    if (intent.requiresDate === true && !/date/i.test(m.name)) return false;
    if (intent.requiresDate === false && /date/i.test(m.name)) return false;
    // Spare parts and components are not movements you can build on.
    return /^Seiko \(TMI\) NH3/i.test(m.name);
  });

  const cases = (pools.get("case") ?? []).filter((c) => {
    if (!c.family.startsWith("skx")) return false;
    if (CASE_COMPONENT.test(c.name)) return false;
    return true;
  });

  const ranked = {
    movement: movements.sort((a, b) => a.price - b.price),
    case: rank(cases, wanted, options.previewable),
    dial: rank(pools.get("dial") ?? [], wanted, options.previewable),
    hands: rank(pools.get("hands") ?? [], wanted, options.previewable),
    bezelInsert: rank(pools.get("bezelInsert") ?? [], wanted, options.previewable),
  };

  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  // Walk the ranked lists in parallel, taking the nth best of each. Cheap,
  // deterministic, and it produces candidates that differ meaningfully
  // rather than three builds that share every part but the dial.
  for (let depth = 0; depth < 14 && candidates.length < maxCandidates; depth++) {
    const chosen: CandidatePart[] = [];
    const parts: Partial<Record<SlotKey, string>> = {};
    for (const slot of CORE_SLOTS) {
      const pool = ranked[slot as keyof typeof ranked];
      const pick = pool[Math.min(depth, pool.length - 1)];
      if (!pick) continue;
      parts[slot] = pick.id;
      chosen.push({ slot, partId: pick.id, name: pick.name, priceMinorBase: pick.price, matched: pick.tags.filter((t) => wanted.includes(t)) });
    }
    if (Object.keys(parts).length < 3) continue;

    const key = Object.values(parts).join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const total = chosen.reduce((sum, c) => sum + c.priceMinorBase, 0);
    if (intent.budgetMinor !== null && total > intent.budgetMinor) continue;

    // The hard gate. Anything blocked is discarded and never reaches the
    // model that writes the explanation, let alone the user.
    const result = evaluateBuild({ parts } as Build, catalog);
    if (result.status === "blocked") continue;

    const matched = [...new Set(chosen.flatMap((c) => c.matched))];
    candidates.push({
      parts,
      chosen,
      totalMinorBase: total,
      tagsMatched: matched,
      tagsMissed: wanted.filter((t) => !matched.includes(t)),
      warnings: result.findings.filter((f) => f.severity === "warning").map((f) => f.message),
    });
  }

  return candidates;
}

/** A plain-language summary, used when no model is available to write one. */
export function describeCandidate(candidate: Candidate): string {
  const matched = candidate.tagsMatched.map(tagLabel);
  const missed = candidate.tagsMissed.map(tagLabel);
  const parts: string[] = [];
  if (matched.length > 0) parts.push(`Matches what you asked for on ${listWords(matched)}.`);
  else parts.push("Nothing in the catalog matched the style you described, so this is the cheapest build that goes together.");
  if (missed.length > 0) parts.push(`No part in this build covers ${listWords(missed)} — the catalog has nothing tagged that way that also fits.`);
  return parts.join(" ");
}

function listWords(items: string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
