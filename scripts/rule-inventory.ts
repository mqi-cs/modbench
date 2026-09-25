// WS1 steps 1-2: the rule inventory and the unknown-rate table, measured
// against the live catalog so every number can be regenerated.
//
//   pnpm rule-inventory   -> writes data/fixtures/rule-inventory.md
//
// Pairwise, not whole-build: each slot pair is every approved part in one
// slot against every approved part in the other, judged only by the rules
// that apply to both -- what the configurator shows when those two are
// the only parts chosen. Rules that look at every slot on their own
// (unverified-part, stock, shipping, family-exception) are reported
// separately, because they say nothing about whether two parts fit.
import { readFileSync, writeFileSync } from "node:fs";
import { RULES } from "../lib/compat/index";
import { familyPlatform } from "../lib/compat/platform";
import type { CatalogPart, Finding, SlotKey } from "../lib/compat/types";
import { buildCatalogSlice, resolveBuild } from "../lib/compat/__tests__/test-catalog";
import { evaluateBuild, VERIFIED_RULES } from "../lib/compat/index";
import { withEvidence } from "../lib/compat/evidence";

type Outcome = "ok" | "warning" | "cant-confirm" | "error";
const OUTCOMES: Outcome[] = ["ok", "warning", "cant-confirm", "error"];

// A warning that exists because data is missing, not because a real
// problem was found. Every such message in lib/compat/rules opens with
// "Can't confirm" or says the value isn't recorded/confirmed.
const CANT_CONFIRM = /^Can't confirm|isn't recorded|isn't confirmed|aren't stated|isn't stated/;

const VAR_SLOT: Record<string, SlotKey> = {
  caseP: "case", insert: "bezelInsert", dial: "dial", movement: "movement", hands: "hands",
  strap: "strap", crystal: "crystal", chapterRing: "chapterRing", bezel: "bezel", crown: "crown",
};

// What each rule really checks, and what decides its error, by the classes
// in data/fixtures/attribute-provenance.md (A/B = vendor-stated per SKU or
// per line, C = external reference or family constant, D = always null).
// "family" means the error is decided by the parts' family tags, whose
// provenance is the part's specSource.
const CHECKS: Record<string, [string, string]> = {
  "movement-case-fit": ["a spare part is not a movement", "family: movement tagged as accessory"],
  "dial-movement-feet": ["chronograph dial vs movement; dial feet present", "family (vk6x) + dial.hasSubdials (C, justified)"],
  "dial-case-diameter": ["dial diameter vs case dial aperture", "dial.diameterMm, case.dialApertureMm (B)"],
  "nh34-hand-stack": ["NH34 hand-post clearance; missing GMT hand", "cannot block"],
  "date-window-alignment": ["date lands under the dial's cutout (movement position + case crown − crown it's sold for)", "dateWindowPosition (A), crownPosition (B), supportedDatePositions (D: never set)"],
  "day-window-presence": ["dial day aperture vs day-date movement", "movement.hasDay (B), dial.hasDayWindow (A)"],
  "insert-case-fit": ["insert and case on the same case line", "family"],
  "crystal-case-fit": ["crystal and case on the same case line", "family"],
  "chapter-ring-fit": ["chapter ring and case on the same case line", "cannot block"],
  "hand-stack-clearance": ["hand length vs chapter ring (no data)", "cannot block"],
  "family-exception": ["per-part vendor exceptions (e.g. Lucius Ultra Thin)", "family_exceptions rows (A, quoted)"],
  "unverified-part": ["flags family-inferred parts", "cannot block"],
  "lume-mismatch": ["lumed hands on unlumed dial or vice versa", "cannot block"],
  "stock-availability": ["out of stock", "cannot block"],
  "multi-vendor-shipping": ["several vendors, several shipments", "cannot block"],
  "bezel-case-fit": ["bezel and case on the same case line", "family"],
  "crown-case-fit": ["crown and case on the same case line", "family"],
  "strap-fit": ["strap lug width = case lug width (warning only); bracelet end-links on the same case line", "end-links: family. Lug width can't block: case.lugWidthMm is class C"],
  "dial-movement-size": ["dial suits the movement's caliber (skeleton NH7x, unknown caliber)", "cannot block"],
  "crown-stem-length": ["stem may need cutting; irreversible (info)", "cannot block"],
  "insert-crystal-profile-fit": ["flat insert vs double-dome crystal", "profile (A)"],
  "dial-case-model-exclusion": ["dial listing names case lines it won't fit", "dial.incompatibleCaseFamilies (A) + case family"],
  "requires-chapter-ring": ["case needs a chapter ring it doesn't include", "case.requiresChapterRing (A)"],
  "bracelet-vendor-scope": ["bracelet fits one maker's cases only", "strap.vendorScopedTo (A) + listing vendor"],
};

