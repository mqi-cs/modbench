// Server side of the user-submitted match path.
//
// The flow is deliberately shallow: resolve what was pasted, show what
// else looks like it, and record a CLAIM. Nothing here writes part_merges,
// moves a listing, or deletes a part. Accepting a candidate is
// scripts/review-merges.ts, run by a person.

import "server-only";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./../db/client";
import { listings, mergeCandidates, partHashes, parts, vendors } from "./../db/schema";
import { fromJsonColumn } from "./../db/json";
import {
  candidateSource,
  colourAgreement,
  hexDistance,
  normaliseProductUrl,
  suggestMatches,
  PHASH_SHORTLIST,
  type ColourAgreement,
  type MatchablePart,
  type Suggestion,
} from "./match";

const COLOUR_TAGS = new Set([
  "gold-tone", "silver-tone", "blue", "green", "red", "orange",
  "yellow", "brown", "cream", "white", "grey", "black",
]);

export interface ResolvedUrl {
  submitted: string;
  normalised: string | null;
  part: MatchablePart | null;
  /** Why it did not resolve, in words a submitter can act on. */
  problem: string | null;
}

export interface SubmissionResult {
  candidateId: string | null;
  resolved: ResolvedUrl[];
  suggestions: Suggestion[];
  phashDistance: number | null;
  colour: ColourAgreement | null;
  /** Set when nothing was recorded, with the reason. */
  rejected: string | null;
}

function buildIndex() {
  const rows = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const hashes = new Map(db.select().from(partHashes).all().map((h) => [h.partId, h.phash]));
  const vendorById = new Map(db.select().from(vendors).all().map((v) => [v.id, v.key]));

  const byUrl = new Map<string, string>();
  for (const l of db.select().from(listings).all()) {
    const key = normaliseProductUrl(l.sourceUrl);
    if (key) byUrl.set(key, l.partId);
  }

  const vendorOf = new Map<string, string>();
  for (const l of db.select().from(listings).all()) {
    if (!vendorOf.has(l.partId)) vendorOf.set(l.partId, vendorById.get(l.vendorId) ?? "unknown");
  }

  const catalog: MatchablePart[] = rows.map((p) => {
    const tags = fromJsonColumn<{ styleTags?: string[] }>(p.attributes).styleTags;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      family: p.family,
      vendorKey: vendorOf.get(p.id) ?? "unknown",
      colours: (Array.isArray(tags) ? tags : []).filter((t) => COLOUR_TAGS.has(t)),
      phash: hashes.get(p.id) ?? null,
    };
  });
  const byId = new Map(catalog.map((p) => [p.id, p]));
  // A part's own sourceUrl is a second way in: some vendors' listing rows
  // and the part row do not carry the identical URL.
  for (const p of rows) {
    const key = normaliseProductUrl(p.sourceUrl);
    if (key && !byUrl.has(key)) byUrl.set(key, p.id);
  }
  return { catalog, byId, byUrl };
}

export function resolveUrls(urls: string[]): { resolved: ResolvedUrl[]; catalog: MatchablePart[] } {
  const { catalog, byId, byUrl } = buildIndex();
  const resolved: ResolvedUrl[] = urls.map((submitted) => {
    const normalised = normaliseProductUrl(submitted);
    if (!normalised) {
      return {
        submitted,
        normalised: null,
        part: null,
        problem: "That is not a vendor product link. It needs to be the page for one product, the kind with /products/ in it.",
      };
    }
    const partId = byUrl.get(normalised);
    if (!partId) {
      return {
        submitted,
        normalised,
        part: null,
        problem: "That product is not in the catalog. It may be from a vendor we do not track, or a listing that has not been reviewed yet.",
      };
    }
    const part = byId.get(partId) ?? null;
    return {
      submitted,
      normalised,
      part,
      problem: part ? null : "That listing is in the catalog but its part is not approved yet.",
    };
  });
  return { resolved, catalog };
}

/**
 * Records a claim that the given listings are one physical part.
 *
 * Returns everything it worked out, including the reasons NOT to trust the
 * claim, because the submitter should see those too -- a colour
 * disagreement usually means they have found the same model in a different
 * finish, which is useful to them and is not a merge.
 */
export function submitMatch(urls: string[], note: string | null): SubmissionResult {
  const { resolved, catalog } = resolveUrls(urls);
  const found = resolved.map((r) => r.part).filter((p): p is MatchablePart => p !== null);
  const unique = [...new Map(found.map((p) => [p.id, p])).values()];

  const suggestions = suggestMatches(unique, catalog);
  const base: SubmissionResult = {
    candidateId: null,
    resolved,
    suggestions,
    phashDistance: null,
    colour: null,
    rejected: null,
  };

  if (unique.length < 2) {
    return {
      ...base,
      rejected:
        found.length === 0
          ? "None of those links resolved to a part we hold."
          : "Those links are the same catalog part already, or only one of them resolved. A claim needs two different parts.",
    };
  }
  if (new Set(unique.map((p) => p.category)).size > 1) {
    return { ...base, rejected: "Those parts are in different categories, so they cannot be the same physical part." };
  }
  if (new Set(unique.map((p) => p.vendorKey)).size < 2) {
    return { ...base, rejected: "Those listings are from the same vendor. Two products one shop sells separately are two products." };
  }

  let phashDistance: number | null = null;
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const d = hexDistance(unique[i]!.phash, unique[j]!.phash);
      if (d !== null && (phashDistance === null || d > phashDistance)) phashDistance = d;
    }
  }
  const colour = unique.slice(1).reduce<ColourAgreement>(
    (acc, p) => (acc === "differ" ? acc : mergeAgreement(acc, colourAgreement(unique[0]!.colours, p.colours))),
    "agree",
  );

  const imageAgrees = phashDistance !== null && phashDistance <= PHASH_SHORTLIST;
  const id = nanoid(12);
  db.insert(mergeCandidates)
    .values({
      id,
      partIds: JSON.stringify(unique.map((p) => p.id).sort()),
      submittedUrls: JSON.stringify(urls),
      unresolvedUrls: JSON.stringify(resolved.filter((r) => !r.part).map((r) => r.submitted)),
      source: candidateSource(true, imageAgrees),
      phashDistance,
      colourAgreement: colour,
      note: note && note.trim() ? note.trim().slice(0, 500) : null,
      status: "pending",
      createdAt: Date.now(),
    })
    .run();

  return { ...base, candidateId: id, phashDistance, colour };
}

function mergeAgreement(a: ColourAgreement, b: ColourAgreement): ColourAgreement {
  if (a === "differ" || b === "differ") return "differ";
  if (a === "unknown" || b === "unknown") return "unknown";
  return "agree";
}

export function pendingCandidates() {
  const rows = db.select().from(mergeCandidates).where(eq(mergeCandidates.status, "pending")).all();
  const ids = [...new Set(rows.flatMap((r) => JSON.parse(r.partIds) as string[]))];
  const named = ids.length
    ? new Map(db.select().from(parts).where(inArray(parts.id, ids)).all().map((p) => [p.id, p.name]))
    : new Map<string, string>();
  return rows.map((r) => ({
    ...r,
    partNames: (JSON.parse(r.partIds) as string[]).map((id) => named.get(id) ?? `(deleted ${id})`),
  }));
}
