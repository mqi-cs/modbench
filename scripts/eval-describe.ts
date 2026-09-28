// WS5: evaluates "describe a watch in words" against data/fixtures/describe-eval.json.
//
//   pnpm eval:describe                 # keyword path, plus the model path if one is configured
//   pnpm eval:describe --mode keywords # or: model, both
//   pnpm eval:describe --fresh         # ignore cached model replies
//
// Model replies are cached in data/eval/describe-cache.json by provider,
// model and query, so a rerun costs nothing; spend stops at EVAL_MAX_USD
// (default 1). Writes data/eval/describe-report.md and
// data/eval/describe-to-rate.md. Human 1-5 ratings go in
// data/eval/describe-ratings.json -- a rating only counts while the build
// it rated is still the one suggested.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadCatalog } from "../lib/catalog";
import { catalogSlice } from "../lib/build-view";
import { evaluateBuild, type Build } from "../lib/compat";
import { llmConfig, modelUsage, parseQuery, parseWithKeywords, type ParseOutcome } from "../lib/llm";
import { suggestFromIntent } from "../lib/suggest-service";
import { TAG_NAMES } from "../lib/style-vocabulary";
import { findReservedTerms } from "../lib/trademarks";
import type { ParsedIntent } from "../lib/intent";

interface Must {
  styleTags?: string[];
  budgetMaxMinor?: number;
  requiresDate?: boolean;
  requiresGmt?: boolean;
  caseDiameterMm?: number;
}
interface Query { id: string; kind: string; query: string; must: Must; nice: string[] }
interface Fixture {
  thresholds: { setOn: string; zeroErrorShare: number; mustRecallModel: number; inventedTagsAfterFilter: number; queriesWithABuild: number; humanRatingMean: number; humanRatingMin: number };
  queries: Query[];
}
type Mode = "keywords" | "model";

// The same .env.local the app reads, so a key added there is picked up here.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const OUT = "data/eval";
const CACHE = `${OUT}/describe-cache.json`;
const RATINGS = `${OUT}/describe-ratings.json`;

// $ per 1M tokens, input/output. Override or extend with EVAL_PRICE_IN_PER_M / EVAL_PRICE_OUT_PER_M.
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-opus-5": [5, 25],
};

const args = process.argv.slice(2);
const modeArg = args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "both";
const fresh = args.includes("--fresh");
const fixture = JSON.parse(readFileSync("data/fixtures/describe-eval.json", "utf-8")) as Fixture;
mkdirSync(OUT, { recursive: true });
const cache: Record<string, ParseOutcome> = existsSync(CACHE) && !fresh ? JSON.parse(readFileSync(CACHE, "utf-8")) : {};
const ratings: { mode: Mode; id: string; build: string; rating: number }[] = existsSync(RATINGS) ? JSON.parse(readFileSync(RATINGS, "utf-8")) : [];

const config = llmConfig();
const modes: Mode[] = modeArg === "keywords" ? ["keywords"] : modeArg === "model" ? ["model"] : config ? ["keywords", "model"] : ["keywords"];
if (modes.includes("model") && !config) {
  console.error("No model configured: set LLM_PROVIDER / LLM_MODEL / LLM_API_KEY (see .env.example).");
  process.exit(1);
}
const price: [number, number] | undefined =
  process.env.EVAL_PRICE_IN_PER_M && process.env.EVAL_PRICE_OUT_PER_M
    ? [Number(process.env.EVAL_PRICE_IN_PER_M), Number(process.env.EVAL_PRICE_OUT_PER_M)]
    : config ? PRICES[config.model] : undefined;
if (modes.includes("model") && !price) {
  console.error(`No price for ${config!.model}: set EVAL_PRICE_IN_PER_M and EVAL_PRICE_OUT_PER_M so the cost cap can work.`);
  process.exit(1);
}
const maxUsd = Number(process.env.EVAL_MAX_USD ?? 1);
const spent = () => (price ? (modelUsage.inputTokens * price[0] + modelUsage.outputTokens * price[1]) / 1e6 : 0);