const catalog = buildCatalogSlice();
const bySlot = new Map<SlotKey, CatalogPart[]>();
for (const p of Object.values(catalog.parts)) {
  if (!bySlot.has(p.slot)) bySlot.set(p.slot, []);
  bySlot.get(p.slot)!.push(p);
}
const inSlot = (s: SlotKey) => bySlot.get(s) ?? [];
const pct = (n: number, d: number) => (d === 0 ? "–" : `${((100 * n) / d).toFixed(1)}%`);
const has = (v: unknown) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);

function classify(findings: Finding[]): Outcome {
  if (findings.some((f) => f.severity === "error")) return "error";
  const warnings = findings.filter((f) => f.severity === "warning");
  if (warnings.length === 0) return "ok";
  return warnings.every((f) => CANT_CONFIRM.test(f.message)) ? "cant-confirm" : "warning";
}

// ---- static facts per rule, read from its own source -------------------
interface RuleFacts {
  key: string;
  slots: SlotKey[];
  canError: boolean;
  data: string[]; // "slot.attribute (coverage)"
}
const facts: RuleFacts[] = RULES.map((rule) => {
  const src = readFileSync(`lib/compat/rules/${rule.key}.ts`, "utf-8");
  const data = new Set<string>();
  for (const [, v, attr] of src.matchAll(/(\w+)\.attributes\.(\w+)/g)) {
    const slot = VAR_SLOT[v!];
    if (!slot) continue;
    const parts = inSlot(slot);
    data.add(`${slot}.${attr} ${pct(parts.filter((p) => has(p.attributes[attr!])).length, parts.length)}`);
  }
  for (const [, v] of src.matchAll(/(\w+)\.family\b/g)) {
    const slot = VAR_SLOT[v!];
    if (!slot) continue;
    const parts = inSlot(slot);
    data.add(`${slot} case line ${pct(parts.filter((p) => familyPlatform(p.family) !== null).length, parts.length)}`);
  }
  if (rule.key === "family-exception") data.add(`family_exceptions rows: ${catalog.familyExceptions.length}`);
  if (/listingsFor/.test(src)) data.add("listings");
  if (/specSource/.test(src)) data.add("specSource");
  return { key: rule.key, slots: [...rule.appliesTo], canError: /severity: "error"/.test(src), data: [...data] };
});

// ---- pairwise outcomes --------------------------------------------------
const perSlotRule = RULES.filter((r) => r.appliesTo.length < 10);
const pairKeys = new Map<string, [SlotKey, SlotKey]>();
for (const r of perSlotRule) {
  const s = [...r.appliesTo].sort();
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) pairKeys.set(`${s[i]} × ${s[j]}`, [s[i]!, s[j]!]);
}

interface PairStats { total: number; counts: Record<Outcome, number>; rawErrors: number; inferredPairs: number }
const pairStats = new Map<string, PairStats>();
const ruleStats = new Map<string, { evaluated: number; counts: Record<Outcome, number>; rawErrors: number }>();
const strapSplit = { lug: 0 };
for (const r of perSlotRule) ruleStats.set(r.key, { evaluated: 0, counts: { ok: 0, warning: 0, "cant-confirm": 0, error: 0 }, rawErrors: 0 });

for (const [name, [a, b]] of [...pairKeys].sort()) {
  const rules = perSlotRule.filter((r) => r.appliesTo.includes(a) && r.appliesTo.includes(b));
  const st: PairStats = { total: 0, counts: { ok: 0, warning: 0, "cant-confirm": 0, error: 0 }, rawErrors: 0, inferredPairs: 0 };
  for (const pa of inSlot(a)) {
    for (const pb of inSlot(b)) {
      const build = { parts: { [a]: pa.id, [b]: pb.id } };
      const inferred = pa.specSource !== "vendor-stated" || pb.specSource !== "vendor-stated";
      const all: Finding[] = [];
      let rawError = false;
      for (const r of rules) {
        const raw = r.evaluate(build, catalog);
        const f = raw.map((x) => withEvidence(r, x, build, catalog));
        all.push(...f);
        const rs = ruleStats.get(r.key)!;
        rs.evaluated++;
        rs.counts[classify(f)]++;
        if (raw.some((x) => x.severity === "error")) {
          rs.rawErrors++;
          rawError = true;
        }
        if (r.key === "strap-fit") for (const x of raw) if (x.severity !== "info" && /lugs are/.test(x.message)) strapSplit.lug++;
      }
      const o = classify(all);
      st.total++;
      st.counts[o]++;
      if (inferred) st.inferredPairs++;
      if (rawError) st.rawErrors++;
    }
  }
  pairStats.set(name, st);
}

