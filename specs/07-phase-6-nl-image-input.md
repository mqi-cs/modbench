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

---

## Result

Built. The deterministic half is complete and tested; the model half is
written but could not be exercised, because there is no `ANTHROPIC_API_KEY`
in this environment. What that does and doesn't leave verified is set out
per pass measure below.

## The blocker that had to be cleared first

**`styleTags` did not exist.** The column is on every dial, hand set and
bezel insert, and it was an empty array on all 3,451 approved parts — no
earlier pass filled it, because nothing until now read it. The spec's
central mechanism ("constrain the model to the existing `styleTags`
vocabulary… pass the full list in the prompt") had no list to pass, and
both features map to `styleTags` before querying. Built as it stood, a
natural-language search would have resolved to constraints matching
nothing, which is indistinguishable to the user from "no such parts exist"
— the worst possible failure for a feature whose whole job is finding
things.

So `lib/style-vocabulary.ts` **is** the vocabulary — 43 tags across colour,
finish, index style, hand shape, bezel character and overall character —
and `scripts/backfill-style-tags.ts` assigns them deterministically from
evidence in each vendor's own listing name, the same approach as the
Phase 2 `body_html` mining and for the same reason: a tag that cannot be
traced to something a vendor wrote is a guess. Result: **1,593 parts
tagged, 2.3 tags each, 164 with none, and every one of the 43 tags matches
at least one part.**

Two rules shaped the list. A tag nothing carries is worse than no tag,
because a query using it returns nothing and the user cannot tell that
from "no matches" — `baton-indices` and `applied-indices` were cut for
matching nothing. And no trademarked model names, since these tags are
user-facing chips that end up in page copy; a listing saying "Submariner
style" contributes `dive-bezel`, not the model name.

The backfill also caught a false positive worth recording: `two-tone-bezel`
was matching `\w+/\w+`, which hits the "SKX007/SRPD" fitment note in
nearly every insert listing, and tagged **364 of 681** inserts two-tone
when most are a single colour. Now it requires two *named colours* either
side of the separator: 176.

## Pass measures

1. **20 natural-language queries each produce a valid build.** Met, tested
   against the shipped keyword parser rather than the model — see the note
   below. All 20 return candidates; 18 of 20 resolve to at least one
   vocabulary tag (the two that don't are "cheap as possible" and similar,
   which are a sort order, not a style).
2. **Zero blocked builds ever surface.** Met, and asserted independently:
   the test re-runs `evaluateBuild` on every candidate rather than
   trusting the filter inside `suggestBuilds`, across all 20 queries plus
   every one of the 43 tags individually, the whole vocabulary at once,
   and several functional constraints. It also asserts a floor on how many
   candidates were checked, so the test cannot pass by producing nothing.
3. **No invented style tags.** Met. 20 adversarial inputs — brand names,
   plausible-but-absent tags, casing and whitespace variants, a SQL
   fragment, `__proto__` and `constructor` — leave exactly `["black"]`.
   The guarantee is an exact membership test in `validateTags`, not a
   prompt instruction, and everything dropped is reported back to the user
   so they know their query was narrowed.
4. **10 test images produce attributes you'd agree with.** **Not
   verifiable here** — needs a vision model. The mapping from attributes
   to vocabulary is tested, including that low-confidence fields are
   excluded until confirmed.
5. **No brand or model name in any output.** Met, at three layers: none in
   the vocabulary itself (asserted over all 43 tags and labels), none in
   any generated explanation (asserted across every query's candidates),
   and `scrubOutput` strips them from model output recursively — because
   the prompt instruction is a request, and this carries a legal caution.
6. **Both features fail gracefully with the key removed.** Met, and it is
   the only path this environment can run: the entire 274-test suite
   executes with no key set. Rather than a dead end, the fallback is a
   keyword parser over the same controlled vocabulary — the patterns that
   tag the catalog can also read a query, so "black dive bezel under £300"
   resolves with no model at all. Worse than a model at paraphrase, not at
   the common case. Image search returns 503 with a link to the
   configurator.
7. **Uploaded images provably not persisted.** Met, checked rather than
   asserted: no filesystem write or logging call exists anywhere on the
   `/api/identify` path, an upload creates zero files on disk, and no
   table holds image data. The route deliberately logs nothing from the
   request body, since a logged base64 payload is a persisted image by
   another name.

### On testing pass measure 1 without a model

The 20 queries run through `parseWithKeywords`, which is the shipped
fallback, not a stand-in. That tests the half of the pipeline the spec
cares most about — "the model parses and explains. It never selects parts
and never judges compatibility. Those stay in your code, where they're
testable" — and it is exactly the code that runs when the model is
unavailable. What it does not test is whether the model produces good
`ParsedIntent` output for paraphrased input, which needs a key.

## Notes

- `suggestBuilds` walks the ranked pools in parallel at increasing depth,
  which yields candidates that differ meaningfully rather than three
  builds sharing every part but the dial. Preferring a part with a preview
  layer only ever breaks a tie between parts that match the query equally
  well — a display concern must not outrank correctness.
- Candidates report `tagsMissed` as well as `tagsMatched`, and the
  explanation says which requested tags nothing could satisfy. Honesty
  about a partial match matters more here than anywhere else in the
  product: the user asked for something specific and is being handed an
  approximation.
- Image uploads are validated by magic bytes at three offsets, not by
  extension or declared content type — both are supplied by the caller and
  neither says anything about the bytes. Tested against a PDF, an SVG and
  a shell script.
- Parsed intents are cached in process by input hash. That is a cost
  optimisation, so losing it on a cold start is fine — unlike the rate
  limiter, which is in the database for exactly the opposite reason.
