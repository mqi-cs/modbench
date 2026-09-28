// Composite-vs-full-render accuracy on the three reference builds (WS2c,
// §17 of the plan; committed 2026-09-28 so the numbers are reproducible).
//
// V1-V3 are built with the real resolveScene, drawn by the real browser
// compositor (Compositor.snapshot()) in headless Chrome, and compared with
// the full Cycles renders public/render/layers/check-v1..3.png: flattened on
// white, 8-bit, per channel, over pixels where either image has coverage.
// Exits 1 if MAD or p99 leaves the baseline by more than 0.1 / 1.
//
//   npx tsx scripts/render/accuracy.ts [--out <dir>]     (--out also writes the composites)
//
// Env: CHROME (default: the macOS Google Chrome app). Needs `git lfs pull`
// (layers, check renders, the scripts/3d-test/out prints).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import sharp from "sharp";
import { resolveScene, type RenderIndex } from "../../lib/render/scene";

/**
 * Measured with this script. Renderer revision 1 (commit 4164191): V1 1.11/21,
 * V2 1.50/21, V3 0.83/13. Revision 2, 2026-09-28 (hands no longer cast their
 * shadow into the dial and date passes, D19c): V1 0.95/14, V2 1.42/21,
 * V3 0.76/10. Revision 3, 2026-09-28 (top view: 85 mm lens, studio
 * reflections; hero unchanged): below. V2's composite moved further from its
 * full render (still inside WS2c's MAD <= 3, p99 <= 30).
 */
export const BASELINE: Record<string, { mad: number; p99: number }> = {
  V1: { mad: 0.95, p99: 14 },
  V2: { mad: 2.36, p99: 28 },
  V3: { mad: 0.76, p99: 10 },
};

const ROOT = path.resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : undefined;

// The reference builds: SKX 42.5 case, jubilee, steel sword hands, generic
// insert and ring prints, prototype dial photos (V3 in gold).
const C = "case:round/42.5/22/28.5";
const index = JSON.parse(readFileSync(path.join(ROOT, "public/render/layers/index.json"), "utf8")) as RenderIndex;
const keys: Record<string, string> = { steel: `${C}#steel`, gold: `${C}#gold`, dial: "dial:disc", ring: "ring:angled", hands: "hands:sword#steel", insert: "insert:flat", strap: "strap:jubilee" };
const refIndex: RenderIndex = { ...index, parts: { ...index.parts, ...Object.fromEntries(Object.entries(keys).map(([id, key]) => [`ref-${id}`, { key, approximated: false }])) } };
const builds = [
  { name: "V1", view: "hero", finish: "steel", n: 1 },
  { name: "V2", view: "top", finish: "steel", n: 2 },
  { name: "V3", view: "hero", finish: "gold", n: 3 },
] as const;
const scenes = builds.map((b) => {
  const s = resolveScene({
    index: refIndex,
    view: b.view,
    parts: { case: `ref-${b.finish}`, dial: "ref-dial", chapterRing: "ref-ring", hands: "ref-hands", bezelInsert: "ref-insert", strap: "ref-strap" },
    prints: {
      dial: { src: `/tex/dial-cut-v${b.n}.png`, generated: false },
      date: { src: `/tex/date-v${b.n}.png`, generated: true },
      insert: { src: "/tex/insert-skx.png", generated: true },
      ring: { src: "/tex/ring-skx.png", generated: true },
    },
    caseAttributes: {},
  });
  if (!s.ok) throw new Error(`${b.name}: ${s.reason}`);
  return { name: b.name, layers: s.layers };
});

// Browser side: draw each scene and post the premultiplied RGBA back.
const page = `
import { Compositor } from ${JSON.stringify(path.join(ROOT, "lib/render/compositor.ts"))};
const scenes = ${JSON.stringify(scenes)};
const comp = new Compositor(document.createElement("canvas"));
await comp.loadLut("/render/agx-lut.png");
for (const s of scenes) {
  await comp.setLayers(s.layers, "/render/layers");
  const { data } = comp.snapshot();
  await fetch("/result/" + s.name, { method: "POST", body: data });
}
await fetch("/result/done", { method: "POST", body: "" });`;
const bundle = await build({ stdin: { contents: page, resolveDir: ROOT, loader: "ts" }, bundle: true, format: "esm", write: false, target: "es2022" });
const js = bundle.outputFiles[0]!.text;

const results = new Map<string, Buffer>();
const finished = new Promise<void>((done) => {
  const server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url!.split("?")[0]!);
    if (req.method === "POST") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        res.end("ok");
        const name = u.slice("/result/".length);
        if (name === "done") return server.close(() => done());
        results.set(name, Buffer.concat(chunks));
      });
      return;
    }
    if (u === "/") return res.end(`<!doctype html><script type="module" src="/page.js"></script>`);
    if (u === "/page.js") return res.setHeader("content-type", "text/javascript").end(js);
    const file = u.startsWith("/tex/") ? path.join(ROOT, "scripts/3d-test/out", path.basename(u)) : path.join(ROOT, "public", path.normalize(u));
    try {
      res.setHeader("content-type", file.endsWith(".webp") ? "image/webp" : file.endsWith(".json") ? "application/json" : "image/png").end(readFileSync(file));
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(0, () => {
    const port = (server.address() as { port: number }).port;
    const profile = mkdtempSync(path.join(tmpdir(), "accuracy-"));
    const chrome = spawn(CHROME, ["--headless=new", `--user-data-dir=${profile}`, "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--no-first-run", `http://localhost:${port}/`], { stdio: "ignore" });
    chrome.on("exit", () => rmSync(profile, { recursive: true, force: true, maxRetries: 5 }));
    server.on("close", () => chrome.kill());
  });
});
const timeout = setTimeout(() => {
  console.error("timed out waiting for Chrome (set CHROME?)");
  process.exit(2);
}, 180_000);
await finished;
clearTimeout(timeout);

let failed = false;
if (outDir) mkdirSync(outDir, { recursive: true });
for (const b of builds) {
  const comp = results.get(b.name)!;
  const { data: ref, info } = await sharp(path.join(ROOT, `public/render/layers/check-v${b.n}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (ref.length !== comp.length) throw new Error(`${b.name}: size mismatch`);
  const d: number[] = [];
  for (let i = 0; i < ref.length / 4; i++) {
    const ra = ref[i * 4 + 3]! / 255;
    const ca = comp[i * 4 + 3]! / 255;
    if (ra === 0 && ca === 0) continue;
    for (let c = 0; c < 3; c++) d.push(Math.abs(Math.round(ref[i * 4 + c]! * ra + 255 * (1 - ra)) - Math.round(comp[i * 4 + c]! + 255 * (1 - ca))));
  }
  d.sort((x, y) => x - y);
  const mad = d.reduce((s, x) => s + x, 0) / d.length;
  const p99 = d[Math.floor(d.length * 0.99)]!;
  const base = BASELINE[b.name]!;
  const ok = Math.abs(mad - base.mad) <= 0.1 && Math.abs(p99 - base.p99) <= 1;
  failed ||= !ok;
  console.log(`${b.name} ${b.view}: MAD ${mad.toFixed(2)} p99 ${p99} (baseline ${base.mad} / ${base.p99}) ${ok ? "ok" : "OUTSIDE"}`);
  if (outDir) writeFileSync(path.join(outDir, `${b.name}.png`), await sharp(comp, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer());
}
process.exit(failed ? 1 : 0);