// ---- evidence: which rules the bad-build fixtures exercise -------------
const fixtures = JSON.parse(readFileSync("data/fixtures/known-builds.json", "utf-8")).badBuilds as {
  id: string; parts: Record<string, string | null>; sourceQuote?: string; evidences?: string[];
}[];
const evidence = new Map<string, string[]>();
for (const fx of fixtures) {
  if (!fx.sourceQuote) continue;
  for (const key of fx.evidences ?? []) evidence.set(key, [...(evidence.get(key) ?? []), fx.id]);
}
const stillBlocked = fixtures.filter((fx) => evaluateBuild(resolveBuild(fx.parts, catalog), catalog).status === "blocked").length;

// ---- write -----------------------------------------------------------------
const lines: string[] = [];
const out = (s = "") => lines.push(s);
const approved = Object.values(catalog.parts);
out("# Rule inventory and unknown rate (WS1 steps 1–2)");
out();
out(`Generated by \`pnpm rule-inventory\` from ${approved.length} approved parts, ${RULES.length} rules. Do not edit by hand.`);
out(`${approved.filter((p) => p.specSource !== "vendor-stated").length} approved parts (${pct(approved.filter((p) => p.specSource !== "vendor-stated").length, approved.length)}) are not \`vendor-stated\`; each one draws an \`unverified-part\` warning, so none can reach a clean \`ok\`.`);
out();
out("## 1. Rules");
out();
out("Coverage is the share of approved parts in that slot with the value present. \"Raw errors\" is how many pairs the rule itself called an error; \"blocks\" is how many still block after the evidence policy (lib/compat/evidence.ts): only a rule with a quoted bad build may block, and never on inferred, marketplace or user-entered data. Evidence is the bad-build fixtures that name the rule in `evidences`.");
out();
out("| Rule | What it actually checks | Error decided by | Data it reads (coverage) | May block | Pairs judged | ok | warning | can't confirm | raw errors | blocks | Evidence |");
out("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const f of facts) {
  const rs = ruleStats.get(f.key);
  const ev = evidence.get(f.key);
  const evText = ev ? ev.join(", ") : f.canError ? "**none — errors shown as warnings (Checked)**" : "n/a (cannot block)";
  const row = rs
    ? [rs.evaluated, pct(rs.counts.ok, rs.evaluated), pct(rs.counts.warning, rs.evaluated), pct(rs.counts["cant-confirm"], rs.evaluated), rs.rawErrors, rs.counts.error]
    : ["per part", "–", "–", "–", "–", "–"];
  const [checks, decidedBy] = CHECKS[f.key] ?? ["?", "?"];
  out(`| \`${f.key}\` | ${checks} | ${decidedBy} | ${f.data.join("; ") || "–"} | ${VERIFIED_RULES.has(f.key) ? "yes" : "no"} | ${row.join(" | ")} | ${evText} |`);
}
out();
out(`\`strap-fit\`: ${strapSplit.lug} pairs differ on lug width; that branch only warns, because the case figure is its line's standard (class C).`);
out(`Bad-build fixtures: ${fixtures.length}, ${fixtures.filter((f) => f.sourceQuote).length} quoted, ${stillBlocked} blocked by the engine.`);
out(`\`movement-case-fit\`: ${inSlot("movement").filter((p) => p.family === "nh3x-movement-accessory").length} of ${inSlot("movement").length} approved parts in the movement slot are spare parts, so most movement pairs are correctly blocked.`);
out();
out("## 2. Unknown rate by slot pair");
out();
out("Every approved part in one slot against every approved part in the other, judged by the rules that apply to both, after the evidence policy. A pair counts once, by its worst finding: blocked, then a real warning, then can't-confirm, then ok. The last column is the same pairs before the policy.");
out();
out("| Slot pair | Pairs | ok | warning | can't confirm | blocked | pairs with an inferred part | pairs a rule called an error |");
out("|---|---|---|---|---|---|---|---|");
let grand = { total: 0, ok: 0, warning: 0, cc: 0, error: 0 };
for (const [name, st] of pairStats) {
  grand = { total: grand.total + st.total, ok: grand.ok + st.counts.ok, warning: grand.warning + st.counts.warning, cc: grand.cc + st.counts["cant-confirm"], error: grand.error + st.counts.error };
  out(`| ${name} | ${st.total} | ${OUTCOMES.map((o) => pct(st.counts[o], st.total)).join(" | ")} | ${pct(st.inferredPairs, st.total)} | ${pct(st.rawErrors, st.total)} |`);
}
out(`| **all pairs** | **${grand.total}** | **${pct(grand.ok, grand.total)}** | **${pct(grand.warning, grand.total)}** | **${pct(grand.cc, grand.total)}** | **${pct(grand.error, grand.total)}** | | |`);
out();
writeFileSync("data/fixtures/rule-inventory.md", lines.join("\n") + "\n");
console.log(`Wrote data/fixtures/rule-inventory.md: ${RULES.length} rules, ${pairStats.size} slot pairs, ${grand.total} pairs judged.`);
