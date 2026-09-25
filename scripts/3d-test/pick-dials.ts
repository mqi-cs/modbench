// TEMPORARY -- 3D layered-preview prototype. Not wired into the app.
//
// Chooses the dials for a render batch and writes out/plan-dials.json.
// Layers are per *look*, not per listing, so the batch takes a spread of
// colour classes rather than the first N rows: black, plain, blue,
// sunburst, white, green, grey, silver. Only dials with a prepared asset
// are eligible, because the dial layer is the vendor's own photograph.
//
//   npx tsx scripts/3d-test/pick-dials.ts

import { writeFileSync } from "node:fs";
import Database from "better-sqlite3";

const COL = ["black", "white", "cream", "blue", "green", "red", "orange", "brown", "grey", "silver-tone", "gold-tone", "sunburst"];
/** colour class -> how many dials of that class to include */
const WANT: [string, number][] = [
  ["black", 4], ["plain", 4], ["blue", 3], ["blue+sunburst", 2], ["white", 3],
  ["green", 2], ["green+sunburst", 1], ["grey", 2], ["silver-tone", 2], ["black+sunburst", 1],
];

const db = new Database("data/modbench.db", { readonly: true });
const rows = db
  .prepare("select id, name, attributes from parts where category='dial' and review_state='approved' and asset_state='ready' order by name")
  .all() as { id: string; name: string; attributes: string }[];

const byClass: Record<string, typeof rows> = {};
for (const r of rows) {
  const tags = (JSON.parse(r.attributes || "{}").styleTags ?? []).filter((t: string) => COL.includes(t));
  const key = tags.sort().join("+") || "plain";
  (byClass[key] ??= []).push(r);
}

const picked = WANT.flatMap(([cls, n]) => (byClass[cls] ?? []).slice(0, n).map((r) => ({ id: r.id, name: r.name, cls })))
  .map((p, i) => ({ ...p, tag: `d${String(i + 1).padStart(2, "0")}` }));

writeFileSync("scripts/3d-test/out/plan-dials.json", JSON.stringify(picked, null, 1));
console.log(`${picked.length} dials -> out/plan-dials.json`);
for (const p of picked) console.log(`  ${p.tag}  ${p.cls.padEnd(14)} ${p.name}`);
