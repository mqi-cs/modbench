// Render runner (WS2b). Builds the manifest from the catalog, renders every
// job whose output is missing, and writes the index the browser loads.
//
//   BLENDER=<path> npx tsx scripts/render/run.ts [--vendor <key>] [--dry-run]
//
// Outputs are content-addressed: scripts/render/out/<hash>.png. A job's hash
// covers its geometry, view, pass and the renderer version (the renderer's
// source plus the default textures it bakes in), so a rerun with nothing
// changed renders nothing, and tenants share every output. --vendor builds
// one tenant's manifest; its outputs land in the same place.
//
// Each job is its own Blender process (~10s scene build + ~5s render); see
// 08-DEFERRED D12a.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadRenderParts } from "../../lib/render/load";
import { buildManifest } from "../../lib/render/manifest";

const OUT = "scripts/render/out";
const BLENDER = process.env.BLENDER ?? "blender";
const TEX = "scripts/3d-test/out";
/** Everything that decides a render's pixels apart from the job itself. */
const VERSION_INPUTS = [
  "scripts/render/render_solid.py",
  "scripts/render/case_geometry.py",
  "scripts/render/render_guards.py",
  "public/assets/dial/ZDs4QjjlRw6lbypEnGaFV.webp",
  `${TEX}/dial-cut.png`,
  `${TEX}/insert-skx.png`,
  `${TEX}/ring-skx.png`,
  `${TEX}/date-skx.png`,
];
/** Scene settings every job shares (the WS2a render config is the renderer's default). */
const SCENE = { TENT: "0.9", FLOOR: "0.3" };

const args = process.argv.slice(2);
const vendor = args.includes("--vendor") ? args[args.indexOf("--vendor") + 1] : undefined;
const dryRun = args.includes("--dry-run");

const missingInputs = VERSION_INPUTS.filter((f) => !existsSync(f));
if (missingInputs.length) {
  throw new Error(`missing renderer inputs (textures come from scripts/3d-test; see render-batch.sh):\n  ${missingInputs.join("\n  ")}`);
}
const version = createHash("sha256");
for (const f of VERSION_INPUTS) version.update(f).update(readFileSync(f));
version.update(JSON.stringify(SCENE));
const rendererVersion = version.digest("hex").slice(0, 16);

const m = buildManifest(loadRenderParts(undefined, vendor), rendererVersion);
const file = (hash: string) => `${OUT}/${hash}.png`;
const todo = m.jobs.filter((j) => !existsSync(file(j.hash)));

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
        order: ["case", "dial", "ring", "hands", "insert", "strap"],
        pair: { layer: "casestrap", replaces: ["case", "strap"], views: ["hero"] },
        jobs: Object.fromEntries(m.jobs.filter((j) => existsSync(file(j.hash))).map((j) => [j.id, `${j.hash}.png`])),
        parts: m.parts,
        notRenderable: m.notRenderable,
      },
      null,
      1,
    ),
  );

if (!dryRun) {
  let done = 0;
  for (const j of todo) {
    const t0 = performance.now();
    const r = spawnSync(
      BLENDER,
      ["-b", "--factory-startup", "--python-exit-code", "1", "--python", "scripts/render/render_solid.py", "--", "D", j.view, file(j.hash)],
      { env: { ...process.env, ...SCENE, ...j.env }, encoding: "utf8", maxBuffer: 1 << 28 },
    );
    if (r.status !== 0 || !existsSync(file(j.hash))) {
      const err = (r.stdout + r.stderr).split("\n").filter((l) => /error|Traceback/i.test(l)).slice(0, 5).join("\n");
      writeIndex();
      throw new Error(`render failed: ${j.id}\n${err}`);
    }
    done++;
    console.log(`${String(done).padStart(4)}/${todo.length} ${((performance.now() - t0) / 1000).toFixed(1)}s ${j.id}`);
  }
}
writeIndex();
console.log(`index: ${OUT}/index${vendor ? `-${vendor}` : ""}.json`);
