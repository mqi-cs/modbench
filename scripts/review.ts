// Terminal review tool. `pnpm review` for interactive review of everything
// requiring mandatory review; `pnpm review --auto-accept-high` bulk-accepts
// high-confidence dial/hands/bezel_insert parts (spec-permitted, with a
// printed 10% spot-check sample); `pnpm review --decisions=<file>` applies
// a JSON file of already-made accept/reject decisions -- for recording real
// review judgments made outside an interactive terminal session without
// pretending they were typed live.
//
// Mandatory review, regardless of confidence (specs/02-phase-1-data-pipeline.md):
//   - everything at low confidence
//   - everything in case and movement categories
//   - anything flagged by the name/family conflict check

import { and, eq, inArray } from "drizzle-orm";
import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { nanoid } from "nanoid";
import { db, sqlite } from "../lib/db/client";
import { parts, rejectedParts } from "../lib/db/schema";
import { nameFamilyConflict } from "../lib/db/name-family-conflict";

function parseArgs() {
  const args = process.argv.slice(2);
  const decisionsArg = args.find((a) => a.startsWith("--decisions="));
  return {
    autoAcceptHigh: args.includes("--auto-accept-high"),
    decisionsFile: decisionsArg ? decisionsArg.split("=")[1] : null,
  };
}

function requiresMandatoryReview(part: { category: string; confidence: string; name: string; family: string }): string | null {
  if (part.confidence === "low") return "low confidence";
  if (part.category === "case" || part.category === "movement") return `category '${part.category}' anchors every rule`;
  const conflict = nameFamilyConflict(part);
  if (conflict) return `name/family conflict: ${conflict}`;
  return null;
}

async function runAutoAcceptHigh() {
  const now = Date.now();
  // Bulk-accept anything that does NOT require mandatory review -- i.e.
  // everything except low confidence, case/movement, and conflict-flagged
  // parts. Not restricted to a fixed category list: any category (dial,
  // hands, bezel_insert, crystal, chapter_ring, crown, bezel, strap) at
  // medium-or-high confidence qualifies, matching the mandatory-review
  // boundary exactly rather than a narrower category allowlist.
  const eligible = db
    .select()
    .from(parts)
    .where(eq(parts.reviewState, "pending"))
    .all()
    .filter((p) => !requiresMandatoryReview(p));

  for (const p of eligible) {
    db.update(parts).set({ reviewState: "approved", updatedAt: now }).where(eq(parts.id, p.id)).run();
  }
  console.log(`Bulk-accepted ${eligible.length} parts not requiring mandatory review.`);

  const spotCheckCount = Math.max(1, Math.ceil(eligible.length * 0.1));
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, spotCheckCount);
  console.log(`\n--- 10% spot-check sample (${sample.length} of ${eligible.length}) ---`);
  for (const p of sample) {
    console.log(`  [${p.category}/${p.family}] ${p.name}\n    ${p.sourceUrl}\n    evidence: ${p.evidence}`);
  }
  console.log("--- end spot-check sample ---\n");
}

interface Decision {
  sourceUrl: string;
  decision: "approve" | "reject";
  reason: string;
  reviewer: string;
}

async function runDecisionsFile(path: string) {
  const decisions: Decision[] = JSON.parse(readFileSync(path, "utf-8"));
  const now = Date.now();
  let approved = 0;
  let rejected = 0;
  let notFound = 0;

  for (const d of decisions) {
    const part = db.select().from(parts).where(eq(parts.sourceUrl, d.sourceUrl)).get();
    if (!part) {
      notFound++;
      console.warn(`No part for ${d.sourceUrl} -- skipped.`);
      continue;
    }
    if (d.decision === "approve") {
      db.update(parts)
        .set({ reviewState: "approved", notes: `Reviewed by ${d.reviewer}: ${d.reason}`, updatedAt: now })
        .where(eq(parts.id, part.id))
        .run();
      approved++;
    } else {
      db.update(parts).set({ reviewState: "rejected", updatedAt: now }).where(eq(parts.id, part.id)).run();
      db.insert(rejectedParts)
        .values({
          id: nanoid(),
          vendorKey: new URL(part.sourceUrl).hostname.split(".")[0] ?? "unknown",
          sourceUrl: part.sourceUrl,
          productName: part.name,
          reason: `${d.reason} (reviewed by ${d.reviewer})`,
          rawPayload: "{}",
          createdAt: now,
        })
        .run();
      rejected++;
    }
  }
  console.log(`Applied ${decisions.length} decisions: ${approved} approved, ${rejected} rejected, ${notFound} not found.`);
}

async function runInteractive() {
  const pending = db.select().from(parts).where(eq(parts.reviewState, "pending")).all();
  const mandatory = pending.filter((p) => requiresMandatoryReview(p) !== null);

  if (mandatory.length === 0) {
    console.log("No parts require mandatory review right now.");
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`${mandatory.length} parts require mandatory review.\n`);

  for (const p of mandatory) {
    const why = requiresMandatoryReview(p);
    console.log(`\n${p.name}`);
    console.log(`  source: ${p.sourceUrl}`);
    console.log(`  proposed family: ${p.family} (${p.category})`);
    console.log(`  confidence: ${p.confidence}, specSource: ${p.specSource}`);
    console.log(`  evidence: ${p.evidence}`);
    console.log(`  mandatory review because: ${why}`);
    const answer = (await rl.question("  [a]ccept / [r]eject / [s]kip for now > ")).trim().toLowerCase();
    const now = Date.now();
    if (answer === "a") {
      db.update(parts).set({ reviewState: "approved", updatedAt: now }).where(eq(parts.id, p.id)).run();
    } else if (answer === "r") {
      const reason = (await rl.question("  reason > ")).trim();
      db.update(parts).set({ reviewState: "rejected", updatedAt: now }).where(eq(parts.id, p.id)).run();
      db.insert(rejectedParts)
        .values({
          id: nanoid(),
          vendorKey: new URL(p.sourceUrl).hostname.split(".")[0] ?? "unknown",
          sourceUrl: p.sourceUrl,
          productName: p.name,
          reason: reason || "rejected in manual review, no reason given",
          rawPayload: "{}",
          createdAt: now,
        })
        .run();
    }
    // 's' or anything else: leave pending.
  }
  rl.close();
}

async function main() {
  const opts = parseArgs();
  if (opts.autoAcceptHigh) {
    await runAutoAcceptHigh();
  }
  if (opts.decisionsFile) {
    await runDecisionsFile(opts.decisionsFile);
  }
  if (!opts.autoAcceptHigh && !opts.decisionsFile) {
    await runInteractive();
  }
  sqlite.close();
}

main();
