import "server-only";
import { EMPTY_INTENT, normaliseIntent, vocabularyForPrompt, type ParsedIntent } from "./intent";
import { STYLE_TAGS } from "./style-vocabulary";
import { findReservedTerms } from "./trademarks";

// The only runtime model calls in the product.
// specs/07-phase-6-nl-image-input.md: "These are the only runtime LLM
// calls in the product. Nothing in lib/compat changes."

const MODEL = "claude-sonnet-5";
const TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ParseSource = "model" | "keywords";

export interface ParseOutcome {
  intent: ParsedIntent;
  droppedTags: string[];
  source: ParseSource;
  /** Set when the model was unavailable or failed; shown to the user. */
  notice: string | null;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `You turn a shopping request for a Seiko watch-mod build into structured constraints.

Reply with JSON only, no prose and no code fence, matching exactly:
{"budgetMinor": integer minor units or null, "currency": "GBP", "styleTags": [string], "caseDiameterMm": [min, max] or null, "requiresDate": true/false/null, "requiresGmt": true/false/null, "freeText": string}

Rules:
- styleTags MUST come from this list and nothing else. Do not invent tags, do not pluralise, do not translate: ${vocabularyForPrompt()}
- Anything you cannot express with those tags goes in freeText, verbatim, so the person can see what was not understood.
- budgetMinor is in pence when currency is GBP. "under £400" is 40000.
- Use null, never a guess, for anything the request does not state.
- Never name a watch brand or model in freeText. Describe the look instead.`;

interface AnthropicMessage {
  role: "user";
  content: unknown;
}

async function callModel(messages: AnthropicMessage[], maxTokens = 700): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: SYSTEM_PROMPT, messages }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.find((c) => c.type === "text")?.text ?? null;
  } catch {
    // Timeout, network failure, malformed response: all the same to the
    // caller, which falls back to the keyword parser. Never a dead end.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls the first JSON object out of a reply that may carry stray prose. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Keyword fallback: the same controlled vocabulary, matched directly
 * against the user's words.
 *
 * The spec requires both features to "degrade to the ordinary
 * configurator if the API is unavailable. Never a dead end." This goes a
 * step further than a dead end: because the vocabulary already carries
 * the words that evidence each tag, the same patterns that tag the
 * catalog can read a query, and a request like "black dive bezel under
 * £300" resolves without any model at all. It is worse than the model at
 * paraphrase, not at the common case.
 */
export function parseWithKeywords(input: string): ParsedIntent {
  const text = input.toLowerCase();
  const styleTags = STYLE_TAGS.filter((t) => t.evidence.test(text)).map((t) => t.tag);

  // "£400", "400 pounds", "under 400".
  const money = text.match(/(?:£|gbp\s*)(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*)\s*(?:pounds|quid|gbp)/);
  const amount = money ? Number((money[1] ?? money[2] ?? "").replace(/,/g, "")) : NaN;
  const budgetMinor = Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null;

  const size = text.match(/(\d{2}(?:\.\d)?)\s*mm/);
  const mm = size ? Number(size[1]) : NaN;
  const caseDiameterMm: [number, number] | null = Number.isFinite(mm) && mm > 20 && mm < 60 ? [mm - 2, mm + 2] : null;

  const requiresGmt = /\bgmt\b|second time ?zone|dual time|two time ?zone/.test(text) ? true : null;
  const requiresDate = /\bno date\b|dateless|without a date/.test(text) ? false : /\bdate\b/.test(text) ? true : null;

  return { ...EMPTY_INTENT, styleTags: [...new Set(styleTags)], budgetMinor, caseDiameterMm, requiresDate, requiresGmt, freeText: input.slice(0, 500) };
}

export async function parseQuery(input: string): Promise<ParseOutcome> {
  const trimmed = input.trim().slice(0, 500);
  if (!trimmed) return { intent: EMPTY_INTENT, droppedTags: [], source: "keywords", notice: null };

  if (!hasApiKey()) {
    return {
      intent: parseWithKeywords(trimmed),
      droppedTags: [],
      source: "keywords",
      notice: "Reading your request by keyword — the language model isn't configured, so paraphrases may be missed. Everything below is still checked for fitment.",
    };
  }

  const text = await callModel([{ role: "user", content: trimmed }]);
  const parsed = text ? extractJson(text) : null;
  if (!parsed) {
    return {
      intent: parseWithKeywords(trimmed),
      droppedTags: [],
      source: "keywords",
      notice: "Couldn't reach the language model, so your request was read by keyword instead. Everything below is still checked for fitment.",
    };
  }
  const { intent, droppedTags } = normaliseIntent(parsed);
  return { intent, droppedTags, source: "model", notice: null };
}

// --- Image input ---------------------------------------------------------

const MAGIC: { mime: string; bytes: number[]; offset: number }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

export interface ImageCheck {
  ok: boolean;
  mime?: string;
  error?: string;
}

/**
 * Validates an upload by its magic bytes, not its extension or its
 * declared content type -- both of which are supplied by the caller and
 * neither of which says anything about what the bytes are.
 */
export function checkImage(buffer: Uint8Array): ImageCheck {
  if (buffer.byteLength === 0) return { ok: false, error: "Empty file." };
  if (buffer.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "Images must be under 10MB." };
  for (const { mime, bytes, offset } of MAGIC) {
    if (bytes.every((b, i) => buffer[offset + i] === b)) return { ok: true, mime };
  }
  return { ok: false, error: "Only JPEG, PNG and WebP images are accepted." };
}

const IMAGE_PROMPT = `Describe the visible attributes of the watch in this photograph.

Reply with JSON only:
{"dialColour": string, "dialTexture": "sunburst"|"matte"|"textured"|"lacquer"|null, "indexStyle": "applied"|"printed"|"baton"|"arabic"|"roman"|null, "handStyle": "sword"|"mercedes"|"snowflake"|"dauphine"|"plongeur"|null, "bezelType": "dive"|"gmt"|"fixed"|"tachymeter"|null, "approxCaseSizeMm": number|null, "confidence": {"dialColour":"high"|"medium"|"low", "dialTexture":..., "indexStyle":..., "handStyle":..., "bezelType":..., "approxCaseSizeMm":...}}

Rules:
- NEVER name a brand, a manufacturer or a model. Not in any field. Describe what you can see.
- Use null and confidence "low" rather than guessing.
- Judge each field independently; a clear dial does not make the case size clear.`;

export const ImageAttributeKeys = ["dialColour", "dialTexture", "indexStyle", "handStyle", "bezelType", "approxCaseSizeMm"] as const;
export type ImageAttributeKey = (typeof ImageAttributeKeys)[number];

export interface ImageAttributes {
  dialColour: string | null;
  dialTexture: string | null;
  indexStyle: string | null;
  handStyle: string | null;
  bezelType: string | null;
  approxCaseSizeMm: number | null;
  confidence: Record<ImageAttributeKey, "high" | "medium" | "low">;
}

/** Maps extracted image attributes onto the controlled vocabulary. */
export function attributesToTags(attributes: ImageAttributes, includeLowConfidence = false): string[] {
  const tags: string[] = [];
  const usable = (key: ImageAttributeKey) => includeLowConfidence || attributes.confidence?.[key] !== "low";

  if (attributes.dialColour && usable("dialColour")) {
    // The colour comes back as free text, so it is matched against the
    // vocabulary's own colour patterns rather than trusted as a tag.
    for (const tag of STYLE_TAGS.filter((t) => t.category === "colour")) {
      if (tag.evidence.test(attributes.dialColour)) tags.push(tag.tag);
    }
  }
  if (attributes.dialTexture && usable("dialTexture")) {
    const map: Record<string, string> = { sunburst: "sunburst", matte: "matte", textured: "textured", lacquer: "enamel" };
    const tag = map[attributes.dialTexture];
    if (tag) tags.push(tag);
  }
  if (attributes.indexStyle && usable("indexStyle")) {
    const map: Record<string, string> = { arabic: "arabic-numerals", roman: "roman-numerals" };
    const tag = map[attributes.indexStyle];
    if (tag) tags.push(tag);
  }
  if (attributes.handStyle && usable("handStyle")) {
    const map: Record<string, string> = { sword: "sword-hands", mercedes: "three-lobe-hands", snowflake: "faceted-hands", dauphine: "dauphine-hands", plongeur: "sword-hands" };
    const tag = map[attributes.handStyle];
    if (tag) tags.push(tag);
  }
  if (attributes.bezelType && usable("bezelType")) {
    const map: Record<string, string> = { dive: "dive-bezel", gmt: "gmt-bezel", fixed: "plain-bezel" };
    const tag = map[attributes.bezelType];
    if (tag) tags.push(tag);
  }
  return [...new Set(tags)];
}

/**
 * Strips any brand or model name the model produced despite being told
 * not to.
 *
 * The instruction in the prompt is a request; this is the guarantee. Pass
 * measure 5 requires no brand or model name in any output, and the only
 * place that can be enforced is here.
 */
export function scrubOutput<T>(value: T): T {
  return scrubValue(value) as T;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    const found = findReservedTerms(value);
    if (found.length === 0) return value;
    let out = value;
    for (const term of found) {
      out = out.replace(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
    }
    return out.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
  }
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubValue(v);
    return out;
  }
  return value;
}

export async function readImage(buffer: Uint8Array, mime: string): Promise<ImageAttributes | null> {
  if (!hasApiKey()) return null;
  const text = await callModel(
    [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: Buffer.from(buffer).toString("base64") } },
          { type: "text", text: IMAGE_PROMPT },
        ],
      },
    ],
    600,
  );
  const parsed = text ? extractJson(text) : null;
  if (!parsed || typeof parsed !== "object") return null;
  return scrubOutput(parsed as ImageAttributes);
}