/** Each must-have constraint, and whether this intent recovered it. */
function mustChecks(must: Must, intent: ParsedIntent): { name: string; ok: boolean }[] {
  const checks = (must.styleTags ?? []).map((t) => ({ name: t, ok: intent.styleTags.includes(t) }));
  if (must.budgetMaxMinor !== undefined) checks.push({ name: `budget ${must.budgetMaxMinor / 100}`, ok: intent.budgetMinor !== null && Math.abs(intent.budgetMinor - must.budgetMaxMinor) <= must.budgetMaxMinor * 0.01 });
  if (must.requiresDate !== undefined) checks.push({ name: `date ${must.requiresDate}`, ok: intent.requiresDate === must.requiresDate });
  if (must.requiresGmt !== undefined) checks.push({ name: `gmt ${must.requiresGmt}`, ok: intent.requiresGmt === must.requiresGmt });
  if (must.caseDiameterMm !== undefined) {
    const mm = must.caseDiameterMm;
    checks.push({ name: `${mm}mm`, ok: intent.caseDiameterMm !== null && intent.caseDiameterMm[0] <= mm && mm <= intent.caseDiameterMm[1] });
  }
  return checks;
}

async function parse(mode: Mode, q: Query): Promise<ParseOutcome | { skipped: string }> {
  if (mode === "keywords") return { intent: parseWithKeywords(q.query), droppedTags: [], source: "keywords", notice: null };
  const key = `${config!.provider}:${config!.model}:${q.query}`;
  if (cache[key]) return cache[key];
  if (spent() >= maxUsd) return { skipped: `cost cap $${maxUsd} reached` };
  const out = await parseQuery(q.query);
  if (out.source !== "model") return { skipped: "model call failed; fell back to keywords" };
  cache[key] = out;
  return out;
}

const slice = catalogSlice(loadCatalog());
const report: string[] = [];
const toRate: string[] = ["# Rate these builds 1-5", "", "How well does the first suggested build match the description? Add entries to `data/eval/describe-ratings.json` as `{\"mode\", \"id\", \"build\", \"rating\"}`, copying `build` exactly.", ""];
let hardFail = false;

