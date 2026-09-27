// Re-renders chosen jobs into a temp dir with the current renderer and
// config, and diffs them against the stored outputs: per file (a surface
// job has four), mean and max absolute difference per channel, 8-bit.
// Proves that stored outputs still match what the pipeline makes -- e.g.
// after `run.ts --adopt` re-keyed them without rendering.
//
//   BLENDER=<path> npx tsx scripts/render/verify-renders.ts <job id> [<job id> ...]

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { loadRenderParts } from "../../lib/render/load";
import { buildManifest } from "../../lib/render/manifest";
import { GREYS, pack } from "./pack-passes";

const OUT = "public/render/layers";
const BLENDER = process.env.BLENDER ?? "blender";
const index = JSON.parse(readFileSync(`${OUT}/index.json`, "utf8")) as { jobs: Record<string, { stem: string; pass: string }> };
const manifest = buildManifest(loadRenderParts(), "verify");

function blender(view: string, env: Record<string, string>, out: string) {
  const r = spawnSync(BLENDER, ["-b", "--factory-startup", "--python-exit-code", "1", "--python", "scripts/render/render_solid.py", "--", "D", view, out], {
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  const res = r.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  if (r.status !== 0 || !res) throw new Error(`render failed:\n${(r.stdout + r.stderr).split("\n").filter((l) => /error|Traceback/i.test(l)).slice(0, 5).join("\n")}`);
  return JSON.parse(res.slice(7)) as { device: string; blender: string };
}

async function diff(a: string | Buffer, b: string) {
  const [x, y] = await Promise.all([a, b].map((f) => sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (x!.info.width !== y!.info.width) throw new Error(`size ${x!.info.width} vs ${y!.info.width}`);
  const sum = [0, 0, 0, 0];
  const max = [0, 0, 0, 0];
  let differing = 0;
  const px = x!.info.width * x!.info.height;
  for (let i = 0; i < px; i++) {
    let any = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(x!.data[i * 4 + c]! - y!.data[i * 4 + c]!);
      sum[c]! += d;
      if (d > max[c]!) max[c] = d;
      if (d) any = true;
    }
    if (any) differing++;
  }
  return { mean: sum.map((s) => +(s / px).toFixed(4)), max, differingPx: differing, px };
}

async function main() {
  const ids = process.argv.slice(2);
  const tmp = `${tmpdir()}/modbench-verify`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const id of ids) {
    const job = manifest.jobs.find((j) => j.id === id);
    const stored = index.jobs[id];
    if (!job || !stored) throw new Error(`unknown job: ${id}`);
    const t0 = performance.now();
    if (job.pass === "surface") {
      const dirs = GREYS.map((g) => `${tmp}/${stored.stem}-${g}`);
      let info;
      for (const [k, g] of GREYS.entries()) {
        mkdirSync(dirs[k]!, { recursive: true });
        info = blender(job.view, { ...job.env, PASSES: `${dirs[k]}/`, PASSES_GREY: String(g) }, `${dirs[k]}/beauty.png`);
      }
      const p = await pack(dirs[0]!, dirs[1]!);
      const raw = { raw: { width: p.w, height: p.h, channels: 4 as const } };
      console.log(`${id}  [${info!.device}, Blender ${info!.blender}, ${((performance.now() - t0) / 1000).toFixed(1)}s]`);
      for (const k of ["uv", "light", "bounce", "base"] as const) {
        const d = await diff(await sharp(Buffer.from(p[k]), raw).png().toBuffer(), `${OUT}/${stored.stem}-${k}.png`);
        console.log(`  ${k.padEnd(6)} mean RGBA ${d.mean.join(" / ")}  max ${d.max.join("/")}  differing px ${d.differingPx} of ${d.px}`);
      }
    } else {
      const out = `${tmp}/${stored.stem}.png`;
      const info = blender(job.view, job.env, out);
      const d = await diff(out, `${OUT}/${stored.stem}.png`);
      console.log(`${id}  [${info.device}, Blender ${info.blender}, ${((performance.now() - t0) / 1000).toFixed(1)}s]`);
      console.log(`  beauty mean RGBA ${d.mean.join(" / ")}  max ${d.max.join("/")}  differing px ${d.differingPx} of ${d.px}`);
    }
  }
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
