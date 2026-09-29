// Full-render references for accuracy.ts: public/render/layers/check-v1..3.png.
//
// One Blender render of the whole watch per reference build, with exactly the
// inputs accuracy.ts composites (SKX 42.5 case, jubilee, steel sword hands,
// prototype dial/insert/ring prints). Re-run after any renderer revision, then
// re-baseline accuracy.ts. Glossy: render on the OptiX machine (plan §17).
//
//   BLENDER=<path> [RENDER_DEVICE=OPTIX] npx tsx scripts/render/references.ts

import { spawnSync } from "node:child_process";

const BLENDER = process.env.BLENDER ?? "blender";
const CASE_DIMS = JSON.stringify({ caseDiameter: 42.5, lugWidth: 22, aperture: 28.5 });
const REFS = [
  { n: 1, view: "hero", finish: "steel" },
  { n: 2, view: "top", finish: "steel" },
  { n: 3, view: "hero", finish: "gold" },
];

for (const r of REFS) {
  const out = `public/render/layers/check-v${r.n}.png`;
  const t0 = performance.now();
  const p = spawnSync(BLENDER, ["-b", "--factory-startup", "--python-exit-code", "1", "--python", "scripts/render/render_solid.py", "--", "D", r.view, out], {
    env: { ...process.env, CASE_DIMS, CASE_FINISH: r.finish, STRAP: "jubilee", DIAL_TAG: `v${r.n}`, INSERT_TAG: "skx", RING_TAG: "skx", LAYER: "" },
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (p.status !== 0) {
    console.error((p.stdout + p.stderr).split("\n").filter((l) => /error|Traceback/i.test(l)).slice(0, 8).join("\n"));
    throw new Error(`reference V${r.n} failed`);
  }
  console.log(`V${r.n} ${r.view} ${r.finish}: ${out} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}
