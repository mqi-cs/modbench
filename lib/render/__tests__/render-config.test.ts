import { describe, expect, it } from "vitest";
import { canonical, loadConfig, PIXEL_SETTINGS, rendererVersion, sourceFingerprint } from "../config";

const config = loadConfig();

describe("render config and content hash", () => {
  it("the pixel-deciding source still matches sourceFingerprint", () => {
    // Failing? The renderer code changed. If the change can alter pixels,
    // bump referenceRenderer.revision (everything re-renders); either way,
    // set sourceFingerprint.sha256 to the value below.
    expect(sourceFingerprint(config), "sourceFingerprint.sha256").toBe(config.sourceFingerprint.sha256);
  });

  it("never fingerprints or hashes where a render runs", () => {
    expect(config.sourceFingerprint.files).not.toContain("scripts/render/render_device.py");
    expect(PIXEL_SETTINGS).not.toContain("device" as never);
  });

  it("the hash moves with pixel settings and the reference renderer, not with device or comments", () => {
    const tex: string[] = [];
    const base = rendererVersion(config, tex);
    const withDevice = { ...config, device: { default: "CPU", order: [] } };
    const withComment = { ...config, sampling: { ...(config.sampling as object), "//": "note" } };
    const withSamples = { ...config, sampling: { ...(config.sampling as object), samples: 512 } };
    const withRevision = { ...config, referenceRenderer: { ...config.referenceRenderer, revision: config.referenceRenderer.revision + 1 } };
    const withBlender = { ...config, referenceRenderer: { ...config.referenceRenderer, blender: "5.0.0" } };
    expect(rendererVersion(withDevice, tex)).toBe(base);
    expect(rendererVersion(withComment, tex)).toBe(base);
    expect(rendererVersion(withSamples, tex)).not.toBe(base);
    expect(rendererVersion(withRevision, tex)).not.toBe(base);
    expect(rendererVersion(withBlender, tex)).not.toBe(base);
  });

  it("canonical JSON ignores key order and // comments", () => {
    expect(canonical({ b: 1, a: [2, { "//": "x", c: 3 }] })).toBe(canonical({ a: [2, { c: 3 }], b: 1 }));
  });
});
