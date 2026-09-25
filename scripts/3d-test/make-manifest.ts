// TEMPORARY -- 3D proof of concept. Not wired into anything; delete
// scripts/3d-test/ when the question is answered.
//
// Writes out/layers/manifest.json: what the layered demo can show, which
// layer file each option maps to, and how much of the catalog each option
// covers. The page reads only this, so later batches extend the manifest
// instead of editing the page.
//
//   npx tsx scripts/3d-test/make-manifest.ts

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3";

const OUT = "scripts/3d-test/out/layers";
const db = new Database("data/modbench.db", { readonly: true });

const COL = ["black", "white", "cream", "blue", "green", "red", "orange", "brown", "grey", "silver-tone", "gold-tone", "rose-gold", "sunburst", "matte", "polished", "brushed"];
type Row = { attributes: string };
const cls = (a: string) => {
  const t = (JSON.parse(a || "{}").styleTags ?? []).filter((x: string) => COL.includes(x));
  return { shape: JSON.parse(a || "{}").shapeTag ?? "", cols: t.sort().join("+") };
};

/** How many approved listings in a category match a predicate. */
function count(category: string, pred: (c: { shape: string; cols: string }) => boolean) {
  const rows = db.prepare("select attributes from parts where category=? and review_state='approved'").all(category) as Row[];
  return { n: rows.filter((r) => pred(cls(r.attributes))).length, total: rows.length };
}

const has = (f: string) => existsSync(`${OUT}/${f}-hero.webp`) || existsSync(`${OUT}/${f}-hero.png`);

const dials = JSON.parse(readFileSync("scripts/3d-test/out/plan-dials.json", "utf8")) as { id: string; name: string; cls: string; tag: string }[];
const dialTotal = (db.prepare("select count(*) n from parts where category='dial' and review_state='approved'").get() as { n: number }).n;

const first = dials[0];
if (!first) throw new Error("no dials in plan-dials.json -- run pick-dials.ts first");

