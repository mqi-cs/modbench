// Computes a perceptual hash for every part with a prepared asset.
//
// Feeds two things: scripts/dedup-phash.ts's candidate scoring, and the
// live match-suggestion path behind /submit-match, which needs to compare
// a pasted listing against the catalog without hashing 1,200 images per
// request.
//
// Display/analysis only. No rule in lib/compat reads part_hashes, and it
// is kept off parts.attributes so it never reaches the browser.
//
//   pnpm backfill-phash [--dry-run]

import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import { IMAGE_SIDE, bitsToHex, phash } from "../lib/dedup/phash";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();

  const rows: { partId: string; phash: string }[] = [];
  let missing = 0;
  for (const p of approved) {
    const file = `public/assets/${p.category}/${p.id}.webp`;
    if (!existsSync(file)) {
      missing++;
      continue;
    }
    // Flattened onto white first: the assets are transparent cutouts, and
    // the whole reason they beat raw vendor photos is that the background
    // is constant. Letting a decoder pick it defeats that.
    const grey = await sharp(readFileSync(file))
      .flatten({ background: "#ffffff" })
      .greyscale()
      .resize(IMAGE_SIDE, IMAGE_SIDE, { fit: "fill" })
      .raw()
      .toBuffer();
    rows.push({ partId: p.id, phash: bitsToHex(phash(new Uint8Array(grey))) });
  }

  console.log(`Hashed ${rows.length} parts. ${missing} approved parts have no prepared asset.`);
  if (dryRun) {
    console.log("Dry run: nothing written.");
    return;
  }

  const now = Date.now();
  const stmt = sqlite.prepare(
    "INSERT INTO part_hashes (part_id, phash, computed_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(part_id) DO UPDATE SET phash = excluded.phash, computed_at = excluded.computed_at",
  );
  sqlite.transaction((batch: typeof rows) => {
    for (const r of batch) stmt.run(r.partId, r.phash, now);
  })(rows);
  console.log(`Wrote ${rows.length} rows to part_hashes.`);
}

main();
