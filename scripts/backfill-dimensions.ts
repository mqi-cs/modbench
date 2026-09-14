// Mines real, per-part millimetre dimensions out of the vendors' own
// listing text and writes them to attributes.renderMm.
//
// The rollout drew every part at a platform constant. The dimension audit
// found that was a decision made against the parsed `attributes` columns
// rather than against the feed text -- the numbers are stated in
// body_html for a sizeable minority of parts, and where they are stated
// they disagree with the constants (see lib/preview/dimensions.ts).
//
// Display only. Nothing in lib/compat reads attributes.renderMm, and
// attributes.lengthSetMm is deliberately left alone: hand-stack-clearance
// keys off that field, and a length parsed from prose is good enough to
// draw with but not to assert a fit from.
//
//   pnpm backfill-dimensions [--dry-run]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import { fromJsonColumn } from "../lib/db/json";
import { parseDimensions, isEmpty, type RenderMm } from "../lib/preview/dimensions";

const CATEGORIES = ["bezel_insert", "chapter_ring", "crown", "hands"] as const;
const FEEDS = ["namokimods", "luciusatelier", "dlwwatches", "watchandstyle"];

function loadBodies(): Map<string, string> {
  const out = new Map<string, string>();
  for (const vendor of FEEDS) {
    const file = `data/raw/${vendor}-2026-08-31.json`;
    if (!existsSync(file)) continue;
    const feed = JSON.parse(readFileSync(file, "utf-8"));
    for (const product of feed.products ?? feed) {
      out.set(String(product.handle), String(product.body_html ?? ""));
    }
  }
  return out;
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const bodies = loadBodies();
  const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  const targets = approved.filter((p) => (CATEGORIES as readonly string[]).includes(p.category));

  const updates: { id: string; attributes: string }[] = [];
  const stats: Record<string, { total: number; stated: number; fields: Record<string, Map<number, number>> }> = {};

  for (const part of targets) {
    const category = part.category;
    stats[category] ??= { total: 0, stated: 0, fields: {} };
    stats[category]!.total++;

    const handle = (part.sourceUrl || "").split("/products/")[1]?.split(/[?#]/)[0] ?? "";
    const text = `${part.name} ${bodies.get(handle) ?? ""}`;
    const renderMm = parseDimensions(category, text);

    const attributes = fromJsonColumn<Record<string, unknown>>(part.attributes);
    // Re-running must be able to REMOVE a value the parse no longer
    // supports, so drop the old key rather than merging over it.
    delete attributes.renderMm;
    if (!isEmpty(renderMm)) {
      attributes.renderMm = renderMm;
      stats[category]!.stated++;
      for (const [k, v] of Object.entries(renderMm) as [keyof RenderMm, number][]) {
        const m = (stats[category]!.fields[k] ??= new Map());
        m.set(v, (m.get(v) ?? 0) + 1);
      }
    }
    updates.push({ id: part.id, attributes: JSON.stringify(attributes) });
  }

  for (const category of CATEGORIES) {
    const s = stats[category];
    if (!s) continue;
    const pct = ((s.stated / s.total) * 100).toFixed(1);
    console.log(`\n${category}  ${s.stated} / ${s.total} state a dimension (${pct}%)`);
    for (const [field, values] of Object.entries(s.fields)) {
      const top = [...values.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`   ${field.padEnd(8)} ${top.map(([v, n]) => `${v}mm x${n}`).join("  ")}`);
    }
  }

  if (dryRun) {
    console.log("\nDry run: nothing written.");
    return;
  }

  const update = sqlite.prepare("UPDATE parts SET attributes = ?, updated_at = ? WHERE id = ?");
  const now = Date.now();
  sqlite.transaction((batch: typeof updates) => {
    for (const u of batch) update.run(u.attributes, now, u.id);
  })(updates);

  const summary = Object.fromEntries(
    CATEGORIES.map((c) => [c, { total: stats[c]?.total ?? 0, stated: stats[c]?.stated ?? 0 }]),
  );
  writeFileSync(
    "data/fixtures/dimension-coverage.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: "Per-part dimensions parsed from vendor listing text. Parts not counted here are drawn at their platform constant. Display only -- no rule in lib/compat reads attributes.renderMm.",
        coverage: summary,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nWrote renderMm on ${Object.values(summary).reduce((a, s) => a + s.stated, 0)} of ${updates.length} parts.`);
}

main();
