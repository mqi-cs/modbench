// render-config.json, and the one place the render content hash is built
// (WS2c portability). Used by scripts/render/run.ts and its tests.
//
// The hash covers what decides pixels, resolved: referenceRenderer (name,
// revision, Blender version), the settings blocks, and the input textures'
// bytes. Not source code -- a change to how a render is dispatched (device
// selection, dry runs) must not re-render everything. The code that does
// decide pixels is fingerprinted separately (sourceFingerprint) and checked
// by a test, so changing it forces a deliberate revision decision.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export const CONFIG_FILE = "scripts/render/render-config.json";

export interface RenderConfig {
  referenceRenderer: { name: string; revision: number; blender: string };
  sourceFingerprint: { files: string[]; sha256: string };
  [block: string]: unknown;
}

/** Blocks whose values change pixels. `device` is where a render runs, not what it draws. */
export const PIXEL_SETTINGS = ["sampling", "denoise", "cycles", "colour", "output", "scene", "passes"] as const;

export const loadConfig = (file = CONFIG_FILE): RenderConfig => JSON.parse(readFileSync(file, "utf8"));

/** JSON with sorted keys and "//" comments dropped, so formatting and notes never change a hash. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>).filter(([k]) => k !== "//").sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const lf = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");

/** Fingerprint of the pixel-deciding source files (LF-normalised, so CRLF and LF checkouts agree). */
export function sourceFingerprint(config: RenderConfig): string {
  return sha(config.sourceFingerprint.files.map((f) => `${f}\n${sha(lf(f))}`).join("\n"));
}

/** The renderer version every job hash includes. */
export function rendererVersion(config: RenderConfig, textures: string[]): string {
  const settings = Object.fromEntries(PIXEL_SETTINGS.map((k) => [k, config[k]]));
  // Keyed by file name, not path: TEX_DIR may differ between machines.
  const tex = Object.fromEntries(textures.map((f) => [basename(f), sha(readFileSync(f))]));
  return sha(canonical({ referenceRenderer: config.referenceRenderer, settings, textures: tex })).slice(0, 16);
}
