// WS2a -- denoiser side-by-side. Renders one reference build's hero layer set
// at the current setting (768 spp, no denoise), with OIDN at 64/128/256 spp,
// and at 4096 spp no-denoise, adaptive sampling off, as ground truth; then
// measures and lays out crops.
//
//   BLENDER=<path> npx tsx scripts/3d-test/denoise-check.ts render
//   npx tsx scripts/3d-test/denoise-check.ts sheet
//
// Rerun this whenever a crystal comes back (render_guards.py refuses
// DENOISE with a crystal until then). Output: scripts/3d-test/out/denoise/.
// Resumable: renders already on disk with a recorded time are skipped.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp, { type OverlayOptions } from "sharp";

const OUT = "scripts/3d-test/out/denoise";
const RESULTS = `${OUT}/results.json`;
const BLENDER = process.env.BLENDER ?? "blender";

/** Reference build: stock SKX shape, day-date dial d03. d02 (mother of pearl)
 * is an extra dial-only row -- fine texture is what a denoiser smears first. */
const LAYERS: Record<string, Record<string, string>> = {
  case: { LAYER: "case", CASE_FINISH: "steel" },
  dial: { LAYER: "dial", DIAL_TAG: "d03" },
  ring: { LAYER: "ring", RING_TAG: "ring-white" },
  hands: { LAYER: "hands", HAND_COLOR: "steel" },
  insert: { LAYER: "insert", INSERT_TAG: "ins-black" },
  strap: { LAYER: "strap", STRAP: "jubilee" },
  casestrap: { LAYER: "casestrap", CASE_FINISH: "steel", STRAP: "jubilee" },
  "dial-mop": { LAYER: "dial", DIAL_TAG: "d02" },
};
/** All but the ground truth keep Blender's adaptive sampling (threshold 0.01),
 * as the layer library was rendered; SAMPLES is then a ceiling. */
const SETTINGS: Record<string, Record<string, string>> = {
  gt4096: { SAMPLES: "4096", DENOISE: "off", ADAPTIVE: "0" },
  ref768: { SAMPLES: "768", DENOISE: "off" },
  oidn64: { SAMPLES: "64", DENOISE: "on" },
  oidn128: { SAMPLES: "128", DENOISE: "on" },
  oidn256: { SAMPLES: "256", DENOISE: "on" },
};
/** Browser stacking order (make-manifest.ts `order`). */
const STACK = ["case", "dial", "ring", "hands", "insert", "strap"];
const PAPER = { r: 246, g: 247, b: 248 };

type Timing = { mesh_s: number; render_s: number; wall_s: number };
type Results = { timings: Record<string, Timing>; [k: string]: unknown };

const png = (layer: string, setting: string) => `${OUT}/${layer}-${setting}.png`;
const load = (): Results => (existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : { timings: {} });
const save = (r: Results) => writeFileSync(RESULTS, JSON.stringify(r, null, 2));

function blender(out: string, env: Record<string, string>): Timing {
  const t0 = performance.now();
  const r = spawnSync(
    BLENDER,
    ["-b", "--factory-startup", "--python-exit-code", "1", "--python", "scripts/render/render_solid.py", "--", "D", "hero", out],
    { env: { ...process.env, TENT: "0.9", FLOOR: "0.3", ...env }, encoding: "utf8", maxBuffer: 1 << 28 },
  );
  const line = r.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  if (r.status !== 0 || !line || !existsSync(out)) {
    throw new Error(`render failed (${out}):\n${(r.stdout + r.stderr).split("\n").filter((l) => /error|Traceback/i.test(l)).slice(0, 5).join("\n")}`);
  }
  const res = JSON.parse(line.slice(7)) as { mesh_s: number; render_s: number };
  return { mesh_s: res.mesh_s, render_s: res.render_s, wall_s: Math.round((performance.now() - t0) / 100) / 10 };
}

function render() {
  mkdirSync(OUT, { recursive: true });
  const results = load();
  // Warm-up: the first denoised render compiles OIDN kernels; keep that out of the timings.
  console.log("warm-up", blender(`${OUT}/_warmup.png`, { LAYER: "case", SAMPLES: "16", DENOISE: "on" }));
  for (const [layer, lenv] of Object.entries(LAYERS)) {
    for (const [setting, senv] of Object.entries(SETTINGS)) {
      const key = `${layer}-${setting}`;
      if (existsSync(png(layer, setting)) && results.timings[key]) continue;
      const t = blender(png(layer, setting), { ...lenv, ...senv });
      results.timings[key] = t;
      save(results);
      console.log(key.padEnd(24), JSON.stringify(t));
    }
  }
}

// --- measurement -----------------------------------------------------------

type Img = { data: Buffer; w: number; h: number };
async function raw(input: string | Buffer): Promise<Img> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Mean absolute difference over pixels either image covers, premultiplied
 * RGBA in 8-bit units; plus the 99th percentile of the per-pixel worst channel,
 * which catches localised smear that a mean over a whole layer dilutes. */
