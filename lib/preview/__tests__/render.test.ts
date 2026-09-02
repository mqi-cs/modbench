import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { db } from "../../db/client";
import { parts } from "../../db/schema";
import { eq } from "drizzle-orm";
import { STARTER_BUILDS } from "../../../data/fixtures/starter-builds";
import { drawCalls, resolveLayers } from "../composite";
import { familyPlatform } from "../../compat/platform";
import { CANVAS, DEFAULT_PLATFORM, PLATFORM_GEOMETRY } from "../layers";

// specs/05-phase-4-preview.md pass measure 7: "Canvas exports a valid PNG
// blob."
//
// The browser half of that -- canvas.toBlob -- cannot run here. What can
// run is everything it depends on: that each draw call names a file that
// exists, that every file decodes, that they are all canvas-sized, and
// that compositing them in order yields a valid image. A missing or
// corrupt asset is the failure this actually guards against, and the pure
// composite tests cannot see it because they never touch the filesystem.

const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
const byName = new Map(approved.map((p) => [p.name, p]));
const previewable = new Set(approved.filter((p) => p.assetState === "ready").map((p) => p.id));
const names = Object.fromEntries(approved.map((p) => [p.id, p.name]));

function layersFor(starter: (typeof STARTER_BUILDS)[number]) {
  const resolved: Record<string, string> = {};
  for (const [slot, name] of Object.entries(starter.partNames)) {
    const part = byName.get(name);
    if (part) resolved[slot] = part.id;
  }
  const caseFamily = starter.partNames.case ? byName.get(starter.partNames.case)?.family : undefined;
  const platform = caseFamily ? familyPlatform(caseFamily) : null;
  return resolveLayers({
    parts: resolved,
    previewable,
    names,
    platform: platform && platform in PLATFORM_GEOMETRY ? platform : DEFAULT_PLATFORM,
    hasCase: Boolean(resolved.case),
  });
}

describe("rendered output", () => {
  for (const starter of STARTER_BUILDS) {
    it(`composites ${starter.name} into a valid image`, async () => {
      const calls = drawCalls(layersFor(starter));
      expect(calls.length).toBeGreaterThan(3);

      for (const call of calls) {
        const file = `public${call.src}`;
        expect(existsSync(file), `${call.src} is in the draw list but not on disk`).toBe(true);
        const meta = await sharp(file).metadata();
        // Every asset is canvas-sized and pre-centred, which is what lets
        // the draw loop be a flat list of full-size blits.
        expect(meta.width, `${call.src} is not canvas-sized`).toBe(CANVAS);
        expect(meta.height, `${call.src} is not canvas-sized`).toBe(CANVAS);
        expect(meta.hasAlpha, `${call.src} has no alpha, so it would hide every layer beneath it`).toBe(true);
      }

      const png = await sharp({ create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(calls.map((c) => ({ input: `public${c.src}` })))
        .png()
        .toBuffer();
      const out = await sharp(png).metadata();
      expect(out.format).toBe("png");
      expect(out.width).toBe(CANVAS);
      // PNG magic number, i.e. a decoder would accept this as a real file
      // rather than sharp merely handing back what it was given.
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    });
  }

  it("keeps every prepared asset canvas-sized", async () => {
    // Spot-check across categories rather than all 1,241 files: the
    // pipeline writes them all through one function, so a size regression
    // would hit every file in a category at once.
    for (const category of ["dial", "hands", "bezel_insert", "chapter_ring"]) {
      const ready = approved.filter((p) => p.category === category && p.assetState === "ready").slice(0, 3);
      expect(ready.length, `no prepared assets for ${category}`).toBeGreaterThan(0);
      for (const part of ready) {
        const meta = await sharp(`public/assets/${category}/${part.id}.webp`).metadata();
        expect(meta.width).toBe(CANVAS);
        expect(meta.height).toBe(CANVAS);
      }
    }
  });
});
