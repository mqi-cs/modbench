// WS2c step 6: can a metal finish be a tint of the steel render, or does each
// finish need its own? Tints steel's linear combined by the finish's base
// colour ratio (render_solid.py FINISHES, brushed and polished averaged),
// tone-maps both through the baked AgX LUT, compares with the real render.
//
//   npx tsx scripts/render/tint-check.ts <steelPassDir> <finish>=<passDir> ...

import sharp from "sharp";
import { agx, loadLut } from "./agx";

type V3 = [number, number, number];
const STEEL: V3 = [0.64, 0.64, 0.64];
// Mean of each finish's brushed and polished base colours (render_solid.py).
const FINISH: Record<string, V3> = {
  gold: [0.95, 0.74, 0.35],
  rose: [0.935, 0.68, 0.555],
  pvd: [0.045, 0.045, 0.05],
  matte: [0.0575, 0.0575, 0.0625],
};

async function linear(dir: string) {
  const { data, info } = await sharp(`${dir}/combined0001.png`).toColourspace("rgb16").raw({ depth: "ushort" }).toBuffer({ resolveWithObject: true });
  return { px: new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2), w: info.width, h: info.height };
}

async function main() {
  const [steelDir, ...rest] = process.argv.slice(2);
  const lut = await loadLut();
  const steel = await linear(steelDir!);
  for (const arg of rest) {
    const [name, dir] = arg.split("=") as [string, string];
    const real = await linear(dir);
    const k = FINISH[name]!.map((c, i) => c / STEEL[i]!) as V3;
    let sum = 0;
    let n = 0;
    const worst: number[] = [];
    for (let i = 0; i < steel.w * steel.h; i++) {
      const a = steel.px[i * 4 + 3]! / 65535;
      const b = real.px[i * 4 + 3]! / 65535;
      if (a < 0.99 || b < 0.99) continue;
      const t = agx(lut, [0, 1, 2].map((ch) => (steel.px[i * 4 + ch]! / 65535) * 4 * k[ch]!) as V3);
      const r = agx(lut, [0, 1, 2].map((ch) => (real.px[i * 4 + ch]! / 65535) * 4) as V3);
      let w = 0;
      for (let ch = 0; ch < 3; ch++) {
        const d = Math.abs(t[ch]! - r[ch]!) * 255;
        sum += d;
        n++;
        w = Math.max(w, d);
      }
      worst.push(w);
    }
    worst.sort((x, y) => x - y);
    console.log(`${name}: tinted steel vs real render: MAD ${(sum / n).toFixed(2)}, p99 ${worst[Math.floor(worst.length * 0.99)]?.toFixed(1)}, over ${worst.length} px`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
