// WS4 step 1: which pasted links we accept. The URL itself is never
// fetched -- only the item id is taken from it and handed to the platform's
// official API (lib/byo/ebay.ts) -- so a crafted link can't point the server
// at anything (no server-side request forgery). Hosts are an exact allow
// list, not a suffix match: "ebay.com.evil.net" and "notebay.com" fail.

export type ByoPlatform = "ebay" | "aliexpress";

export interface ListingRef {
  platform: ByoPlatform;
  itemId: string;
  // Rebuilt from the id, so tracking parameters and whatever else was
  // pasted never reach the database or a shared build.
  canonicalUrl: string;
}

const EBAY_TLDS = ["com", "co.uk", "de", "fr", "it", "es", "nl", "be", "at", "ch", "ie", "ca", "com.au", "pl"];
const EBAY_HOSTS = new Set(EBAY_TLDS.flatMap((t) => [`ebay.${t}`, `www.ebay.${t}`, `m.ebay.${t}`]));
// Language and mobile subdomains serve the same item ids. Short links
// (a.aliexpress.com, s.click.aliexpress.com, ebay.us) are refused: they only
// resolve by following a redirect, which is fetching a user's URL.
const ALI_HOSTS = new Set(
  ["", "www.", "m.", "de.", "fr.", "es.", "it.", "nl.", "pl.", "pt.", "ja.", "ko."].flatMap((s) => [`${s}aliexpress.com`, `${s}aliexpress.us`]),
);

export function parseListingUrl(raw: string): ListingRef | { error: string } {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return { error: "That isn't a link. Paste the full address of an eBay or AliExpress listing." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only web links (https://) are accepted." };
  if (u.username || u.password || u.port) return { error: "That link has extra parts we don't accept. Copy it straight from the listing page." };
  const host = u.hostname.toLowerCase();

  if (EBAY_HOSTS.has(host)) {
    // /itm/123456789012 or /itm/some-title-slug/123456789012
    const m = /^\/itm\/(?:[^/]+\/)?(\d{9,15})\/?$/.exec(u.pathname);
    if (!m) return { error: "That's an eBay page, but not a single listing. Open the item itself and copy its link." };
    return { platform: "ebay", itemId: m[1]!, canonicalUrl: `https://www.ebay.com/itm/${m[1]}` };
  }
  if (ALI_HOSTS.has(host)) {
    const m = /^\/item\/(\d{6,20})\.html$/.exec(u.pathname);
    if (!m) return { error: "That's an AliExpress page, but not a single listing. Open the item itself and copy its link." };
    return { platform: "aliexpress", itemId: m[1]!, canonicalUrl: `https://www.aliexpress.com/item/${m[1]}.html` };
  }
  return { error: "Only eBay and AliExpress listings can be added. Parts from other shops can't be checked yet." };
}