function diff(a: Img, b: Img, box?: Box) {
  const [x0, y0, w, h] = box ? [box.x, box.y, box.w, box.h] : [0, 0, a.w, a.h];
  let sum = 0;
  let n = 0;
  const worst: number[] = [];
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * a.w + x) * 4;
      const aa = a.data[i + 3]! / 255;
      const ba = b.data[i + 3]! / 255;
      if (aa === 0 && ba === 0) continue;
      let m = 0;
      for (let c = 0; c < 4; c++) {
        const d = c === 3 ? Math.abs(a.data[i + 3]! - b.data[i + 3]!) : Math.abs(a.data[i + c]! * aa - b.data[i + c]! * ba);
        sum += d;
        if (d > m) m = d;
      }
      n += 4;
      worst.push(m);
    }
  }
  worst.sort((p, q) => p - q);
  const r = (v: number) => Math.round(v * 100) / 100;
  return { mad: r(n ? sum / n : 0), p99: r(worst[Math.floor(worst.length * 0.99)] ?? 0), px: n / 4 };
}

type Box = { name: string; x: number; y: number; w: number; h: number; src?: string };
/** Feature crops in the 1600px hero frame, 160px square, chosen by eye off a
 * composite of the layer library (same camera). Cut from the stacked build
 * unless `src` names a single layer. */
const CROPS: Box[] = [
  { name: "dial print", x: 740, y: 680, w: 160, h: 160 },
  { name: "day-date print", x: 870, y: 780, w: 160, h: 160 },
  { name: "lume plots", x: 660, y: 580, w: 160, h: 160 },
  { name: "hand edges", x: 880, y: 700, w: 160, h: 160 },
  { name: "insert numerals", x: 560, y: 480, w: 160, h: 160 },
  { name: "chamfer highlight", x: 280, y: 840, w: 160, h: 160 },
  { name: "crown knurl", x: 920, y: 980, w: 160, h: 160 },
  { name: "MOP dial (d02)", x: 640, y: 690, w: 160, h: 160, src: "dial-mop" },
];

async function composite(setting: string) {
  const layers = STACK.map((l) => ({ input: png(l, setting) }));
  return sharp({ create: { width: 1600, height: 1600, channels: 4, background: { ...PAPER, alpha: 1 } } })
    .composite(layers)
    .png()
    .toBuffer();
}

async function sheet() {
  const results = load();
  const settings = Object.keys(SETTINGS);
  const comps: Record<string, Buffer> = {};
  for (const s of settings) {
    comps[s] = await composite(s);
    await sharp(comps[s]).toFile(`${OUT}/composite-${s}.png`);
  }
  // Whole-layer error for every layer, against the 768 reference and the 4096 ground truth.
  const layerDiff: Record<string, Record<string, unknown>> = {};
  for (const layer of Object.keys(LAYERS)) {
    const ref = await raw(png(layer, "ref768"));
    const gt = await raw(png(layer, "gt4096"));
    const row: Record<string, unknown> = (layerDiff[layer] = {});
    for (const s of settings) {
      const img = await raw(png(layer, s));
      row[s] = { vsRef: diff(img, ref), vsGT: diff(img, gt), ...results.timings[`${layer}-${s}`] };
    }
  }
  results.layers = layerDiff;
  save(results);
  const source = async (c: Box, s: string) => (c.src ? await sharp(png(c.src, s)).flatten({ background: PAPER }).png().toBuffer() : comps[s]!);
  const cropDiff: Record<string, Record<string, unknown>> = {};
  for (const c of CROPS) {
    const row: Record<string, unknown> = (cropDiff[c.name] = {});
    const ref = await raw(await source(c, "ref768"));
    const gt = await raw(await source(c, "gt4096"));
    for (const s of settings) {
      const img = await raw(await source(c, s));
      row[s] = { vsRef: diff(img, ref, c), vsGT: diff(img, gt, c) };
    }
  }
  results.crops = cropDiff;
  save(results);

  // Sheets: rows = crops, columns = settings; one at 100%, one at 200% (nearest).
  for (const scale of [1, 2]) {
    const cw = 160 * scale;
    const pad = 8;
    const head = 28;
    const labelW = 150;
    const W = labelW + settings.length * (cw + pad);
    const H = head + CROPS.length * (cw + pad);
    const tiles: OverlayOptions[] = [];
    const text: string[] = [];
    settings.forEach((s, j) => text.push(`<text x="${labelW + j * (cw + pad) + 4}" y="19">${s}</text>`));
    for (const [i, c] of CROPS.entries()) {
      const top = head + i * (cw + pad);
      text.push(`<text x="4" y="${top + 20}">${c.name}</text><text x="4" y="${top + 40}" class="s">${scale * 100}%</text>`);
      for (const [j, s] of settings.entries()) {
        const tile = await sharp(await source(c, s))
          .extract({ left: c.x, top: c.y, width: c.w, height: c.h })
          .resize(cw, cw, { kernel: "nearest" })
          .png()
          .toBuffer();
        tiles.push({ input: tile, left: labelW + j * (cw + pad), top });
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><style>text{font:600 15px sans-serif;fill:#222}.s{font-weight:400;fill:#666}</style>${text.join("")}</svg>`;
    tiles.push({ input: Buffer.from(svg), left: 0, top: 0 });
    await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .composite(tiles)
      .png()
      .toFile(`${OUT}/SHEET-${scale * 100}.png`);
  }
  console.log(`wrote ${OUT}/SHEET-100.png, SHEET-200.png, results.json`);
}

const cmd = process.argv[2];
if (cmd === "render") render();
else if (cmd === "sheet") sheet().catch((e) => { console.error(e); process.exit(1); });
else throw new Error("usage: denoise-check.ts render|sheet");
