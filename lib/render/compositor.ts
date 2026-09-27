// Browser compositor for the 3D preview (WS2c). Framework-free WebGL2, so it
// embeds in a host page as easily as in the Modbench configurator.
//
// Layers are drawn back to front with premultiplied blending:
//   beauty  -- a finished image (case, hands, strap): drawn as is.
//   surface -- a printed part (dial, date wheel, chapter ring, insert),
//              rendered once as geometry-only passes; the print is applied
//              here. Per pixel, in linear light:
//                colour = base + cov * print(uv) * (light + meanAlbedo * bounce)
//              then Blender's AgX, from the LUT make_agx_lut.py baked. The
//              print's alpha cuts through (a dial's date window shows the
//              date layer beneath). Arithmetic mirrors scripts/render/pack-passes.ts
//              composite(), which the offline check measures.
//
// Each layer is blended onto the stack by shader, per its `blend`:
//   over     -- plain premultiplied over, in display values.
//   disjoint -- for a layer rendered with what's beneath it held out (the
//               case over the inner parts, a separate strap over the case).
//               At a seam the two coverages don't overlap, so they add:
//               below is weighted by min(1, (1 - a) / a_below), not (1 - a).
//               Plain over left a coverage hole on every seam pixel.
//   linear   -- over in linear light (display values mapped back through
//               Blender's AgX curve), for layers whose edges mix bright
//               with dark: polished hands over a dial. A display-space mix
//               of the two comes out darker than the render's.
// WS2c whole-build check: seams and hand edges were the worst 1% of pixels.

export type Blend = "over" | "disjoint" | "linear";

export interface BeautyLayer {
  kind: "beauty";
  src: string;
  blend?: Blend;
}
export interface SurfaceLayer {
  kind: "surface";
  /** File stem: <stem>-uv.png, -light.png, -bounce.png, -base.png. */
  stem: string;
  /** Print image (vendor photo or generated), UV-mapped by the renderer. */
  print: string;
  blend?: Blend;
}
export type Layer = BeautyLayer | SurfaceLayer;

const N = 33;
const LUT_MIN_EV = -12.0;
const LUT_MAX_EV = 4.5;

const VERT = `#version 300 es
in vec2 p; out vec2 v;
void main() { v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const BEAUTY_FRAG = `#version 300 es
precision highp float;
in vec2 v; out vec4 o; uniform sampler2D uImg;
void main() { o = texture(uImg, vec2(v.x, 1.0 - v.y)); }`;

const SURFACE_FRAG = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D uUV, uLight, uBounce, uBase, uPrint;
uniform highp sampler3D uLut;
uniform vec3 uAbar;
vec3 eotf(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec2 decodeUV(vec4 t) {
  vec3 b = floor(t.rgb * 255.0 + 0.5);
  return vec2(b.r * 16.0 + floor(b.g / 16.0), mod(b.g, 16.0) * 256.0 + b.b) / 4095.0;
}
vec3 agx(vec3 c) {
  vec3 t = clamp((log2(max(c, vec3(1e-10))) - (${LUT_MIN_EV.toFixed(1)})) / (${(LUT_MAX_EV - LUT_MIN_EV).toFixed(1)}), 0.0, 1.0);
  return texture(uLut, (t * ${(N - 1).toFixed(1)} + 0.5) / ${N.toFixed(1)}).rgb;
}
vec4 printAt(vec2 uv) {
  vec4 s = textureLod(uPrint, vec2(uv.x, 1.0 - uv.y), 0.0);   // premultiplied sRGB
  return vec4(eotf(s.rgb / max(s.a, 1e-4)) * s.a, s.a);
}
void main() {
  ivec2 q = ivec2(int(gl_FragCoord.x), textureSize(uBase, 0).y - 1 - int(gl_FragCoord.y));
  vec4 base = texelFetch(uBase, q, 0);
  vec4 uvp = texelFetch(uUV, q, 0);
  vec3 col = eotf(base.rgb);
  float alpha = base.a;
  float cov = uvp.a;
  vec2 uv = decodeUV(uvp);
  // Footprint of this pixel in the print: Cycles filters ~1.5px, one tap aliases.
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  if (length(dx) > 0.02) dx = vec2(0.0);
  if (length(dy) > 0.02) dy = vec2(0.0);
  if (cov > 0.0) {
    vec4 t = vec4(0.0); float ws = 0.0;
    for (int a = 0; a < 4; a++) for (int b = 0; b < 4; b++) {
      float ta = (float(a) - 1.5) * 0.375, tb = (float(b) - 1.5) * 0.375;   // +-0.5625 of +-0.75px
      float w = (1.0 - abs(ta) / 0.75) * (1.0 - abs(tb) / 0.75);
      t += w * printAt(uv + dx * ta - dy * tb); ws += w;
    }
    t /= ws;
    vec3 L = eotf(texelFetch(uLight, q, 0).rgb) + uAbar * eotf(texelFetch(uBounce, q, 0).rgb);
    col += cov * t.rgb * L;
    alpha *= 1.0 - cov * (1.0 - t.a);
  }
  vec3 disp = agx(col * 4.0 / max(alpha, 1e-4));
  o = vec4(disp * alpha, alpha);
}`;

