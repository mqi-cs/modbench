// WS4 steps 5-7 (server side): resolve a pasted link to a draft, store the
// confirmed part, and hand submitted parts to the engine only for the
// builds that name them.
import "server-only";
import { customAlphabet } from "nanoid";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { families, submittedParts } from "../db/schema";
import { fromJsonColumn, toJsonColumn } from "../db/json";
import type { CatalogPart, CatalogSlice, SlotKey } from "../compat";
import { SLOT_KEYS } from "../builds";
import { parseListingUrl, type ListingRef } from "./url";
import { categoryOf, extract, familyFor, KEY_FIELDS, type Draft } from "./extract";
import { fetchEbayListing } from "./ebay";

export const BYO_PREFIX = "byo_";
const newId = customAlphabet("23456789abcdefghijkmnopqrstuvwxyz", 10);

function knownFamilies(): Set<string> {
  return new Set(db.select({ key: families.key }).from(families).all().map((f) => f.key));
}

async function fetchListing(ref: ListingRef) {
  return ref.platform === "ebay" ? fetchEbayListing(ref.itemId) : null;
}

export type Resolved = { ref: ListingRef; draft: Draft; fetched: boolean } | { error: string };

/** Step 1-4: allow-listed link -> draft for the confirmation screen. Without API access the draft comes from the pasted title, or is empty. */
export async function resolveListing(url: string, pastedTitle = ""): Promise<Resolved> {
  const ref = parseListingUrl(url);
  if ("error" in ref) return ref;
  const listing = await fetchListing(ref);
  return { ref, draft: extract(listing ?? { title: pastedTitle }, knownFamilies()), fetched: listing !== null };
}

const mm = (min: number, max: number) => z.number().min(min).max(max).nullable();
const ATTRIBUTE_SCHEMA: Record<string, z.ZodTypeAny> = {
  caseDiameterMm: mm(30, 50),
  diameterMm: mm(20, 40),
  outerDiameterMm: mm(28, 45),
  lugWidthMm: mm(10, 30),
  crownPosition: z.string().regex(/^\d{1,2}(\.\d)?$/).nullable(),
  caliber: z.string().regex(/^(NH(3[4568]|7[012])|VK6[34])$/).nullable(),
  hasFeet: z.boolean().nullable(),
  hasDateWindow: z.boolean().nullable(),
  hasDayWindow: z.boolean().nullable(),
  hasDate: z.boolean().nullable(),
  hasDay: z.boolean().nullable(),
  profile: z.enum(["flat", "domed", "slope"]).nullable(),
  material: z.string().max(20).nullable(),
};

const Submission = z.object({
  url: z.string().max(2000),
  slot: z.enum(SLOT_KEYS as [SlotKey, ...SlotKey[]]),
  name: z.string().trim().min(3).max(200),
  attributes: z.record(z.string(), z.unknown()),
  pastedTitle: z.string().max(500).optional(),
});

export type SaveSubmitted = { ok: true; id: string; slot: SlotKey } | { ok: false; error: string };

/**
 * Step 7: store the part the user confirmed. Nothing from the client is
 * trusted but the values themselves: the link is re-parsed, the family is
 * re-derived, and the part is `marketplace-stated` only when it matches,
 * unedited, what the API returned for that item -- otherwise `user-entered`.
 */
export async function saveSubmittedPart(raw: unknown): Promise<SaveSubmitted> {
  const parsed = Submission.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Choose which part this is and give it a name." };
  const { url, slot, name, pastedTitle } = parsed.data;
  const ref = parseListingUrl(url);
  if ("error" in ref) return { ok: false, error: ref.error };

  const attributes: Record<string, unknown> = {};
  for (const field of KEY_FIELDS[slot]) {
    const value = ATTRIBUTE_SCHEMA[field]!.safeParse(parsed.data.attributes[field] ?? null);
    if (!value.success) return { ok: false, error: `"${field}" isn't a value that part can have.` };
    attributes[field] = value.data;
  }

  const known = knownFamilies();
  const listing = await fetchListing(ref);
  const proposed = extract(listing ?? { title: pastedTitle ?? name }, known, slot);
  const unedited = listing !== null && name === proposed.name && KEY_FIELDS[slot].every((f) => attributes[f] === proposed.attributes[f]);
  const { family } = familyFor(slot, name.toLowerCase(), attributes, extract({ title: name }, known, slot).movementsListed, known);

  const id = BYO_PREFIX + newId();
  db.insert(submittedParts).values({
    id,
    category: categoryOf(slot),
    family,
    name,
    attributes: toJsonColumn({ ...attributes, movementsListed: proposed.movementsListed }),
    specSource: unedited ? "marketplace-stated" : "user-entered",
    platform: ref.platform,
    itemId: ref.itemId,
    sourceUrl: ref.canonicalUrl,
    extraction: toJsonColumn({ fetched: listing !== null, pastedTitle: pastedTitle ?? null, ...proposed }),
    createdAt: Date.now(),
  }).run();
  return { ok: true, id, slot };
}

const SLOT_OF: Record<string, SlotKey> = Object.fromEntries(SLOT_KEYS.map((s) => [categoryOf(s), s]));

/** Submitted parts by id, as the engine sees them. Rejected ones are left out, so a build naming one shows the slot as dropped. */
export function submittedPartsById(ids: Iterable<string>): Record<string, CatalogPart & { sourceUrl: string }> {
  const wanted = [...new Set([...ids].filter((id) => id.startsWith(BYO_PREFIX)))];
  if (wanted.length === 0) return {};
  const rows = db.select().from(submittedParts).where(inArray(submittedParts.id, wanted)).all();
  return Object.fromEntries(
    rows
      .filter((r) => r.reviewState !== "rejected")
      .map((r) => [
        r.id,
        {
          id: r.id,
          slot: SLOT_OF[r.category]!,
          family: r.family,
          name: r.name,
          attributes: fromJsonColumn<Record<string, unknown>>(r.attributes),
          specSource: r.specSource as CatalogPart["specSource"],
          confidence: "low" as const,
          sourceUrl: r.sourceUrl,
        },
      ]),
  );
}

/** The catalog's parts plus any submitted parts `ids` names. The shared catalog itself never gains them. */
export function withSubmitted(parts: CatalogSlice["parts"], ids: Iterable<string>): CatalogSlice["parts"] {
  const extra = submittedPartsById(ids);
  if (Object.keys(extra).length === 0) return parts;
  const merged = { ...parts };
  for (const [id, { sourceUrl: _drop, ...part }] of Object.entries(extra)) merged[id] = part;
  return merged;
}
