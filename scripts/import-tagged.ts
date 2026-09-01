// Reads data/tagged/*.json (and *-rejected.json), Zod-validates, and writes
// into `parts` as `pending` -- updating the placeholder row scripts/ingest.ts
// created for that sourceUrl (matched by sourceUrl, so the existing
// `listings` FK stays intact) rather than inserting a duplicate part.
// Rejects anything with an unknown family key or an out-of-vocabulary style
// tag, per specs/02-phase-1-data-pipeline.md.

import { eq } from "drizzle-orm";
import { readFileSync, readdirSync } from "node:fs";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, sqlite } from "../lib/db/client";
import { families, parts, rejectedParts } from "../lib/db/schema";
import { toJsonColumn } from "../lib/db/json";
import { isStyleTag } from "../lib/db/style-tags";

const TaggedEntrySchema = z.object({
  sourceUrl: z.string(),
  name: z.string(),
  category: z.enum(["movement", "case", "dial", "hands", "bezel_insert", "bezel", "crystal", "chapter_ring", "crown", "strap"]),
  family: z.string(),
  attributes: z.record(z.string(), z.unknown()),
  specSource: z.enum(["vendor-stated", "family-inferred", "manual"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.string().min(1),
});

const RejectedEntrySchema = z.object({
  sourceUrl: z.string(),
  productName: z.string(),
  reason: z.string(),
  vendorKey: z.string(),
});

function main() {
  const knownFamilies = new Set(db.select({ key: families.key }).from(families).all().map((f) => f.key));

  const files = readdirSync("data/tagged").filter((f) => f.endsWith(".json"));
  let updated = 0;
  let skippedUnknownFamily = 0;
  let skippedBadStyleTag = 0;
  let skippedAlreadyReviewed = 0;
  let rejectedWritten = 0;
  let partsFlippedToRejected = 0;
  const now = Date.now();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(`data/tagged/${file}`, "utf-8"));

    if (file.endsWith("-rejected.json")) {
      for (const entry of raw) {
        const parsed = RejectedEntrySchema.safeParse(entry);
        if (!parsed.success) continue;
        const r = parsed.data;
        // Idempotency: don't write a duplicate row if this exact source URL
        // was already recorded as rejected in a previous run.
        const alreadyRejected = db.select().from(rejectedParts).where(eq(rejectedParts.sourceUrl, r.sourceUrl)).get();
        if (!alreadyRejected) {
          db.insert(rejectedParts)
            .values({
              id: nanoid(),
              vendorKey: r.vendorKey,
              sourceUrl: r.sourceUrl,
              productName: r.productName,
              reason: r.reason,
              rawPayload: toJsonColumn({}),
              createdAt: now,
            })
            .run();
          rejectedWritten++;
        }
        // The rejected_parts row above is the audit trail, but the matching
        // `parts` row (created by ingest.ts as a pending placeholder) was
        // never being updated -- it stayed at reviewState:'pending' with
        // the placeholder evidence forever, indistinguishable from a part
        // that was simply never looked at. Flip it to 'rejected' here,
        // same "never overwrite a human review decision" guard as the
        // tagged-entry path below: only touch parts still genuinely pending.
        const existingRejected = db.select().from(parts).where(eq(parts.sourceUrl, r.sourceUrl)).get();
        if (existingRejected && existingRejected.reviewState === "pending") {
          db.update(parts)
            .set({ reviewState: "rejected", evidence: `rejected during tagging: ${r.reason}`, updatedAt: now })
            .where(eq(parts.id, existingRejected.id))
            .run();
          partsFlippedToRejected++;
        }
      }
      continue;
    }

    for (const entry of raw) {
      const parsed = TaggedEntrySchema.safeParse(entry);
      if (!parsed.success) {
        console.error(`Zod validation failed for an entry in ${file}: ${parsed.error.message}`);
        continue;
      }
      const t = parsed.data;

      if (!knownFamilies.has(t.family)) {
        skippedUnknownFamily++;
        console.warn(`Unknown family '${t.family}' for ${t.sourceUrl} -- skipped, not imported.`);
        continue;
      }

      const styleTags = (t.attributes.styleTags as string[] | undefined) ?? [];
      const badTags = styleTags.filter((s) => !isStyleTag(s));
      if (badTags.length > 0) {
        skippedBadStyleTag++;
        console.warn(`Style tags outside controlled vocabulary for ${t.sourceUrl}: ${badTags.join(", ")} -- skipped.`);
        continue;
      }

      const existing = db.select().from(parts).where(eq(parts.sourceUrl, t.sourceUrl)).get();
      if (!existing) {
        console.warn(`No placeholder part for ${t.sourceUrl} -- run scripts/ingest.ts first. Skipped.`);
        continue;
      }
      // Never overwrite a human review decision. Re-running the tagger (e.g.
      // after fixing a tagging-rule gap) must not silently reset an already
      // approved/rejected part back to pending -- that would erase real
      // review work, not just re-tag an unprocessed one.
      if (existing.reviewState !== "pending") {
        skippedAlreadyReviewed++;
        continue;
      }

      db.update(parts)
        .set({
          category: t.category,
          family: t.family,
          name: t.name,
          attributes: toJsonColumn(t.attributes),
          specSource: t.specSource,
          confidence: t.confidence,
          evidence: t.evidence,
          reviewState: "pending",
          updatedAt: now,
        })
        .where(eq(parts.id, existing.id))
        .run();
      updated++;
    }
  }

  console.log(`Updated ${updated} parts to pending with real tags.`);
  console.log(`Skipped ${skippedUnknownFamily} (unknown family), ${skippedBadStyleTag} (bad style tag), ${skippedAlreadyReviewed} (already approved/rejected -- review decision preserved).`);
  console.log(`Wrote ${rejectedWritten} rows to rejected_parts, flipped ${partsFlippedToRejected} parts rows to reviewState:'rejected'.`);
}

main();
sqlite.close();
