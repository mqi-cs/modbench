// Backfills parts.image_url from the vendors' own feed data, matched by
// sourceUrl. Display only -- lib/compat never sees this field and no rule
// may key off it, so a wrong or missing image can't affect a
// compatibility verdict.
//
// Images are hotlinked from each vendor's CDN rather than copied. That's
// deliberate for Phase 3: these are the vendors' own product photos on
// their own CDN, shown next to a link to the listing they came from, and
// the alternative (mirroring 3,451 images) is Phase 4's asset pipeline,
// which normalises them properly for the visual preview. See D7/05-phase-4.
import { readFileSync, readdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import type { ShopifyProduct } from "../lib/vendor-feed-schema";

const VENDOR_BASE: Record<string, string> = {
  namokimods: "https://namokimods.com",
  luciusatelier: "https://luciusatelier.com",
  dlwwatches: "https://dlwwatches.com",
  watchandstyle: "https://watchandstyle.net",
};

function latestRawFile(vendorKey: string): string {
  const files = readdirSync("data/raw").filter((f) => f.startsWith(`${vendorKey}-`) && f.endsWith(".json"));
  files.sort();
  const last = files[files.length - 1];
  if (!last) throw new Error(`No raw feed for ${vendorKey}`);
  return `data/raw/${last}`;
}

function main() {
  const bySourceUrl = new Map<string, string>();
  for (const [vendorKey, base] of Object.entries(VENDOR_BASE)) {
    const data = JSON.parse(readFileSync(latestRawFile(vendorKey), "utf-8"));
    for (const p of data.products as ShopifyProduct[]) {
      const img = (p as unknown as { images?: { src?: string }[] }).images?.[0]?.src;
      // Drop Shopify's ?v= cache-buster. It's ~20 random digits per URL,
      // it doesn't affect what the CDN serves (verified), and random
      // digits don't gzip -- across 3,451 parts it was most of the
      // payload cost of shipping images at all.
      if (img) bySourceUrl.set(`${base}/products/${p.handle}`, img.replace(/[?&]v=\d+/, ""));
    }
  }

  let updated = 0;
  let missing = 0;
  const now = Date.now();
  for (const part of db.select().from(parts).all()) {
    const img = bySourceUrl.get(part.sourceUrl);
    if (!img) {
      missing++;
      continue;
    }
    if (part.imageUrl === img) continue;
    db.update(parts).set({ imageUrl: img, updatedAt: now }).where(eq(parts.id, part.id)).run();
    updated++;
  }

  console.log(`Set image_url on ${updated} parts. ${missing} parts had no image in their vendor feed.`);
}

main();
sqlite.close();
