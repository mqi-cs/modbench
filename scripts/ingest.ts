// Offline ingestion script. Run by hand via `pnpm ingest [--vendor=<key>]
// [--dry-run] [--prices-only]`. Never run as a cron job or request handler
// -- specs/00-PROJECT.md global constraint #2.

import { and, eq } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import { nanoid } from "nanoid";
import { db, sqlite } from "../lib/db/client";
import { listings, parts, vendors } from "../lib/db/schema";
import { priceToMinorUnits, ShopifyProductsResponseSchema, type ShopifyProduct } from "../lib/vendor-feed-schema";

const USER_AGENT = "modbench-ingest/0.1 (+https://github.com/mqi-cs/modbench; contact: qasimimran291@gmail.com)";
const RATE_LIMIT_MS = 2000;
const PAGE_SIZE = 250;

interface VendorConfig {
  key: string;
  baseUrl: string;
}

// Must match scripts/seed.ts's vendor keys.
const VENDOR_CONFIGS: VendorConfig[] = [
  { key: "namokimods", baseUrl: "https://namokimods.com" },
  { key: "luciusatelier", baseUrl: "https://luciusatelier.com" },
  { key: "dlwwatches", baseUrl: "https://dlwwatches.com" },
  { key: "watchandstyle", baseUrl: "https://watchandstyle.net" },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const vendorArg = args.find((a) => a.startsWith("--vendor="));
  return {
    vendor: vendorArg ? vendorArg.split("=")[1] : null,
    dryRun: args.includes("--dry-run"),
    pricesOnly: args.includes("--prices-only"),
  };
}

async function fetchAllPages(baseUrl: string, vendorKey: string): Promise<ShopifyProduct[]> {
  const all: ShopifyProduct[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      throw new Error(`${vendorKey}: HTTP ${res.status} fetching page ${page}`);
    }
    const json = await res.json();
    const parsed = ShopifyProductsResponseSchema.safeParse(json);
    if (!parsed.success) {
      // Shape change: throw loudly, per spec, rather than silently write nulls.
      throw new Error(`${vendorKey}: feed shape changed on page ${page}: ${parsed.error.message}`);
    }
    all.push(...parsed.data.products);
    console.log(`  page ${page}: ${parsed.data.products.length} products`);
    if (parsed.data.products.length < PAGE_SIZE) break;
    page++;
    await sleep(RATE_LIMIT_MS);
  }
  return all;
}

async function ingestVendor(
  cfg: VendorConfig,
  opts: { dryRun: boolean; pricesOnly: boolean },
): Promise<void> {
  console.log(`\n=== ${cfg.key} ===`);

  let products: ShopifyProduct[];
  try {
    products = await fetchAllPages(cfg.baseUrl, cfg.key);
  } catch (err) {
    // Fail this vendor loudly, continue with the others -- per spec constraint.
    console.error(`FAILED: ${(err as Error).message}`);
    return;
  }
  console.log(`Fetched ${products.length} products total.`);

  const isoDate = new Date().toISOString().slice(0, 10);
  const rawPath = `data/raw/${cfg.key}-${isoDate}.json`;
  if (opts.dryRun) {
    console.log(`[dry-run] would write ${rawPath} and stop before any DB writes.`);
    return;
  }

  mkdirSync("data/raw", { recursive: true });
  writeFileSync(rawPath, JSON.stringify({ products }, null, 2));
  console.log(`Wrote raw feed to ${rawPath} (before any processing).`);

  const vendorRow = db.select().from(vendors).where(eq(vendors.key, cfg.key)).get();
  if (!vendorRow) {
    console.error(`No vendor row for ${cfg.key} -- run scripts/seed.ts first. Skipping DB writes.`);
    return;
  }

  const now = Date.now();
  let listingsUpserted = 0;
  let partsCreated = 0;
  let skippedBadPrice = 0;

  for (const product of products) {
    const sourceUrl = `${cfg.baseUrl}/products/${product.handle}`;

    for (const variant of product.variants) {
      let priceMinor: number;
      try {
        priceMinor = priceToMinorUnits(variant.price);
      } catch {
        skippedBadPrice++;
        continue;
      }
      if (priceMinor <= 0) {
        skippedBadPrice++;
        continue;
      }

      const existingPart = db.select().from(parts).where(eq(parts.sourceUrl, sourceUrl)).get();
      let partId: string;

      if (existingPart) {
        partId = existingPart.id;
      } else {
        if (opts.pricesOnly) continue; // --prices-only touches listings only, never creates parts
        partId = nanoid();
        db.insert(parts)
          .values({
            id: partId,
            // Placeholder category/family -- real values come from
            // scripts/import-tagged.ts. "nh3x-movement" is used only
            // because it's guaranteed to exist as an FK target; it carries
            // no meaning until the part is tagged.
            category: "movement",
            family: "nh3x-movement",
            name: product.title,
            brand: product.vendor || null,
            attributes: "{}",
            specSource: "family-inferred",
            confidence: "low",
            evidence: "ingest.ts placeholder -- not yet tagged",
            reviewState: "pending",
            sourceUrl,
            notes: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        partsCreated++;
      }

      db.insert(listings)
        .values({
          id: nanoid(),
          partId,
          vendorId: vendorRow.id,
          sourceUrl,
          priceMinor,
          currency: vendorRow.expectedCurrency,
          inStock: variant.available ? 1 : 0,
          lastCheckedAt: now,
        })
        .onConflictDoUpdate({
          target: [listings.partId, listings.vendorId],
          set: { priceMinor, inStock: variant.available ? 1 : 0, lastCheckedAt: now, sourceUrl },
        })
        .run();
      listingsUpserted++;
    }
  }

  console.log(
    `Upserted ${listingsUpserted} listings, created ${partsCreated} new parts, skipped ${skippedBadPrice} bad-price variants.`,
  );
}

async function main() {
  const opts = parseArgs();
  const targets = opts.vendor ? VENDOR_CONFIGS.filter((v) => v.key === opts.vendor) : VENDOR_CONFIGS;
  if (targets.length === 0) {
    console.error(`Unknown vendor key: ${opts.vendor}`);
    process.exit(1);
  }
  for (const cfg of targets) {
    await ingestVendor(cfg, opts);
  }
  sqlite.close();
}

main();
