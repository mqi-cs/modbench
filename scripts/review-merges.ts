// The human gate between a merge CANDIDATE and an actual merge.
//
// scripts/merge-parts.ts is the one hand-authored merge this project has
// done, and the standard it set stays: a person judges each one, the
// reason is written down, and both source URLs are retained. This script
// changes who supplies the candidates, not who decides.
//
// Accepting runs the same mechanics merge-parts.ts does -- move listings,
// write part_merges with an attribute snapshot, delete the duplicate row
// -- so verify-catalog.ts's conflicting-attributes check covers merges
// made here exactly as it covers that one.
//
//   pnpm review-merges                      list what is waiting
//   pnpm review-merges show <id>            everything known about one
//   pnpm review-merges accept <id> <canonical-part-id> "reason"
//   pnpm review-merges reject <id> "reason"

import { existsSync, rmSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, sqlite } from "../lib/db/client";
import { familyExceptions, listings, mergeCandidates, partHashes, parts, vendors } from "../lib/db/schema";
import { fromJsonColumn } from "../lib/db/json";

function candidate(id: string) {
  const row = db.select().from(mergeCandidates).where(eq(mergeCandidates.id, id)).get();
  if (!row) {
    console.error(`No candidate ${id}.`);
    process.exit(1);
  }
  return row;
}

function partsOf(row: { partIds: string }) {
  const ids = JSON.parse(row.partIds) as string[];
  return db.select().from(parts).where(inArray(parts.id, ids)).all();
}

function list() {
  const rows = db.select().from(mergeCandidates).where(eq(mergeCandidates.status, "pending")).all();
  if (rows.length === 0) {
    console.log("Nothing pending.");
    return;
  }
  console.log(`${rows.length} pending candidate(s):\n`);
  for (const row of rows) {
    const named = partsOf(row);
    const flags = [
      row.phashDistance === null ? "no image comparison" : `images ${row.phashDistance}/256`,
      `colour ${row.colourAgreement ?? "?"}`,
      `via ${row.source}`,
    ];
    console.log(`  ${row.id}   ${flags.join("  |  ")}`);
    for (const p of named) console.log(`      ${p.category.padEnd(13)} ${p.name}`);
    if (row.note) console.log(`      note: ${row.note}`);
    console.log();
  }
  console.log("pnpm review-merges show <id>   for the full picture.");
}

function show(id: string) {
  const row = candidate(id);
  const named = partsOf(row);
  console.log(`Candidate ${row.id}  [${row.status}]`);
  console.log(`  submitted ${new Date(row.createdAt).toISOString()}  via ${row.source}`);
  console.log(`  images: ${row.phashDistance === null ? "not comparable (no prepared asset on one side)" : `${row.phashDistance}/256`}`);
  console.log(`  colour tags: ${row.colourAgreement ?? "unknown"}`);
  if (row.note) console.log(`  submitter: ${row.note}`);
  console.log(`\n  Parts claimed to be one:`);
  const vendorKey = new Map(db.select().from(vendors).all().map((v) => [v.id, v.key]));
  for (const p of named) {
    const ls = db.select().from(listings).where(eq(listings.partId, p.id)).all();
    console.log(`\n    ${p.id}  ${p.name}`);
    console.log(`      category ${p.category}   family ${p.family}   ${p.specSource}/${p.confidence}`);
    console.log(`      ${p.sourceUrl}`);
    for (const l of ls) console.log(`      listing: ${vendorKey.get(l.vendorId) ?? "?"}  ${l.currency} ${(l.priceMinor / 100).toFixed(2)}  ${l.sourceUrl}`);
    console.log(`      attributes: ${JSON.stringify(fromJsonColumn(p.attributes))}`);
  }

  // The thing a reviewer most needs and is least likely to compute by
  // hand: where the two parts' recorded facts actually disagree.
  if (named.length >= 2) {
    const keys = [...new Set(named.flatMap((p) => Object.keys(fromJsonColumn<Record<string, unknown>>(p.attributes))))];
    const conflicts: string[] = [];
    for (const k of keys) {
      const values = named.map((p) => JSON.stringify(fromJsonColumn<Record<string, unknown>>(p.attributes)[k] ?? null));
      const distinct = [...new Set(values.filter((v) => v !== "null" && v !== "[]"))];
      if (distinct.length > 1) conflicts.push(`      ${k}: ${distinct.join("  vs  ")}`);
    }
    console.log(`\n  Attribute conflicts:`);
    console.log(conflicts.length ? conflicts.join("\n") : "      none — every recorded attribute agrees or is absent on one side");
  }
  const unresolved = JSON.parse(row.unresolvedUrls) as string[];
  if (unresolved.length) console.log(`\n  Submitted but unresolved: ${unresolved.join(", ")}`);
  console.log(`\n  pnpm review-merges accept ${row.id} <canonical-part-id> "reason"`);
}

