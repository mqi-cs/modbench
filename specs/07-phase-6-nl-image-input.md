# Phase 6 — Natural Language and Image Input

Deferred. Build this only when phases 0–5 are done and the catalog is trusted.

**Prerequisite:** Phase 5 pass measure met, and the catalog has been stable for long enough that you believe the data.

## Why it's last

Both features are thin layers over a catalog that must already exist and be correct. They're also the most fun part of the project, which is precisely why they're the temptation that would wreck the ordering. A natural language search over a catalog with bad compatibility data produces confident nonsense.

## Feature A — Natural language entry

Input on the homepage: "something like a white textured dial diver under £400."

**Pipeline: parse to constraints, then query deterministically.**

```ts
interface ParsedIntent {
  budgetMinor: number | null;
  currency: string;
  styleTags: string[];        // validated against the controlled vocabulary
  caseDiameterMm: [number, number] | null;
  requiresDate: boolean | null;
  requiresGmt: boolean | null;
  freeText: string;           // anything unmapped, shown back to the user
}
```

1. Claude parses the input into `ParsedIntent`. JSON only, Zod-validated.
2. **Constrain the model to the existing `styleTags` vocabulary.** Pass the full list in the prompt. Tags outside it are dropped, not invented.
3. Your own code queries the catalog against the parsed constraints and assembles 2–3 candidate builds.
4. Every candidate runs through `evaluateBuild`. **Anything blocked is discarded, never shown.**
5. Claude writes the explanation of each candidate — why these parts, what the tradeoffs are.

The model parses and explains. It never selects parts and never judges compatibility. Those stay in your code, where they're testable.

Show the parsed constraints back as editable chips. The user must be able to see and correct what was understood before results appear.

## Feature B — Image input

User uploads or links a photo of a watch. The site suggests a build that approximates the look.

**Extract attributes. Do not identify the model.**

```ts
interface ImageAttributes {
  dialColour: string;
  dialTexture: 'sunburst'|'matte'|'textured'|'lacquer'|null;
  indexStyle: 'applied'|'printed'|'baton'|'arabic'|'roman'|null;
  handStyle: 'sword'|'mercedes'|'snowflake'|'dauphine'|'plongeur'|null;
  bezelType: 'dive'|'gmt'|'fixed'|'tachymeter'|null;
  approxCaseSizeMm: number | null;
  confidence: Record<keyof ImageAttributes, 'high'|'medium'|'low'>;
}
```

Map to `styleTags`, then run the same deterministic query as Feature A.

**Never attempt to name the reference.** If the model guesses a brand and model and gets it wrong, you've burned trust for no benefit — and naming models in output invites exactly the trademark problem Phase 5 avoids. Extracted attributes only.

Show detected attributes as editable chips before any results. Low-confidence attributes render visibly uncertain and are excluded from the query unless the user confirms them.

## Constraints

- These are the **only** runtime LLM calls in the product. Nothing in `lib/compat` changes.
- Rate-limit by IP. Image uploads: 10MB cap, JPEG/PNG/WebP only, validate magic bytes not just the extension.
- Never persist uploaded images. Process in memory, discard immediately, state this in the UI.
- Both features degrade to the ordinary configurator if the API is unavailable. Never a dead end.
- Timeout at 10 seconds with a useful fallback message.
- Cache parsed intents by input hash — the same query shouldn't cost twice.

## Pass measure

1. **20 hand-written natural language queries** produce at least one valid build each. Judge relevance yourself against what you'd have picked.
2. **Zero blocked builds ever surface** from either feature. Assert in tests.
3. **No invented style tags.** Feed 20 adversarial queries using vocabulary outside the controlled list; confirm all are dropped or mapped, never passed through.
4. **10 test images** produce attributes you'd agree with on the high-confidence fields.
5. **No brand or model name appears** in any output from either feature. Grep the responses.
6. Both features fail gracefully with the API key removed.
7. Uploaded images are provably not persisted — check disk and logs.