for (const mode of modes) {
  let mustOk = 0, mustTotal = 0, niceOk = 0, niceTotal = 0, emitted = 0, dropped = 0, afterFilter = 0;
  let withBuild = 0, candidates = 0, zeroError = 0, overBudget = 0, brandHits = 0, skipped = 0;
  const rated: number[] = [];
  const rows: string[] = [];

  for (const q of fixture.queries) {
    const out = await parse(mode, q);
    if ("skipped" in out) {
      skipped++;
      rows.push(`| ${q.id} | ${q.query} | skipped: ${out.skipped} | | |`);
      continue;
    }
    const checks = mustChecks(q.must, out.intent);
    mustOk += checks.filter((c) => c.ok).length;
    mustTotal += checks.length;
    niceOk += q.nice.filter((t) => out.intent.styleTags.includes(t)).length;
    niceTotal += q.nice.length;
    emitted += out.intent.styleTags.length + out.droppedTags.length;
    dropped += out.droppedTags.length;
    afterFilter += out.intent.styleTags.filter((t) => !TAG_NAMES.includes(t)).length;

    const result = suggestFromIntent(out.intent);
    if (result.candidates.length > 0) withBuild++;
    for (const c of result.candidates) {
      candidates++;
      if (!evaluateBuild({ parts: c.parts } as Build, slice).findings.some((f) => f.severity === "error")) zeroError++;
      if (q.must.budgetMaxMinor !== undefined && c.totalMinorBase > q.must.budgetMaxMinor) overBudget++;
      brandHits += findReservedTerms(c.explanation).length;
    }

    const top = result.candidates[0];
    const build = top ? Object.values(top.parts).sort().join("|") : "";
    const rating = ratings.find((r) => r.mode === mode && r.id === q.id && r.build === build)?.rating;
    if (top && rating !== undefined) rated.push(rating);
    if (top) toRate.push(`## ${mode} · ${q.id}: "${q.query}"`, "", `build: \`${build}\``, "", ...top.chosen.map((p) => `- ${p.slot}: ${p.name}`), `- total £${(top.totalMinorBase / 100).toFixed(2)}`, `- ${top.explanation}`, "");

    const missed = checks.filter((c) => !c.ok).map((c) => c.name);
    rows.push(`| ${q.id} | ${q.query} | ${checks.length - missed.length}/${checks.length}${missed.length ? ` (missed ${missed.join(", ")})` : ""} | ${result.candidates.length} | ${rating ?? ""} |`);
  }

  const t = fixture.thresholds;
  const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`);
  const zeroErrorShare = candidates === 0 ? 1 : zeroError / candidates;
  const buildShare = withBuild / (fixture.queries.length - skipped || 1);
  const ratingMean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
  const bar = mode === "model";
  const verdict = (ok: boolean, gated = true) => (!gated ? "baseline" : ok ? "PASS" : "FAIL");
  if (zeroErrorShare < t.zeroErrorShare || afterFilter > t.inventedTagsAfterFilter) hardFail = true;

  report.push(
    `## ${mode === "model" ? `Model path (${config!.provider}, ${config!.model})` : "Keyword path"}`,
    "",
    "| Measure | Result | Threshold | |",
    "|---|---|---|---|",
    `| Share of suggested builds with zero errors | ${pct(zeroError, candidates)} (${zeroError}/${candidates}) | ${t.zeroErrorShare * 100}% | ${verdict(zeroErrorShare >= t.zeroErrorShare)} |`,
    `| Must-have constraints recovered | ${pct(mustOk, mustTotal)} (${mustOk}/${mustTotal}) | ${t.mustRecallModel * 100}% (model) | ${verdict(mustOk / mustTotal >= t.mustRecallModel, bar)} |`,
    `| Invented tags after the membership filter | ${afterFilter} | ${t.inventedTagsAfterFilter} | ${verdict(afterFilter <= t.inventedTagsAfterFilter)} |`,
    `| Invented tags before the filter (dropped) | ${pct(dropped, emitted)} (${dropped}/${emitted}) | — | info |`,
    `| Queries with at least one build | ${pct(withBuild, fixture.queries.length - skipped)} (${withBuild}/${fixture.queries.length - skipped}) | ${t.queriesWithABuild * 100}% | ${verdict(buildShare >= t.queriesWithABuild, bar)} |`,
    `| Human rating, mean (min) | ${ratingMean === null ? "not rated" : `${ratingMean.toFixed(2)} (${Math.min(...rated)}), ${rated.length} rated`} | ≥ ${t.humanRatingMean}, none < ${t.humanRatingMin} | ${ratingMean === null ? "open" : verdict(ratingMean >= t.humanRatingMean && Math.min(...rated) >= t.humanRatingMin, bar)} |`,
    `| Nice-to-have tags recovered | ${pct(niceOk, niceTotal)} (${niceOk}/${niceTotal}) | — | info |`,
    `| Builds over the stated budget | ${overBudget} | 0 | ${overBudget === 0 ? "PASS" : "FAIL"} |`,
    `| Brand or model names in explanations | ${brandHits} | 0 | ${brandHits === 0 ? "PASS" : "FAIL"} |`,
    ...(mode === "model" ? [`| Model calls / failures / spend | ${modelUsage.calls} / ${modelUsage.failures} / $${spent().toFixed(4)} (cap $${maxUsd}) | — | info |`] : []),
    ...(skipped ? [`| Skipped | ${skipped} | — | see rows |`] : []),
    "",
    "| id | query | must-haves | builds | rating |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  );
  if (overBudget > 0 || brandHits > 0) hardFail = true;
}

writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n");
writeFileSync(`${OUT}/describe-to-rate.md`, toRate.join("\n") + "\n");
writeFileSync(
  `${OUT}/describe-report.md`,
  [`# Describe-a-watch evaluation`, "", `${fixture.queries.length} queries, thresholds set ${fixture.thresholds.setOn} (data/fixtures/describe-eval.json). Generated by \`pnpm eval:describe\`.`, "", ...report].join("\n"),
);
console.log(report.filter((l) => l.startsWith("## ") || /^\| (Share|Must|Invented|Queries|Human|Builds over|Brand|Model calls)/.test(l)).join("\n"));
console.log(`\nWrote ${OUT}/describe-report.md and ${OUT}/describe-to-rate.md`);
process.exit(hardFail ? 1 : 0);
