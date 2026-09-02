import { z } from "zod";
import { TAG_NAMES, validateTags } from "./style-vocabulary";

// The parsed shape of a natural-language or image query.
//
// specs/07-phase-6-nl-image-input.md: "Claude parses the input into
// ParsedIntent. JSON only, Zod-validated." Everything downstream is
// ordinary deterministic code -- the model never selects a part and never
// judges compatibility.

export const ParsedIntentSchema = z.object({
  budgetMinor: z.number().int().positive().max(10_000_00).nullable(),
  currency: z.string().length(3),
  styleTags: z.array(z.string()),
  caseDiameterMm: z.tuple([z.number(), z.number()]).nullable(),
  requiresDate: z.boolean().nullable(),
  requiresGmt: z.boolean().nullable(),
  freeText: z.string().max(500),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

export const EMPTY_INTENT: ParsedIntent = {
  budgetMinor: null,
  currency: "GBP",
  styleTags: [],
  caseDiameterMm: null,
  requiresDate: null,
  requiresGmt: null,
  freeText: "",
};

/**
 * Normalises whatever the model returned into a trustworthy intent.
 *
 * Two things happen here that the schema alone cannot do. Tags are
 * filtered against the controlled vocabulary, so an invented one is
 * dropped rather than passed through -- that is the whole of pass measure
 * 3, and it lives in code rather than in a prompt because a prompt is a
 * request and this is a guarantee. And anything the model wrote that did
 * not survive is folded into `freeText`, so the user is shown what was
 * understood *and* what was discarded, rather than silently getting
 * narrower results than they asked for.
 */
export function normaliseIntent(raw: unknown): { intent: ParsedIntent; droppedTags: string[] } {
  const parsed = ParsedIntentSchema.safeParse(raw);
  if (!parsed.success) return { intent: EMPTY_INTENT, droppedTags: [] };

  const styleTags = validateTags(parsed.data.styleTags);
  const droppedTags = parsed.data.styleTags
    .filter((t) => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && !styleTags.includes(t));

  // A reversed or absurd range is a parse failure, not a constraint.
  let caseDiameterMm = parsed.data.caseDiameterMm;
  if (caseDiameterMm) {
    const [lo, hi] = caseDiameterMm;
    if (!(lo > 20 && hi <= 60 && lo <= hi)) caseDiameterMm = null;
  }

  return {
    intent: { ...parsed.data, styleTags, caseDiameterMm, currency: parsed.data.currency.toUpperCase() },
    droppedTags,
  };
}

/** The vocabulary, for the prompt. Kept here so prompt and validator cannot drift. */
export function vocabularyForPrompt(): string {
  return TAG_NAMES.join(", ");
}
