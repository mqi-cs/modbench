// Assigns a drawable silhouette to every approved part in the five
// illustrated categories, from the vendors' own words.
//
// The rollout audit found the search vocabulary cannot answer "what shape
// is this" -- 55% of hands carried only colour tags, crowns and chapter
// rings carried none at all. This mines names and body_html for FORM, the
// same way Phase 2 mined fitment, and writes the result to
// attributes.shapeTag.
//
// Parts with no evidence take the documented fallback for their category
// and are written to data/fixtures/shape-fallbacks.json, so the set stays
// auditable if a silhouette classifier is ever built.
//
//   pnpm backfill-shapes [--dry-run]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import { fromJsonColumn } from "../lib/db/json";
import { SHAPE_FALLBACK, matchShape, shapeFromStyleTags, shapesFor, type ShapeCategory } from "../lib/preview/shape-vocabulary";

const CATEGORIES: ShapeCategory[] = ["hands", "crown", "chapter_ring", "bezel_insert", "strap"];
const FEEDS = ["namokimods", "luciusatelier", "dlwwatches", "watchandstyle"];

/** Vendor description text, keyed by the product handle in the source URL. */
function loadBodies(): Map<string, string> {
  const out = new Map<string, string>();
  for (const vendor of FEEDS) {
    const file = `data/raw/${vendor}-2026-08-31.json`;
    if (!existsSync(file)) continue;
    const feed = JSON.parse(readFileSync(file, "utf-8"));
    for (const product of feed.products ?? feed) {
      out.set(String(product.handle), String(product.body_html ?? "").replace(/<[^>]+>/g, " "));
    }
  }
  return out;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const bodies = loadBodies();
  const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const targets = approved.filter((p) => CATEGORIES.includes(p.category as ShapeCategory));

  const updates: { id: string; attributes: string }[] = [];
  const fallbacks: { id: string; category: string; name: string; assigned: string }[] = [];
  const counts: Record<string, Record<string, number>> = {};

  for (const part of targets) {
    const category = part.category as ShapeCategory;
    const handle = (part.sourceUrl || "").split("/products/")[1]?.split(/[?#]/)[0] ?? "";
    // Straps match on the NAME only. Vendors name them unusually
    // explicitly ("Oyster Bracelet 20/16mm", "Full Grain Cowhide Leather
    // Strap"), and the body copy does the opposite -- leather listings
    // that mention "bracelet" in passing were being classified as metal
    // bracelets and drawn with links.
    const text = category === "strap" ? part.name : `${part.name} ${bodies.get(handle) ?? ""}`;
    const attributes = fromJsonColumn<Record<string, unknown>>(part.attributes);
    const styleTags = Array.isArray(attributes.styleTags) ? (attributes.styleTags as string[]) : [];
    // A reviewed tag beats raw text; raw text beats nothing.
    const matched = shapeFromStyleTags(styleTags, category) ?? matchShape(text, category);
    const shapeTag = matched ?? SHAPE_FALLBACK[category];
    if (!matched) fallbacks.push({ id: part.id, category, name: part.name, assigned: shapeTag });

    counts[category] ??= {};
    counts[category]![shapeTag] = (counts[category]![shapeTag] ?? 0) + 1;

    updates.push({ id: part.id, attributes: JSON.stringify({ ...attributes, shapeTag }) });
  }

  for (const category of CATEGORIES) {
    const total = targets.filter((p) => p.category === category).length;
    const fb = fallbacks.filter((f) => f.category === category).length;
    console.log(`\n${category}  (${total} approved, ${shapesFor(category).length} shapes defined)`);
    for (const [shape, n] of Object.entries(counts[category] ?? {}).sort((a, b) => b[1] - a[1])) {
      const isFallback = shape === SHAPE_FALLBACK[category];
      console.log(`   ${String(n).padStart(4)}  ${shape}${isFallback ? "   <- also the fallback for this category" : ""}`);
    }
    console.log(`   fallback assigned to ${fb} / ${total} (${((fb / total) * 100).toFixed(1)}%)`);
  }

  // Every shape must be reachable, or the art for it is dead code.
  const unused = CATEGORIES.flatMap((c) => shapesFor(c).map((s) => s.id)).filter(
    (id) => !Object.values(counts).some((byShape) => byShape[id]),
  );
  if (unused.length > 0) console.warn(`\nWARN: ${unused.length} shapes match no part: ${unused.join(", ")}`);
  else console.log(`\nEvery defined shape matches at least one part.`);

  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  const update = sqlite.prepare("UPDATE parts SET attributes = ?, updated_at = ? WHERE id = ?");
  const now = Date.now();
  sqlite.transaction((batch: typeof updates) => {
    for (const u of batch) update.run(u.attributes, now, u.id);
  })(updates);

  writeFileSync(
    "data/fixtures/shape-fallbacks.json",
    JSON.stringify(
      { generatedAt: new Date().toISOString(), note: "Parts with no shape evidence in the vendor's own words. Each took its category's documented fallback.", fallbacks: fallbacks.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nWrote shapeTag on ${updates.length} parts.`);
  console.log(`Logged ${fallbacks.length} fallbacks to data/fixtures/shape-fallbacks.json.`);
}

main();
