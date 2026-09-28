import { readdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { gatePhoto, photoGate } from "../photo-gate";
import { analyseRaster, classify } from "../../preview/classify";

// D15e. Synthetic photos only (data/fixtures/photo-gate/, made by
// scripts/make-photo-gate-fixtures.ts): no real listing photos exist until
// marketplace API access. Open the PNGs to see what each case looks like.
const DIR = "data/fixtures/photo-gate";
const EXPECTED: Record<string, string> = {
  "pass-dial-frontal.png": "pass",
  "pass-dial-green-print-daylight.png": "pass",
  "pass-insert-frontal.png": "pass",
  "pass-chapter-ring-frontal.png": "pass",
  "reject-dial-low-resolution.png": "low-resolution",
  "reject-dial-tilted.png": "not-square-silhouette",
  "reject-dial-tilted-diagonal.png": "not-frontal",
  "reject-dial-lume-lit.png": "lume-lit",
  "reject-dial-on-a-strap.png": "backdrop-not-seamless",
};
const slotOf = (f: string) => (f.includes("insert") ? "bezelInsert" : f.includes("chapter-ring") ? "chapterRing" : "dial");
const read = (f: string) => readFileSync(`${DIR}/${f}`);

describe("BYO photo quality gate", () => {
  it("has an expectation for every fixture on disk", () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const [file, want] of Object.entries(EXPECTED)) {
    it(`${file} → ${want}`, async () => {
      const r = await gatePhoto(read(file), slotOf(file));
      expect(r.verdict === "pass" ? "pass" : r.reason).toBe(want);
    });
  }

  it("needs its own roundness test: the classifier alone passes a dial tilted along the diagonal", async () => {
    const raw = await sharp(read("reject-dial-tilted-diagonal.png")).resize(400, 400, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const img = { data: new Uint8Array(raw.data), width: raw.info.width, height: raw.info.height };
    const a = analyseRaster(img, "dial");
    expect(classify({ category: "dial", agreement: a.bg.agreement, components: a.components, shape: a.shape, frameSpanning: a.frameSpanning }).state).toBe("ready");
    expect(photoGate(img, "dial", { width: 800, height: 800 })).toEqual({ verdict: "reject", reason: "not-frontal" });
  });

  it("doesn't judge slots the 3D preview draws from shape alone", async () => {
    for (const slot of ["hands", "strap", "case", "crown", "crystal", "bezel", "movement"] as const) {
      expect(await gatePhoto(read("pass-dial-frontal.png"), slot)).toEqual({ verdict: "not-applicable", reason: "slot-drawn-from-shape-not-photo" });
    }
  });

  it("rejects what it can't decode rather than throwing", async () => {
    expect(await gatePhoto(Buffer.from("not an image"), "dial")).toEqual({ verdict: "reject", reason: "undecodable-image" });
  });
});
