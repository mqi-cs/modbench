// Manual cross-vendor part merge. One merge, hand-authored, per
// specs/09-COMPETITIVE-CONTEXT.md and Investigation A/B: general
// deduplication is NOT built here -- this script has one hardcoded merge,
// reviewed and decided by a human, not a rule that finds and merges
// candidates automatically. Run once; not idempotent by design (re-running
// against an already-merged part will find nothing left to merge).

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, sqlite } from "../lib/db/client";
import { listings, partMerges, parts } from "../lib/db/schema";
import { fromJsonColumn, toJsonColumn } from "../lib/db/json";

// The SRP Turtle sapphire crystal -- Investigation A's most credible
// candidate: same family (srp-turtle-crystal), same construction ("Double
// Dome(d)"), sold by 3 vendors, no case-shape ambiguity (a sapphire crystal
// has no color/style variation the way a dial or insert would, so a title
// match here is much stronger evidence of physical identity than the
// hands/inserts Investigation A flagged as likely false positives).
const CANONICAL_SOURCE_URL = "https://namokimods.com/products/turtle-srp-double-domed-sapphire-crystal";
const MERGE_SOURCE_URLS = [
  "https://dlwwatches.com/products/double-dome-sapphire-crystal-seiko-new-turtle",
  "https://watchandstyle.net/products/turtle-reissue-double-dome-sapphire-crystal-1",
];
const MERGE_REASON =
  "Investigation A (mutual-best-match title analysis): all 3 listings share the srp-turtle-crystal family, " +
  "the same 'Double Dome(d) Sapphire Crystal' construction, and no attribute conflict (all record material: sapphire). " +
  "A sapphire crystal has no stylistic variation (unlike a dial/insert's color options), so title agreement here is a much " +
  "stronger signal of true physical identity than the hands/insert candidates Investigation A flagged as likely false positives " +
  "from shared marketing vocabulary. Judged the same physical part by hand, not by an automated rule -- see 09-COMPETITIVE-CONTEXT.md.";

function main() {
  const canonical = db.select().from(parts).where(eq(parts.sourceUrl, CANONICAL_SOURCE_URL)).get();
  if (!canonical) {
    console.error(`Canonical part not found: ${CANONICAL_SOURCE_URL}`);
    process.exit(1);
  }
  console.log(`Canonical part: ${canonical.name} (${canonical.id})`);

  const now = Date.now();
  let merged = 0;

  for (const url of MERGE_SOURCE_URLS) {
    const dupe = db.select().from(parts).where(eq(parts.sourceUrl, url)).get();
    if (!dupe) {
      console.warn(`Skipping ${url} -- not found (already merged, or never existed).`);
      continue;
    }

    const dupeListings = db.select().from(listings).where(eq(listings.partId, dupe.id)).all();
    for (const l of dupeListings) {
      // Move the listing onto the canonical part. sourceUrl on the listing
      // itself already retains the original vendor URL -- this is the
      // primary way "all source URLs" stays retained day to day; part_merges
      // is the durable record for after the duplicate `parts` row is gone.
      db.update(listings).set({ partId: canonical.id }).where(eq(listings.id, l.id)).run();
    }

    db.insert(partMerges)
      .values({
        id: nanoid(),
        canonicalPartId: canonical.id,
        mergedPartName: dupe.name,
        mergedSourceUrl: dupe.sourceUrl,
        mergedVendorKey: new URL(dupe.sourceUrl).hostname.split(".")[0] ?? "unknown",
        mergedAttributes: dupe.attributes, // already a JSON string, stored as-is
        reason: MERGE_REASON,
        createdAt: now,
      })
      .run();

    db.delete(parts).where(eq(parts.id, dupe.id)).run();
    console.log(`Merged "${dupe.name}" (${dupe.sourceUrl}) -> canonical part, deleted duplicate row.`);
    merged++;
  }

  console.log(`\nDone. ${merged} part(s) merged into ${canonical.id}.`);

  const finalListings = db.select().from(listings).where(eq(listings.partId, canonical.id)).all();
  console.log(`Canonical part now has ${finalListings.length} listing(s).`);
}

main();
sqlite.close();
