// Packs a layer's geometry-only passes (render_solid.py PASSES=) into what
// the browser compositor loads, and checks the composite against a render.
//
//   npx tsx scripts/render/pack-passes.ts <passDir@0.05>,<passDir@0.5> <outPrefix> [--check <texture.png> <referenceDir>]
//
// The two pass dirs are the same layer rendered with PASSES_GREY=0.05 and 0.5.
// Writes <outPrefix>-uv.png, -light.png, -bounce.png, -base.png (8-bit; see below).
// --check rebuilds the layer from those packed files and <texture.png>, with
// the same arithmetic as the WebGL shader, and compares it with the
// `combined` pass in <referenceDir> (a render of that texture): mean absolute
// difference and 99th percentile, 8-bit display values, over covered pixels.
//
// Why 8-bit: browsers decode 16-bit PNGs to 8 bits before WebGL sees them.
//   uv:    U and V at 12 bits each across RGB; A = printed-surface coverage.
//   light:  diffuse light on printed surfaces for a black print (L0), x0.25, sRGB-encoded.
//   bounce: extra light per unit of print albedo (slope), x0.25, sRGB-encoded.
//   base:   everything else (metal, gloss, lume, shadow), premultiplied, x0.25, sRGB-encoded; A = alpha.
// The browser computes, in linear light, then tone-maps:
//   colour = base + coverage * texture(uv) * (light + meanAlbedo(texture) * bounce)

import sharp from "sharp";

type F = { data: Float32Array; w: number; h: number; c: number };

async function read16(file: string): Promise<F> {
  // rgb16, or sharp converts to 8-bit sRGB before the raw output.
  const { data, info } = await sharp(file).toColourspace("rgb16").raw({ depth: "ushort" }).toBuffer({ resolveWithObject: true });
  const u16 = new Uint16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const f = new Float32Array(u16.length);
  for (let i = 0; i < u16.length; i++) f[i] = u16[i]! / 65535;
  return { data: f, w: info.width, h: info.height, c: info.channels };
}

async function read8(file: string): Promise<{ data: Uint8Array; w: number; h: number; c: number }> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height, c: info.channels };
}

export const oetf = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
export const eotf = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const enc = (x: number) => Math.round(clamp(oetf(clamp(x))) * 255);
const dec = (b: number) => eotf(b / 255);
const EOTF8 = Float32Array.from({ length: 256 }, (_, i) => dec(i));

function pass(dir: string, name: string) {
  return read16(`${dir}/${name}0001.png`);
}

/**
 * Grey levels the two pass renders use (render_solid.py PASSES_GREY). Light on
 * a printed surface includes its own bounce off the polished bore wall, which
 * grows with the print's brightness; two greys give L(a) = L0 + a * slope, and
 * the browser plugs in the texture's mean albedo.
 */
export const GREYS = [0.05, 0.5] as const;

/** The 8-bit images the browser loads, from one layer's 16-bit passes at the two greys. */
export async function pack(dir: string, dir2?: string) {
  const [combined, diffcol, difflight, uvp, mask] = (await Promise.all(["combined", "diffcol", "difflight", "uv", "mask"].map((n) => pass(dir, n)))) as [F, F, F, F, F];
  const difflight2 = dir2 ? await pass(dir2, "difflight") : null;
  const { w, h } = combined;
  const n = w * h;
  const uv = new Uint8Array(n * 4);
  const light = new Uint8Array(n * 4);
  const bounce = new Uint8Array(n * 4);
  const base = new Uint8Array(n * 4);
  for (let p = 0; p < n; p++) {
    const cov = mask.data[p * mask.c]!;
    // AOVs are pixel-filtered like everything else, so an edge pixel holds
    // uv x coverage; divide it back out.
    const u = cov > 0 ? clamp(uvp.data[p * uvp.c]! / cov) : 0;
    const v = cov > 0 ? clamp(uvp.data[p * uvp.c + 1]! / cov) : 0;
    const U = Math.round(u * 4095);
    const V = Math.round(v * 4095);
    uv[p * 4] = U >> 4;
    uv[p * 4 + 1] = ((U & 15) << 4) | (V >> 8);
    uv[p * 4 + 2] = V & 255;
    uv[p * 4 + 3] = Math.round(clamp(cov) * 255);
    for (let ch = 0; ch < 3; ch++) {
      const L1 = difflight.data[p * difflight.c + ch]!; // already x0.25, at GREYS[0]
      const slope = difflight2 ? Math.max(0, (difflight2.data[p * difflight2.c + ch]! - L1) / (GREYS[1] - GREYS[0])) : 0;
      const printed = cov * diffcol.data[p * diffcol.c + ch]! * L1;
      light[p * 4 + ch] = enc(L1 - GREYS[0] * slope);
      bounce[p * 4 + ch] = enc(slope);
      base[p * 4 + ch] = enc(combined.data[p * combined.c + ch]! - printed);
    }
    light[p * 4 + 3] = bounce[p * 4 + 3] = 255;
    base[p * 4 + 3] = Math.round(clamp(combined.data[p * combined.c + 3]!) * 255);
  }
  return { w, h, uv, light, bounce, base };
}

