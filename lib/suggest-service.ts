import "server-only";
import { createHash } from "node:crypto";
import { loadCatalog } from "./catalog";
import { catalogSlice, configuratorHref } from "./build-view";
import { decodePreviewable } from "./preview/previewable";
import { suggestBuilds, describeCandidate, type Candidate } from "./suggest";
import { parseQuery, type ParseOutcome } from "./llm";
import { tagLabel } from "./style-vocabulary";
import type { ParsedIntent } from "./intent";

export interface SuggestionResult {
  intent: ParsedIntent;
  /** Editable chips: what was understood. */
  chips: { tag: string; label: string }[];
  /** Vocabulary the model invented, shown so the user knows it was ignored. */
  droppedTags: string[];
  source: ParseOutcome["source"];
  notice: string | null;
  candidates: (Candidate & { href: string; explanation: string })[];
}

// specs/07-phase-6-nl-image-input.md: "Cache parsed intents by input hash
// -- the same query shouldn't cost twice." In-process and bounded; this is
// a cost optimisation, not correctness, so losing it on a cold start is
// fine (unlike the rate limiter, which is in the database for exactly the
// opposite reason).
const intentCache = new Map<string, ParseOutcome>();
const CACHE_LIMIT = 500;

function cacheKey(input: string): string {
  return createHash("sha256").update(input.trim().toLowerCase()).digest("hex");
}

export async function suggestFromText(input: string): Promise<SuggestionResult> {
  const key = cacheKey(input);
  let outcome = intentCache.get(key);
  if (!outcome) {
    outcome = await parseQuery(input);
    if (intentCache.size >= CACHE_LIMIT) intentCache.delete(intentCache.keys().next().value!);
    intentCache.set(key, outcome);
  }
  return assemble(outcome);
}

export function suggestFromIntent(intent: ParsedIntent, source: ParseOutcome["source"] = "keywords", notice: string | null = null): SuggestionResult {
  return assemble({ intent, droppedTags: [], source, notice });
}

function assemble(outcome: ParseOutcome): SuggestionResult {
  const catalog = loadCatalog();
  const slice = catalogSlice(catalog);
  const previewable = decodePreviewable(Object.keys(catalog.parts), catalog.previewable);
  const candidates = suggestBuilds(outcome.intent, slice, { previewable });

  return {
    intent: outcome.intent,
    chips: outcome.intent.styleTags.map((tag) => ({ tag, label: tagLabel(tag) })),
    droppedTags: outcome.droppedTags,
    source: outcome.source,
    notice: outcome.notice,
    candidates: candidates.map((c) => ({
      ...c,
      href: configuratorHref(c.parts),
      // With no model available the explanation is written from the same
      // facts the ranking used, so the page never shows a build it cannot
      // account for.
      explanation: describeCandidate(c),
    })),
  };
}