function accept(id: string, canonicalId: string, reason: string) {
  const row = candidate(id);
  if (row.status !== "pending") {
    console.error(`Candidate ${id} is already ${row.status}.`);
    process.exit(1);
  }
  if (!reason || reason.trim().length < 20) {
    console.error("A reason is required, and it has to say why a human judged these the same physical part.");
    process.exit(1);
  }
  const named = partsOf(row);
  const canonical = named.find((p) => p.id === canonicalId);
  if (!canonical) {
    console.error(`${canonicalId} is not one of this candidate's parts: ${named.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }

  const now = Date.now();
  let merged = 0;
  const insertMerge = sqlite.prepare(
    "INSERT INTO part_merges (id, canonical_part_id, merged_part_name, merged_source_url, merged_vendor_key, merged_attributes, reason, created_at) VALUES (?,?,?,?,?,?,?,?)",
  );

  sqlite.transaction(() => {
    for (const dupe of named) {
      if (dupe.id === canonical.id) continue;
      for (const l of db.select().from(listings).where(eq(listings.partId, dupe.id)).all()) {
        db.update(listings).set({ partId: canonical.id }).where(eq(listings.id, l.id)).run();
      }
      insertMerge.run(
        nanoid(),
        canonical.id,
        dupe.name,
        dupe.sourceUrl,
        new URL(dupe.sourceUrl).hostname.split(".")[0] ?? "unknown",
        dupe.attributes,
        `${reason.trim()} [reviewed from merge candidate ${row.id}; submitter note: ${row.note ?? "none"}]`,
        now,
      );
      // Rows that hang off the duplicate and must go with it. Both are
      // derived, not source data: a perceptual hash is recomputed by
      // backfill-phash, and a family exception describes a part row that
      // is about to stop existing. Without this the FOREIGN KEY on
      // part_hashes fails and the whole merge rolls back.
      db.delete(partHashes).where(eq(partHashes.partId, dupe.id)).run();
      // And the prepared preview asset, which is keyed by part id and
      // would otherwise be left on disk with nothing pointing at it --
      // verify-catalog's orphaned-asset check catches exactly this.
      const asset = `public/assets/${dupe.category}/${dupe.id}.webp`;
      if (existsSync(asset)) rmSync(asset);
      db.delete(familyExceptions).where(eq(familyExceptions.partId, dupe.id)).run();
      db.delete(parts).where(eq(parts.id, dupe.id)).run();
      console.log(`Merged "${dupe.name}" into ${canonical.name}.`);
      merged++;
    }
    db.update(mergeCandidates)
      .set({ status: "accepted", reviewerNote: reason.trim(), reviewedAt: now })
      .where(eq(mergeCandidates.id, row.id))
      .run();
  })();

  console.log(`\n${merged} part(s) merged. Run \`pnpm verify-catalog\` -- the conflicting-attributes check covers this.`);
}

function reject(id: string, reason: string) {
  const row = candidate(id);
  db.update(mergeCandidates)
    .set({ status: "rejected", reviewerNote: reason.trim() || null, reviewedAt: Date.now() })
    .where(eq(mergeCandidates.id, row.id))
    .run();
  console.log(`Rejected ${row.id}. Nothing was merged.`);
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "list") list();
else if (command === "show") show(rest[0]!);
else if (command === "accept") accept(rest[0]!, rest[1]!, rest.slice(2).join(" "));
else if (command === "reject") reject(rest[0]!, rest.slice(1).join(" "));
else {
  console.error(`Unknown command "${command}".`);
  process.exit(1);
}
sqlite.close();
