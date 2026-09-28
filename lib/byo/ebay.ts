// WS4 step 2-3: eBay Browse API item details, validated with Zod. Only
// ever calls api.ebay.com with an item id parsed by lib/byo/url.ts -- never
// the pasted URL. Off unless EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set;
// callers fall back to manual entry. AliExpress has no client until
// developer access is approved (specs/08-DEFERRED.md D15b).
import "server-only";
import { z } from "zod";
import type { ListingText } from "./extract";

const Token = z.object({ access_token: z.string().min(1), expires_in: z.number() });

// Only the fields extraction reads. Unknown fields are ignored, missing
// required ones fail the parse -- a changed API shape falls back to manual
// entry rather than half-filling a part.
const Item = z.object({
  itemId: z.string(),
  title: z.string().min(1).max(500),
  localizedAspects: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

let cached: { token: string; until: number } | null = null;

export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function token(): Promise<string> {
  if (cached && Date.now() < cached.until) return cached.token;
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`eBay token: HTTP ${res.status}`);
  const t = Token.parse(await res.json());
  cached = { token: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  return t.access_token;
}

/** The listing's title and item specifics, or null when unavailable (not configured, ended, multi-variation, API change). */
export async function fetchEbayListing(itemId: string): Promise<ListingText | null> {
  if (!ebayConfigured() || !/^\d{9,15}$/.test(itemId)) return null;
  try {
    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id?legacy_item_id=${itemId}`, {
      headers: { Authorization: `Bearer ${await token()}`, "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const item = Item.safeParse(await res.json());
    if (!item.success) return null;
    return {
      title: item.data.title,
      aspects: Object.fromEntries((item.data.localizedAspects ?? []).map((a) => [a.name, a.value])),
    };
  } catch {
    return null;
  }
}