// Blends a layer (uLayer) onto the stack so far (uAcc); both premultiplied display RGBA.
const COMBINE_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uLayer, uAcc;
uniform int uMode;          // 0 over, 1 disjoint, 2 linear
uniform float uCurve[${N}]; // AgX display value along the grey axis, per LUT step
float toLin(float d) {
  float t = 1.0;
  if (d <= uCurve[0]) t = 0.0;
  else for (int i = 1; i < ${N}; i++) if (d <= uCurve[i]) { t = (float(i - 1) + (d - uCurve[i - 1]) / max(uCurve[i] - uCurve[i - 1], 1e-6)) / ${(N - 1).toFixed(1)}; break; }
  return exp2(${LUT_MIN_EV.toFixed(1)} + t * ${(LUT_MAX_EV - LUT_MIN_EV).toFixed(1)});
}
float fromLin(float l) {
  float x = clamp((log2(max(l, 1e-12)) - (${LUT_MIN_EV.toFixed(1)})) / ${(LUT_MAX_EV - LUT_MIN_EV).toFixed(1)}, 0.0, 1.0) * ${(N - 1).toFixed(1)};
  int i = min(int(x), ${N - 2});
  return mix(uCurve[i], uCurve[i + 1], x - float(i));
}
vec3 toLin3(vec3 c) { return vec3(toLin(c.r), toLin(c.g), toLin(c.b)); }
vec3 fromLin3(vec3 c) { return vec3(fromLin(c.r), fromLin(c.g), fromLin(c.b)); }
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uLayer, q, 0), d = texelFetch(uAcc, q, 0);
  float a = s.a, ab = d.a;
  float f = uMode == 1 ? (ab > 0.0 ? min(1.0, (1.0 - a) / ab) : 1.0) : 1.0 - a;
  float na = min(a + ab * f, 1.0);
  vec3 c = s.rgb + d.rgb * f;
  if (uMode == 2 && a > 0.0 && ab > 0.0) {
    vec3 lin = (toLin3(s.rgb / a) * a + toLin3(d.rgb / ab) * ab * f) / max(a + ab * f, 1e-6);
    c = fromLin3(lin) * na;
  }
  o = vec4(c, na);
}`;

const COPY_FRAG = `#version 300 es
precision highp float;
out vec4 o; uniform sampler2D uAcc;
void main() { o = texelFetch(uAcc, ivec2(gl_FragCoord.xy), 0); }`;

async function bitmap(src: string, premultiply: boolean): Promise<ImageBitmap> {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`${src}: ${res.status}`);
  return createImageBitmap(await res.blob(), { premultiplyAlpha: premultiply ? "premultiply" : "none", colorSpaceConversion: "none" });
}

/** Mean linear albedo of a print over its opaque texels -- the `a` in light + a * bounce. */
function meanAlbedo(img: ImageBitmap): [number, number, number] {
  const c = new OffscreenCanvas(64, 64);
  const g = c.getContext("2d", { colorSpace: "srgb" })!;
  g.drawImage(img, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  const e = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
  const s = [0, 0, 0];
  let w = 0;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]! / 255;
    for (let ch = 0; ch < 3; ch++) s[ch]! += e(d[i + ch]! / 255) * a;
    w += a;
  }
  return w > 0 ? [s[0]! / w, s[1]! / w, s[2]! / w] : [0, 0, 0];
}

export class Compositor {
  private gl: WebGL2RenderingContext;
  private beauty: WebGLProgram;
  private surface: WebGLProgram;
  private combine: WebGLProgram;
  private copy: WebGLProgram;
  private lut: WebGLTexture | null = null;
  private curve = new Float32Array(N);
  // Offscreen targets: one layer, two stacks (ping-pong), at the layers' size.
  private targets: { size: number; tex: WebGLTexture[]; fbo: WebGLFramebuffer[] } | null = null;
  private textures = new Map<string, { tex: WebGLTexture; w: number; abar?: [number, number, number] }>();
  private layers: Layer[] = [];

  /** Throws when WebGL2 isn't available; callers fall back to the SVG diagram. */
  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.beauty = this.program(BEAUTY_FRAG);
    this.surface = this.program(SURFACE_FRAG);
    this.combine = this.program(COMBINE_FRAG);
    this.copy = this.program(COPY_FRAG);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  private program(frag: string): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    return p;
  }

  async loadLut(src: string) {
    const img = await bitmap(src, false);
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    // Slices side by side (x = b*N + r), rows = g  ->  3D [b][g][r].
    const out = new Uint8Array(N * N * N * 4);
    for (let b = 0; b < N; b++) for (let gg = 0; gg < N; gg++) for (let r = 0; r < N; r++) {
      const s = (gg * img.width + b * N + r) * 4;
      out.set([d[s]!, d[s + 1]!, d[s + 2]!, 255], ((b * N + gg) * N + r) * 4);
    }
    for (let i = 0; i < N; i++) {
      const s = (i * img.width + i * N + i) * 4;
      this.curve[i] = (d[s]! + d[s + 1]! + d[s + 2]!) / 3 / 255;
    }
    const gl = this.gl;
    this.lut = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.lut);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, k, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /** Loads (once) an image as a texture. Data passes are exact texels; prints and beauty are filtered, premultiplied. */
  private async texture(src: string, kind: "data" | "image" | "print") {
    const hit = this.textures.get(src);
    if (hit) return hit;
    const img = await bitmap(src, kind !== "data");
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const filter = kind === "data" ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const entry = { tex, w: img.width, ...(kind === "print" ? { abar: meanAlbedo(img) } : {}) };
    this.textures.set(src, entry);
    img.close();
    return entry;
  }

  /** Sets the stack and loads anything not yet loaded; draw() once it resolves. */
  async setLayers(layers: Layer[], dir: string) {
    await Promise.all(
      layers.flatMap((l) =>
        l.kind === "beauty"
          ? [this.texture(`${dir}/${l.src}`, "image")]
          : [...["uv", "light", "bounce", "base"].map((k) => this.texture(`${dir}/${l.stem}-${k}.png`, "data")), this.texture(l.print, "print")],
      ),
    );
    this.layers = layers;
    this.dir = dir;
  }
  private dir = "";

  private ensureTargets(size: number) {
    if (this.targets?.size === size) return;
    const gl = this.gl;
    if (this.targets) {
      this.targets.tex.forEach((t) => gl.deleteTexture(t));
      this.targets.fbo.forEach((f) => gl.deleteFramebuffer(f));
    }
    const tex: WebGLTexture[] = [];
    const fbo: WebGLFramebuffer[] = [];
    for (let i = 0; i < 3; i++) {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const f = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      tex.push(t);
      fbo.push(f);
    }
    this.targets = { size, tex, fbo };
  }

  private quad(p: WebGLProgram) {
    const gl = this.gl;
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  draw() {
    const gl = this.gl;
    // Canvas matches the layers' own size (hero 1600px, top 800px): the
    // surface shader reads its passes texel for pixel.
    const first = this.layers[0];
    const size = !first ? 1 : this.textures.get(first.kind === "beauty" ? `${this.dir}/${first.src}` : `${this.dir}/${first.stem}-base.png`)!.w;
    if (this.canvas.width !== size) this.canvas.width = this.canvas.height = size;
    this.ensureTargets(size);
    const { tex, fbo } = this.targets!;
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    // tex[0] = this layer; tex[1] / tex[2] = stack so far, ping-pong.
    let acc = 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[acc]!);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const bind = (p: WebGLProgram, unit: number, name: string, t: WebGLTexture, target: number = gl.TEXTURE_2D) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(target, t);
      gl.uniform1i(gl.getUniformLocation(p, name), unit);
    };
    for (const l of this.layers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[0]!);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const p = l.kind === "beauty" ? this.beauty : this.surface;
      this.quad(p);
      if (l.kind === "beauty") {
        bind(p, 0, "uImg", this.textures.get(`${this.dir}/${l.src}`)!.tex);
      } else {
        ["uv", "light", "bounce", "base"].forEach((k, i) =>
          bind(p, i, `u${k === "uv" ? "UV" : k[0]!.toUpperCase() + k.slice(1)}`, this.textures.get(`${this.dir}/${l.stem}-${k}.png`)!.tex),
        );
        const pr = this.textures.get(l.print)!;
        bind(p, 4, "uPrint", pr.tex);
        bind(p, 5, "uLut", this.lut!, gl.TEXTURE_3D);
        gl.uniform3fv(gl.getUniformLocation(p, "uAbar"), pr.abar ?? [0, 0, 0]);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const next = acc === 1 ? 2 : 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo[next]!);
      this.quad(this.combine);
      bind(this.combine, 0, "uLayer", tex[0]!);
      bind(this.combine, 1, "uAcc", tex[acc]!);
      gl.uniform1i(gl.getUniformLocation(this.combine, "uMode"), l.blend === "disjoint" ? 1 : l.blend === "linear" ? 2 : 0);
      gl.uniform1fv(gl.getUniformLocation(this.combine, "uCurve"), this.curve);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      acc = next;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.quad(this.copy);
    bind(this.copy, 0, "uAcc", tex[acc]!);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();
  }

  /** Draws and reads back the premultiplied RGBA pixels, top row first -- for checks against full renders. */
  snapshot(): { data: Uint8Array; w: number; h: number } {
    this.draw();
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const raw = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) data.set(raw.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return { data, w, h };
  }
}
