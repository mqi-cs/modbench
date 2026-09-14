// Resolving pasted vendor URLs to parts, and suggesting what else in the
// catalog might be the same physical thing.
//
// Pure: no database, no network, no clock. Everything here takes the rows
// it needs as arguments, which is what lets the URL grammar and the
// scoring be tested directly rather than through an HTTP round trip.
//
// NOTHING HERE DECIDES A MERGE. It produces a claim and a shortlist for a
// human to read. Merging deletes a parts row and asserts two listings are
// one object; that is a destructive false positive and it stays behind a
// person. See lib/db/schema.ts, merge_candidates.

/** Words that carry no information about which part a listing is. */
const STOPWORDS = new Set([
  "the", "for", "and", "with", "watch", "watches", "style", "styled", "set",
  "sets", "seiko", "mod", "mods", "modding", "new", "premium", "quality",
  "finish", "finished", "fits", "fit", "replacement", "part", "parts",
  "custom", "compatible", "your", "build", "builds", "a", "of", "to", "in",
]);

/**
 * A pasted URL reduced to something two vendors' links can be compared on.
 *
 * Shopify stores all publish /products/<handle>, and the same link arrives
 * with tracking parameters, a collection prefix, a trailing slash, http vs
 * https, and with or without www. All of those are the same page.
 */
export function normaliseProductUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);
  const at = segments.lastIndexOf("products");
  // A store link that is not a product page cannot identify a part, and
  // guessing from a collection or search URL would be worse than saying so.
  if (at === -1 || !segments[at + 1]) return null;
  const handle = decodeURIComponent(segments[at + 1]!).toLowerCase();
  return `${host}/products/${handle}`;
}

/** Content words from a listing name, lowercased, deduplicated. */
export function keywords(name: string): string[] {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    // Vendor SKUs (nmk960, h0558, c1546) are noise here -- they never
    // match across vendors -- but there is NO shape that separates them
    // from the model designators that matter most (mm1000, skx007, srpd,
    // nh35). A filter on "letters then digits" was tried and it ate
    // exactly the words this feature exists to match on. SKUs are left
    // in: they cost a little Jaccard denominator, symmetrically for every
    // candidate, which moves no ranking.
    .filter((w) => w.length > 1 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)];
}

/** Jaccard overlap of two keyword sets. 1 is identical wording. */
export function keywordOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter((w) => setB.has(w)).length;
  return shared / (new Set([...a, ...b]).size);
}

export interface MatchablePart {
  id: string;
  name: string;
  category: string;
  family: string;
  vendorKey: string;
  /** Colour style tags only. The hash is greyscale and cannot see finish. */
  colours: string[];
  /** 256-bit perceptual hash of the normalised asset, hex, when one exists. */
  phash?: string | null;
}

export interface Suggestion {
  part: MatchablePart;
  overlap: number;
  sharedWords: string[];
  phashDistance: number | null;
  colour: ColourAgreement;
  /** Why this is being shown, in the order a reader should weigh it. */
  reasons: string[];
}

export type ColourAgreement = "agree" | "differ" | "unknown";

export function colourAgreement(a: readonly string[], b: readonly string[]): ColourAgreement {
  if (a.length === 0 || b.length === 0) return "unknown";
  return [...a].sort().join(",") === [...b].sort().join(",") ? "agree" : "differ";
}

export function hexToBits(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  const bits = new Uint8Array(hex.length * 4);
  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i]!, 16);
    for (let b = 0; b < 4; b++) bits[i * 4 + b] = (nibble >> (3 - b)) & 1;
  }
  return bits;
}

export function hexDistance(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b || a.length !== b.length) return null;
  const ba = hexToBits(a), bb = hexToBits(b);
  if (!ba || !bb) return null;
  let d = 0;
  for (let i = 0; i < ba.length; i++) if (ba[i] !== bb[i]) d++;
  return d;
}

/** Distance under which two normalised assets are worth a human's eye. */
export const PHASH_SHORTLIST = 40;
/** Keyword overlap under which a same-category part is not worth showing. */
const MIN_OVERLAP = 0.28;

/**
 * Other parts that might be the same physical thing as `seeds`.
 *
 * Deliberately generous on what it SHOWS and explicit about why, because
 * the person reading it is the one deciding. A suggestion is never a
 * claim; it is "here is something with the same words and the same
 * silhouette, look at it".
 *
 * Same-vendor parts are excluded. Two listings in one store are two
 * products that store chose to sell separately, and treating them as one
 * would be a claim about the vendor's own catalog rather than about the
 * physical part.
 */
export function suggestMatches(
  seeds: readonly MatchablePart[],
  catalog: readonly MatchablePart[],
  limit = 8,
): Suggestion[] {
  if (seeds.length === 0) return [];
  const seedIds = new Set(seeds.map((s) => s.id));
  const seedVendors = new Set(seeds.map((s) => s.vendorKey));
  const categories = new Set(seeds.map((s) => s.category));
  const seedWords = seeds.map((s) => keywords(s.name));

  const out: Suggestion[] = [];
  for (const part of catalog) {
    if (seedIds.has(part.id)) continue;
    if (!categories.has(part.category)) continue;
    if (seedVendors.has(part.vendorKey)) continue;

    const words = keywords(part.name);
    let bestOverlap = 0;
    let bestShared: string[] = [];
    for (const sw of seedWords) {
      const o = keywordOverlap(sw, words);
      if (o > bestOverlap) {
        bestOverlap = o;
        bestShared = sw.filter((w) => words.includes(w));
      }
    }

    let bestDistance: number | null = null;
    for (const seed of seeds) {
      const d = hexDistance(seed.phash, part.phash);
      if (d !== null && (bestDistance === null || d < bestDistance)) bestDistance = d;
    }

    const closeByImage = bestDistance !== null && bestDistance <= PHASH_SHORTLIST;
    if (bestOverlap < MIN_OVERLAP && !closeByImage) continue;

    const colour = colourAgreement(seeds[0]!.colours, part.colours);
    const reasons: string[] = [];
    if (closeByImage) reasons.push(`images match to ${bestDistance}/256 after normalisation`);
    if (bestOverlap >= MIN_OVERLAP) reasons.push(`shares ${bestShared.join(", ")}`);
    if (seeds.some((s) => s.family === part.family)) reasons.push(`same compatibility family (${part.family})`);
    if (colour === "differ") reasons.push("colour tags DISAGREE -- likely the same model in another finish");
    if (colour === "unknown") reasons.push("no colour tag on one side, so finish is unchecked");

    out.push({ part, overlap: bestOverlap, sharedWords: bestShared, phashDistance: bestDistance, colour, reasons });
  }

  // Image agreement outranks wording: two vendors describing one part in
  // different words is the case this feature exists for.
  out.sort((x, y) => {
    const xd = x.phashDistance ?? 999, yd = y.phashDistance ?? 999;
    const xClose = xd <= PHASH_SHORTLIST, yClose = yd <= PHASH_SHORTLIST;
    if (xClose !== yClose) return xClose ? -1 : 1;
    if (xClose && yClose && xd !== yd) return xd - yd;
    return y.overlap - x.overlap;
  });
  return out.slice(0, limit);
}

/** Where a candidate came from, given whether the image agreed too. */
export function candidateSource(userSubmitted: boolean, imageAgrees: boolean): "user-link" | "phash" | "both" {
  if (userSubmitted && imageAgrees) return "both";
  return userSubmitted ? "user-link" : "phash";
}