const slots = [
  {
    key: "case", label: "Case finish",
    options: [
      { key: "steel", file: "case-steel", label: "Steel", cover: count("case", (c) => /silver-tone|polished|brushed/.test(c.cols) || c.cols === "") },
      { key: "pvd", label: "PVD black", file: "case-pvd", cover: count("case", (c) => c.cols === "black") },
      { key: "matte", label: "Matte black", file: "case-matte", cover: count("case", (c) => /matte/.test(c.cols)) },
      { key: "gold", label: "Gold tone", file: "case-gold", cover: count("case", (c) => c.cols === "gold-tone") },
      { key: "rose", label: "Rose gold", file: "case-rose", cover: count("case", (c) => /rose-gold/.test(c.cols)) },
    ],
  },
  {
    key: "dial", label: "Dial",
    options: dials.map((d) => ({ key: d.tag, file: `dial-${d.tag}`, label: d.name.replace(/^(Watch )?Dial:?\s*/i, "").slice(0, 38), cover: { n: 1, total: dialTotal } })),
  },
  {
    key: "ring", label: "Chapter ring",
    options: [
      { key: "ring-white", file: "ring-white", label: "White marks", cover: count("chapter_ring", (c) => c.shape === "ring-plain") },
      { key: "ring-gold", file: "ring-gold", label: "Gold marks", cover: { n: 0, total: 378 } },
      { key: "ring-cream", file: "ring-cream", label: "Cream marks", cover: { n: 0, total: 378 } },
    ],
  },
  {
    key: "hands", label: "Hands (sword)",
    options: [
      { key: "steel", file: "hands-steel", label: "Steel", cover: count("hands", (c) => c.shape === "hand-sword" && /silver-tone|polished/.test(c.cols)) },
      { key: "gold", file: "hands-gold", label: "Gold", cover: count("hands", (c) => c.shape === "hand-sword" && /gold-tone/.test(c.cols)) },
      { key: "rose", file: "hands-rose", label: "Rose gold", cover: count("hands", (c) => c.shape === "hand-sword" && /rose-gold/.test(c.cols)) },
      { key: "black", file: "hands-black", label: "Black", cover: count("hands", (c) => c.shape === "hand-sword" && /black/.test(c.cols)) },
    ],
  },
  {
    key: "insert", label: "Bezel insert (dive)",
    options: [
      { key: "ins-black", file: "insert-ins-black", label: "Black / white", cover: count("bezel_insert", (c) => c.shape === "insert-dive" && (c.cols === "black" || c.cols === "")) },
      { key: "ins-blue", file: "insert-ins-blue", label: "Navy / white", cover: count("bezel_insert", (c) => c.shape === "insert-dive" && /blue/.test(c.cols)) },
      { key: "ins-gold", file: "insert-ins-gold", label: "Black / gold", cover: count("bezel_insert", (c) => c.shape === "insert-dive" && /gold/.test(c.cols)) },
      { key: "ins-steel", file: "insert-ins-steel", label: "Steel / black", cover: count("bezel_insert", (c) => c.shape === "insert-dive" && /silver-tone/.test(c.cols)) },
    ],
  },
  {
    key: "strap", label: "Strap",
    options: [
      { key: "jubilee", file: "strap-jubilee", label: "Jubilee", cover: count("strap", (c) => c.shape === "strap-jubilee") },
      { key: "oyster", file: "strap-oyster", label: "Oyster", cover: count("strap", (c) => c.shape === "strap-oyster") },
      { key: "mesh", file: "strap-mesh", label: "Mesh", cover: count("strap", (c) => c.shape === "strap-bracelet") },
      { key: "nato", file: "strap-nato", label: "NATO", cover: count("strap", (c) => c.shape === "strap-nato") },
      { key: "rubber-black", file: "strap-rubber-black", label: "Rubber black", cover: count("strap", (c) => c.shape === "strap-band" && (c.cols === "black" || c.cols === "")) },
      { key: "rubber-blue", file: "strap-rubber-blue", label: "Rubber blue", cover: count("strap", (c) => c.shape === "strap-band" && /blue/.test(c.cols)) },
      { key: "rubber-green", file: "strap-rubber-green", label: "Rubber green", cover: count("strap", (c) => c.shape === "strap-band" && /green/.test(c.cols)) },
      { key: "leather-black", file: "strap-leather-black", label: "Leather black", cover: { n: 0, total: 252 } },
      { key: "leather-brown", file: "strap-leather-brown", label: "Leather brown", cover: count("strap", (c) => c.shape === "strap-band" && /brown/.test(c.cols)) },
    ],
  },
];

// Keep only options whose layer actually rendered.
for (const s of slots) s.options = s.options.filter((o) => has(o.file));

const manifest = {
  built: new Date().toISOString().slice(0, 16).replace("T", " "),
  views: ["hero", "top"],
  order: ["case", "dial", "ring", "hands", "insert", "strap"],
  // Pair rendered for the hero view only: the junction it fixes is barely
  // visible from straight above.
  pair: { slots: ["case", "strap"], prefix: "casestrap", views: ["hero"] },
  slots,
  presets: [
    { name: "SKX classic", case: "steel", dial: first.tag, ring: "ring-white", hands: "steel", insert: "ins-black", strap: "jubilee" },
    { name: "Blue diver", case: "steel", dial: dials.find((d) => d.cls.startsWith("blue"))?.tag, ring: "ring-white", hands: "steel", insert: "ins-blue", strap: "oyster" },
    { name: "Blacked out", case: "pvd", dial: (dials[2] ?? first).tag, ring: "ring-gold", hands: "gold", insert: "ins-gold", strap: "rubber-black" },
    { name: "Gold dress", case: "gold", dial: dials.find((d) => d.cls === "white")?.tag, ring: "ring-cream", hands: "gold", insert: "ins-steel", strap: "leather-brown" },
  ],
};

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
const n = slots.reduce((a, s) => a * s.options.length, 1);
console.log(`manifest: ${slots.map((s) => `${s.key} ${s.options.length}`).join(", ")} → ${n.toLocaleString()} combinations`);
