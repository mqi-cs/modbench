// Fills parts.attributes.styleTags from the controlled vocabulary.
//
// specs/07-phase-6-nl-image-input.md assumes a styleTags vocabulary
// already exists. It does not: the column is on every dial, hand set and
// bezel insert and is an empty array on all of them, because no earlier
// pass had a reason to fill it. Without this, a natural-language query
// resolves to constraints that match nothing, which is indistinguishable
// from "no such parts" and is the worst possible failure for a feature
// whose whole job is to find things.
//
// Deterministic, from evidence in the vendor's own listing name. Same
// approach as the Phase 2 body_html mining, and for the same reason: a
// tag that cannot be traced back to something a vendor wrote is a guess,
// and lib/compat's no-false-positives rule applies to anything that
// steers a recommendation.
//
//   pnpm backfill-style-tags [--dry-run]

import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import { fromJsonColumn } from "../lib/db/json";
import { tagsFromName, STYLE_TAGS, TAG_NAMES } from "../lib/style-vocabulary";

const TAGGABLE = ["dial", "hands", "bezel_insert"];

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const targets = approved.filter((p) => TAGGABLE.includes(p.category));

  const updates: { id: string; attributes: string; tags: string[] }[] = [];
  const tagCounts: Record<string, number> = {};
  let untagged = 0;

  for (const part of targets) {
    const tags = tagsFromName(part.name, part.category);
    if (tags.length === 0) untagged++;
    for (const tag of tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    const attributes = fromJsonColumn<Record<string, unknown>>(part.attributes);
    updates.push({ id: part.id, attributes: JSON.stringify({ ...attributes, styleTags: tags }), tags });
  }

  const perPart = updates.reduce((sum, u) => sum + u.tags.length, 0) / Math.max(1, updates.length);
  console.log(`${targets.length} taggable parts, ${perPart.toFixed(1)} tags each on average, ${untagged} with none.\n`);

  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sorted) {
    console.log(`  ${String(count).padStart(4)}  ${tag}`);
  }

  // A tag nothing carries is worse than no tag: a query using it returns
  // nothing, and the user cannot tell that from "no such parts exist".
  const unused = TAG_NAMES.filter((t) => !tagCounts[t]);
  if (unused.length > 0) {
    console.warn(`\nWARN: ${unused.length} vocabulary tags match no part and would silently return nothing: ${unused.join(", ")}`);
  } else {
    console.log(`\nEvery one of the ${TAG_NAMES.length} vocabulary tags matches at least one part.`);
  }

  if (dryRun) {
    console.log("\nDry run: no rows updated.");
    return;
  }
  const update = sqlite.prepare("UPDATE parts SET attributes = ?, updated_at = ? WHERE id = ?");
  const now = Date.now();
  const applyAll = sqlite.transaction((batch: typeof updates) => {
    for (const u of batch) update.run(u.attributes, now, u.id);
  });
  applyAll(updates);
  console.log(`\nUpdated styleTags on ${updates.length} parts (${STYLE_TAGS.length} tags in the vocabulary).`);
}

main();
