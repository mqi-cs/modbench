// Render runner (WS2b). Builds the manifest from the catalog, renders every
// job whose output is missing, and writes the index the browser loads.
//
//   BLENDER=<path> npx tsx scripts/render/run.ts [--vendor <key>] [--case <prefix>] [--dry-run] [--prune]
//                                               [--adopt <old-index.json>]
//
// Env: BLENDER (default `blender` on PATH), RENDER_DEVICE (auto | OPTIX | CUDA |
// METAL | HIP | ONEAPI | CPU; see render-config.json), TEX_DIR (prototype
// textures; default scripts/3d-test/out).
//
// Outputs are content-addressed: public/render/layers/<hash>.png. A job's hash
// covers its geometry, view, pass and the renderer version: the renderer's
// source, render-config.json, the Blender version actually running, and the
// default textures it bakes in. So a rerun with nothing changed renders
// nothing, and tenants share every output. --vendor builds one tenant's
// manifest; its outputs land in the same place. A Blender version other than
// the config's is refused: it would silently re-render everything.
//
// --adopt renames outputs listed in an older index to their current hashes,
// by job id, without rendering. Only valid when what changed since cannot
// alter a pixel (e.g. hash inputs added that describe settings already in
// use); say why in the commit.
//
// Each job is its own Blender process (~10s scene build + ~5s render); see
// 08-DEFERRED D12a. A surface job (dial, date, ring, insert: WS2c) is two --
// the layer at two greys -- packed by pack-passes.ts.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { loadRenderParts } from "../../lib/render/load";
import { buildManifest, type RenderJob } from "../../lib/render/manifest";
import { GREYS, pack } from "./pack-passes";

// Served to the browser compositor from here; gitignored (content-addressed, regenerable).
const OUT = "public/render/layers";
const BLENDER = process.env.BLENDER ?? "blender";
const TEX = process.env.TEX_DIR ?? "scripts/3d-test/out";
const CONFIG_FILE = "scripts/render/render-config.json";
const CONFIG = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as { blender: { version: string } };
/** Everything that decides a render's pixels apart from the job itself (plus the Blender version, below). */
const VERSION_INPUTS = [
  CONFIG_FILE,
  "scripts/render/render_solid.py",
  "scripts/render/case_geometry.py",
  "scripts/render/render_guards.py",
  "scripts/render/pack-passes.ts",
  "public/assets/dial/ZDs4QjjlRw6lbypEnGaFV.webp",
  `${TEX}/dial-cut.png`,
  `${TEX}/insert-skx.png`,
  `${TEX}/ring-skx.png`,
  `${TEX}/date-skx.png`,
];

const args = process.argv.slice(2);
const vendor = args.includes("--vendor") ? args[args.indexOf("--vendor") + 1] : undefined;
const dryRun = args.includes("--dry-run");

const missingInputs = VERSION_INPUTS.filter((f) => !existsSync(f));
if (missingInputs.length) {
  throw new Error(`missing renderer inputs (textures come from scripts/3d-test; see render-batch.sh):\n  ${missingInputs.join("\n  ")}`);
}

/** "Blender 4.5.14 LTS" -> "4.5.14 LTS". A dry run may go without Blender; a render may not. */
function blenderVersion(): string {
  const r = spawnSync(BLENDER, ["--version"], { encoding: "utf8" });
  const v = r.stdout?.match(/^Blender (.+)$/m)?.[1]?.trim();
  if (!v) {
    if (dryRun) {
      console.warn(`warning: can't run ${BLENDER}; hashing with the config's Blender version`);
      return CONFIG.blender.version;
    }
    throw new Error(`can't run Blender (${BLENDER}): set BLENDER to Blender ${CONFIG.blender.version}`);
  }
  if (v !== CONFIG.blender.version) {
    throw new Error(`Blender ${v} found; render-config.json pins ${CONFIG.blender.version}. Install that version, or change the config deliberately (every output re-renders).`);
  }
  return v;
}

// Text is hashed with LF line endings: a Windows checkout (CRLF) and a Linux
// one must agree on the version, or one of them re-renders everything.
const TEXT = /\.(py|ts|json)$/;
const version = createHash("sha256");
for (const f of VERSION_INPUTS) {
  const raw = readFileSync(f);
  version.update(f).update(TEXT.test(f) ? raw.toString("utf8").replace(/\r\n/g, "\n") : raw);
}
version.update(`blender ${blenderVersion()}`);
const rendererVersion = version.digest("hex").slice(0, 16);