/** Mean linear albedo per channel over a texture's opaque texels: the `a` in L0 + a * slope. */
export function meanAlbedo(tex: { data: Uint8Array; w: number; h: number; c: number }): [number, number, number] {
  const s = [0, 0, 0];
  let wsum = 0;
  for (let i = 0; i < tex.w * tex.h; i++) {
    const a = tex.c === 4 ? tex.data[i * tex.c + 3]! / 255 : 1;
    for (let ch = 0; ch < 3; ch++) s[ch]! += EOTF8[tex.data[i * tex.c + ch]!]! * a;
    wsum += a;
  }
  return [s[0]! / wsum, s[1]! / wsum, s[2]! / wsum];
}

/**
 * Bilinear sample of an 8-bit sRGB texture, returned in linear light and
 * premultiplied by its alpha -- Cycles' image Color is associated, so a
 * transparent texel (a dial's cut date window) reads black, whatever RGB it
 * stores. Blender's UV origin is bottom-left.
 */
function sampler(tex: { data: Uint8Array; w: number; h: number; c: number }) {
  return (u: number, v: number, ch: number) => {
    const x = u * tex.w - 0.5;
    const y = (1 - v) * tex.h - 0.5;
    const x0 = Math.max(0, Math.min(tex.w - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(tex.h - 1, Math.floor(y)));
    const x1 = Math.min(tex.w - 1, x0 + 1);
    const y1 = Math.min(tex.h - 1, y0 + 1);
    const fx = clamp(x - x0);
    const fy = clamp(y - y0);
    const at = (xx: number, yy: number) => {
      const k = (yy * tex.w + xx) * tex.c;
      return EOTF8[tex.data[k + ch]!]! * (tex.c === 4 ? tex.data[k + 3]! / 255 : 1);
    };
    return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
  };
}

/** Packed UV at pixel i, or null where no printed surface is. */
export function uvAt(p: { uv: Uint8Array }, i: number): [number, number] | null {
  if (p.uv[i * 4 + 3] === 0) return null;
  const U = (p.uv[i * 4]! << 4) | (p.uv[i * 4 + 1]! >> 4);
  const V = ((p.uv[i * 4 + 1]! & 15) << 8) | p.uv[i * 4 + 2]!;
  return [U / 4095, V / 4095];
}

/** 4x4 tent-weighted taps across +-FOOTPRINT px of the pixel, in UV space. */
const FOOTPRINT = Number(process.env.FOOTPRINT ?? 0.75);
const TAPS = [-0.75, -0.25, 0.25, 0.75].map((t) => t * FOOTPRINT);
const TAP_W = TAPS.map((t) => 1 - Math.abs(t) / (FOOTPRINT * 1.0001));

/**
 * The shader's arithmetic, on the packed images: linear, premultiplied,
 * x0.25. The texture is averaged over each pixel's footprint in UV space
 * (derivatives from the neighbouring pixels) -- Cycles filters every pixel
 * over ~1.5px, so a single tap aliases along print edges.
 */
export function composite(p: Awaited<ReturnType<typeof pack>>, tex: Parameters<typeof sampler>[0]) {
  const s = sampler(tex);
  const abar = meanAlbedo(tex);
  const out = new Float32Array(p.w * p.h * 4);
  for (let i = 0; i < p.w * p.h; i++) {
    const cov = p.uv[i * 4 + 3]! / 255;
    const uv = uvAt(p, i);
    const x = i % p.w;
    const nb = (dx: number, dy: number) => (x + dx >= 0 && x + dx < p.w ? uvAt(p, i + dx + dy * p.w) : null);
    const deriv = (a: [number, number] | null, b: [number, number] | null, c: [number, number]) =>
      a && b ? [(a[0] - b[0]) / 2, (a[1] - b[1]) / 2] : a ? [a[0] - c[0], a[1] - c[1]] : b ? [c[0] - b[0], c[1] - b[1]] : [0, 0];
    const t = [0, 0, 0];
    if (uv) {
      const dx = deriv(nb(1, 0), nb(-1, 0), uv);
      const dy = deriv(nb(0, 1), nb(0, -1), uv);
      let wsum = 0;
      for (let a = 0; a < 4; a++) {
        for (let b = 0; b < 4; b++) {
          const w = TAP_W[a]! * TAP_W[b]!;
          const u = uv[0] + dx[0]! * TAPS[a]! + dy[0]! * TAPS[b]!;
          const v = uv[1] + dx[1]! * TAPS[a]! + dy[1]! * TAPS[b]!;
          for (let ch = 0; ch < 3; ch++) t[ch]! += w * s(u, v, ch);
          wsum += w;
        }
      }
      for (let ch = 0; ch < 3; ch++) t[ch] = t[ch]! / wsum;
    }
    for (let ch = 0; ch < 3; ch++) {
      const L = EOTF8[p.light[i * 4 + ch]!]! + abar[ch]! * EOTF8[p.bounce[i * 4 + ch]!]!;
      out[i * 4 + ch] = EOTF8[p.base[i * 4 + ch]!]! + cov * t[ch]! * L;
    }
    out[i * 4 + 3] = p.base[i * 4 + 3]! / 255;
  }
  return out;
}

/** 8-bit display difference over covered pixels: straight colour, x4 back to scene light, sRGB-encoded. */
export function compare(a: Float32Array, ref: F) {
  const diffs: number[] = [];
  let sum = 0;
  let signed = 0;
  let n = 0;
  for (let i = 0; i < ref.w * ref.h; i++) {
    const ra = ref.data[i * ref.c + 3]!;
    const aa = a[i * 4 + 3]!;
    if (ra < 0.01 && aa < 0.01) continue;
    let worst = 0;
    for (let ch = 0; ch < 3; ch++) {
      const x = enc((a[i * 4 + ch]! * 4) / Math.max(aa, 1e-4));
      const y = enc((ref.data[i * ref.c + ch]! * 4) / Math.max(ra, 1e-4));
      const d = Math.abs(x - y) * Math.max(aa, ra);
      sum += d;
      signed += (x - y) * Math.max(aa, ra);
      n++;
      if (d > worst) worst = d;
    }
    diffs.push(worst);
  }
  diffs.sort((x, y) => x - y);
  return { mad: +(sum / n).toFixed(2), bias: +(signed / n).toFixed(2), p99: +(diffs[Math.floor(diffs.length * 0.99)] ?? 0).toFixed(1), px: diffs.length };
}

async function main() {
  const [dirs, prefix, flag, texFile, refDir] = process.argv.slice(2);
  if (!dirs || !prefix) throw new Error("usage: pack-passes.ts <passDir@0.05>[,<passDir@0.5>] <outPrefix> [--check <texture.png> <referenceDir>]");
  const [dir, dir2] = dirs.split(",") as [string, string | undefined];
  const p = await pack(dir, dir2);
  const raw = { raw: { width: p.w, height: p.h, channels: 4 as const } };
  await Promise.all(
    (["uv", "light", "bounce", "base"] as const).map((k) => sharp(Buffer.from(p[k]), raw).png({ compressionLevel: 9 }).toFile(`${prefix}-${k}.png`)),
  );
  console.log(`packed ${p.w}x${p.h} -> ${prefix}-{uv,light,bounce,base}.png`);
  if (flag === "--check" && texFile && refDir) {
    const tex = await read8(texFile);
    const ref = await pass(refDir, "combined");
    const r = compare(composite(p, tex), ref);
    console.log(`check ${texFile} vs ${refDir}: MAD ${r.mad}, bias ${r.bias}, p99 ${r.p99}, over ${r.px} px`);
  }
}

if (process.argv[1]?.endsWith("pack-passes.ts")) main().catch((e) => { console.error(e); process.exit(1); });
