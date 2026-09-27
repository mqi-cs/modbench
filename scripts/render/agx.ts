// Blender's AgX view transform via the baked LUT (make_agx_lut.py), exactly
// as the browser compositor's shader samples it: log2 shaper, trilinear.
// The three.js AgX approximation came out 11-13 levels brighter than
// Blender, so the transform is baked, not approximated (WS2c).
//
//   npx tsx scripts/render/agx.ts <passDir>   -- compares agx(combined) with Blender's beauty.png

import sharp from "sharp";

export const LUT_N = 33;
export const LUT_MIN_EV = -12.0;
export const LUT_MAX_EV = 4.5;
export const LUT_FILE = "public/render/agx-lut.png";

type V3 = [number, number, number];

export async function loadLut(file = LUT_FILE) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width };
}

/** Scene-linear sRGB -> display sRGB (0..1). */
export function agx(lut: Awaited<ReturnType<typeof loadLut>>, c: V3): V3 {
  const N = LUT_N;
  const t = c.map((x) => Math.min(1, Math.max(0, (Math.log2(Math.max(x, 1e-10)) - LUT_MIN_EV) / (LUT_MAX_EV - LUT_MIN_EV))) * (N - 1));
  const i0 = t.map((x) => Math.min(N - 2, Math.floor(x)));
  const f = t.map((x, k) => x - i0[k]!);
  const at = (r: number, g: number, b: number, ch: number) => lut.data[(g * lut.w + b * N + r) * 3 + ch]! / 255;
  const out: V3 = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    let v = 0;
    for (let dr = 0; dr < 2; dr++)
      for (let dg = 0; dg < 2; dg++)
        for (let db = 0; db < 2; db++) {
          const w = (dr ? f[0]! : 1 - f[0]!) * (dg ? f[1]! : 1 - f[1]!) * (db ? f[2]! : 1 - f[2]!);
          v += w * at(i0[0]! + dr, i0[1]! + dg, i0[2]! + db, ch);
        }
    out[ch] = v;
  }
  return out;
}

async function main() {
  const dir = process.argv[2]!;
  const lut = await loadLut();
  const c = await sharp(`${dir}/combined0001.png`).toColourspace("rgb16").raw({ depth: "ushort" }).toBuffer({ resolveWithObject: true });
  const lin = new Uint16Array(c.data.buffer, c.data.byteOffset, c.data.byteLength / 2);
  const b = await sharp(`${dir}/beauty.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let signed = 0;
  let n = 0;
  const worst: number[] = [];
  for (let i = 0; i < c.info.width * c.info.height; i++) {
    const a = lin[i * 4 + 3]! / 65535;
    if (a < 0.99) continue; // interior only: edges mix alpha conventions
    const px = agx(lut, [0, 1, 2].map((ch) => (lin[i * 4 + ch]! / 65535) * 4) as V3);
    let w = 0;
    for (let ch = 0; ch < 3; ch++) {
      const d = px[ch]! * 255 - b.data[i * 4 + ch]!;
      sum += Math.abs(d);
      signed += d;
      n++;
      w = Math.max(w, Math.abs(d));
    }
    worst.push(w);
  }
  worst.sort((x, y) => x - y);
  console.log(`agx(combined) vs Blender beauty: MAD ${(sum / n).toFixed(2)}, bias ${(signed / n).toFixed(2)}, p99 ${worst[Math.floor(worst.length * 0.99)]?.toFixed(1)}, over ${worst.length} px`);
}

if (process.argv[1]?.endsWith("agx.ts")) main().catch((e) => { console.error(e); process.exit(1); });