const m = buildManifest(loadRenderParts(undefined, vendor), rendererVersion);
/** A beauty job is one PNG; a surface job is four, and -base.png is written last. */
const file = (j: RenderJob) => (j.pass === "surface" ? `${OUT}/${j.hash}-base.png` : `${OUT}/${j.hash}.png`);
// --adopt <old-index.json>: re-key existing outputs by job id (see header).
if (args.includes("--adopt")) {
  const old = JSON.parse(readFileSync(args[args.indexOf("--adopt") + 1]!, "utf8")) as { jobs: Record<string, { stem: string; pass: string }> };
  const suffixes = (pass: string) => (pass === "surface" ? ["-uv", "-light", "-bounce", "-base"] : [""]);
  let moved = 0;
  let missing = 0;
  for (const j of m.jobs) {
    const prev = old.jobs[j.id];
    if (!prev || prev.pass !== j.pass || prev.stem === j.hash) continue;
    const from = suffixes(j.pass).map((s) => `${OUT}/${prev.stem}${s}.png`);
    if (!from.every((f) => existsSync(f))) {
      missing++;
      continue;
    }
    // -base.png last, so an interrupted adopt never looks complete.
    suffixes(j.pass).forEach((s, i) => renameSync(from[i]!, `${OUT}/${j.hash}${s}.png`));
    moved++;
  }
  console.log(`adopted ${moved} jobs under the new hashes (${missing} listed but missing on disk)`);
}
// --case <prefix>: render only jobs for matching case keys first (e.g. case:round/42.5).
const onlyCase = args.includes("--case") ? args[args.indexOf("--case") + 1] : undefined;
const todo = m.jobs.filter((j) => !existsSync(file(j)) && (!onlyCase || j.caseKey.startsWith(onlyCase)));

function blender(j: RenderJob, out: string, extra: Record<string, string> = {}) {
  const r = spawnSync(
    BLENDER,
    ["-b", "--factory-startup", "--python-exit-code", "1", "--python", "scripts/render/render_solid.py", "--", "D", j.view, out],
    { env: { ...process.env, ...j.env, ...extra }, encoding: "utf8", maxBuffer: 1 << 28 },
  );
  if (r.status !== 0 || !existsSync(out)) {
    const err = (r.stdout + r.stderr).split("\n").filter((l) => /error|Traceback/i.test(l)).slice(0, 5).join("\n");
    writeIndex();
    throw new Error(`render failed: ${j.id}\n${err}`);
  }
}

/** Surface job: the layer at both greys, packed into the four images the browser loads. */
async function renderSurface(j: RenderJob) {
  const dirs = GREYS.map((g) => `${tmpdir()}/modbench-${j.hash}-${g}`);
  GREYS.forEach((g, k) => {
    mkdirSync(dirs[k]!, { recursive: true });
    blender(j, `${dirs[k]}/beauty.png`, { PASSES: `${dirs[k]}/`, PASSES_GREY: String(g) });
  });
  const p = await pack(dirs[0]!, dirs[1]!);
  const raw = { raw: { width: p.w, height: p.h, channels: 4 as const } };
  for (const k of ["uv", "light", "bounce", "base"] as const) {
    await sharp(Buffer.from(p[k]), raw).png({ compressionLevel: 9 }).toFile(`${OUT}/${j.hash}-${k}.png`);
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
}

const perSlot = Object.entries(m.keysPerSlot).map(([s, k]) => `${s} ${k.length}`).join(", ");
console.log(`scope ${vendor ?? "all vendors"}; renderer ${rendererVersion}`);
console.log(`parts: ${Object.keys(m.parts).length} keyed (${Object.values(m.parts).filter((p) => p.approximated).length} approximated), ${Object.keys(m.notRenderable).length} not renderable`);
console.log(`shape keys: ${perSlot}`);
console.log(`jobs: ${m.jobs.length}; to render: ${todo.length}; already rendered: ${m.jobs.length - todo.length}`);

mkdirSync(OUT, { recursive: true });
const writeIndex = () =>
  writeFileSync(
    `${OUT}/index${vendor ? `-${vendor}` : ""}.json`,
    JSON.stringify(
      {
        rendererVersion,
        views: ["hero", "top"],
        // Stacking order: printed and inner parts complete, then the case over
        // them (it holds them out), then the strap. In the hero view the
        // case+strap pair replaces both, at the case's place.
        order: ["date", "dial", "ring", "hands", "insert", "case", "strap"],
        pair: { layer: "casestrap", replaces: ["case", "strap"], views: ["hero"] },
        // id -> file stem and pass. beauty: <stem>.png; surface: <stem>-{uv,light,bounce,base}.png.
        jobs: Object.fromEntries(m.jobs.filter((j) => existsSync(file(j))).map((j) => [j.id, { stem: j.hash, pass: j.pass }])),
        parts: m.parts,
        notRenderable: m.notRenderable,
      },
      null,
      1,
    ),
  );

async function main() {
  if (!dryRun) {
    let done = 0;
    for (const j of todo) {
      const t0 = performance.now();
      if (j.pass === "surface") await renderSurface(j);
      else blender(j, file(j));
      done++;
      console.log(`${String(done).padStart(4)}/${todo.length} ${((performance.now() - t0) / 1000).toFixed(1)}s ${j.id}`);
    }
  }
  writeIndex();
  console.log(`index: ${OUT}/index${vendor ? `-${vendor}` : ""}.json`);
  // --prune (full scope only): delete outputs no job references -- earlier
  // renderer versions. check-*.png (full-render references) are kept.
  if (args.includes("--prune") && !vendor && !onlyCase) {
    const keep = new Set(m.jobs.map((j) => j.hash));
    let n = 0;
    for (const f of readdirSync(OUT)) {
      if (!f.endsWith(".png") || f.startsWith("check-")) continue;
      if (!keep.has(f.replace(/(-uv|-light|-bounce|-base)?\.png$/, ""))) {
        rmSync(`${OUT}/${f}`);
        n++;
      }
    }
    console.log(`pruned ${n} files`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
