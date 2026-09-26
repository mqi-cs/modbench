import { describe, expect, it } from "vitest";
import { loadRenderParts } from "../load";
import { buildManifest } from "../manifest";
import { shapeKey, type RenderPart } from "../shape-keys";

const part = (category: string, attributes: Record<string, unknown>, extra: Partial<RenderPart> = {}): RenderPart => ({
  id: `${category}-${JSON.stringify(attributes)}`,
  category,
  family: "skx007-case",
  name: "",
  attributes,
  ...extra,
});
const skx = part("case", { caseDiameterMm: 42.5, lugWidthMm: 22, dialApertureMm: 28.5 });

describe("shapeKey", () => {
  it("keys a round case by its three stated millimetres", () => {
    expect(shapeKey(skx)).toMatchObject({ ok: true, key: "case:round/42.5/22/28.5", approximated: false });
  });

  it("refuses a case missing a dimension, naming it", () => {
    const k = shapeKey(part("case", { caseDiameterMm: 36 }, { family: "skx013-case" }));
    expect(k).toMatchObject({ ok: false });
    expect(!k.ok && k.reason).toContain("lugWidth, aperture");
  });

  it("refuses non-round case families rather than drawing them as an SKX", () => {
    for (const family of ["srp-turtle-case", "vk6x-case", "nmk-n4-case", "lucius-ultra-thin-case"]) {
      expect(shapeKey(part("case", { caseDiameterMm: 44.3, lugWidthMm: 22, dialApertureMm: 28.5 }, { family })).ok).toBe(false);
    }
  });

  it("an out-of-range diameter is not stated, so not renderable", () => {
    expect(shapeKey(part("case", { caseDiameterMm: 7, lugWidthMm: 22, dialApertureMm: 28.5 })).ok).toBe(false);
  });

  it("marks an unmodelled shape as approximated and keeps the real one", () => {
    expect(shapeKey(part("hands", { shapeTag: "hand-three-lobe" }))).toMatchObject({
      key: "hands:sword",
      approximated: true,
      actualShape: "hand-three-lobe",
    });
    expect(shapeKey(part("hands", { shapeTag: "hand-sword" }))).toMatchObject({ key: "hands:sword", approximated: false });
    expect(shapeKey(part("chapter_ring", { shapeTag: "ring-plain" }))).toMatchObject({ approximated: true });
    expect(shapeKey(part("crown", { shapeTag: "crown-onion" }))).toMatchObject({ key: "crown:knurled", approximated: true });
    expect(shapeKey(part("bezel_insert", { profile: "slope" }))).toMatchObject({ approximated: true, actualShape: "insert-slope" });
  });

  it("splits band straps into leather and rubber by the vendor's name", () => {
    expect(shapeKey(part("strap", { shapeTag: "strap-band" }, { name: "Italian Leather Strap" }))).toMatchObject({ key: "strap:leather", approximated: false });
    expect(shapeKey(part("strap", { shapeTag: "strap-band" }, { name: "FKM Rubber Strap" }))).toMatchObject({ key: "strap:rubber", approximated: false });
    expect(shapeKey(part("strap", { shapeTag: "strap-band" }, { name: "Canvas Strap" }))).toMatchObject({ key: "strap:rubber", approximated: true });
  });
});

describe("buildManifest", () => {
  const scope = [skx, part("dial", {}), part("strap", { shapeTag: "strap-jubilee" }), part("strap", { shapeTag: "strap-nato" })];

  it("multiplies layers by case shape and pairs case+strap for hero only", () => {
    const m = buildManifest(scope, "v1");
    // per view: case, dial, 2 straps; plus 2 casestrap in hero.
    expect(m.jobs.length).toBe(2 * 4 + 2);
    expect(m.jobs.filter((j) => j.layer === "casestrap").every((j) => j.view === "hero")).toBe(true);
    // A slot the scope doesn't have renders nothing.
    expect(m.jobs.some((j) => j.layer === "hands")).toBe(false);
  });

  it("hashes geometry, not the part: same key, same hash, across scopes", () => {
    const a = buildManifest(scope, "v1");
    const b = buildManifest([...scope, part("strap", { shapeTag: "strap-jubilee" }, { id: "other-vendor-jubilee" })], "v1");
    expect(b.jobs.map((j) => j.hash)).toEqual(a.jobs.map((j) => j.hash));
  });

  it("changes every hash when the renderer changes, and none otherwise", () => {
    const a = buildManifest(scope, "v1");
    expect(buildManifest(scope, "v1").jobs.map((j) => j.hash)).toEqual(a.jobs.map((j) => j.hash));
    const c = buildManifest(scope, "v2").jobs.map((j) => j.hash);
    expect(c.some((h) => a.jobs.some((j) => j.hash === h))).toBe(false);
  });
});

describe("the real catalog", () => {
  const parts = loadRenderParts();
  const m = buildManifest(parts, "test");

  it("gives every approved part a shape key or a recorded reason", () => {
    expect(parts.length).toBeGreaterThan(3000);
    for (const p of parts) expect(Boolean(m.parts[p.id]) !== Boolean(m.notRenderable[p.id])).toBe(true);
  });

  it("job ids are unique, so no two jobs overwrite one output", () => {
    expect(new Set(m.jobs.map((j) => j.id)).size).toBe(m.jobs.length);
    expect(new Set(m.jobs.map((j) => j.hash)).size).toBe(m.jobs.length);
  });

  it("a tenant scope is a subset of the full manifest, with the same hashes", () => {
    const tenant = buildManifest(loadRenderParts(undefined, "dlwwatches"), "test");
    const all = new Set(m.jobs.map((j) => j.hash));
    expect(tenant.jobs.length).toBeGreaterThan(0);
    expect(tenant.jobs.every((j) => all.has(j.hash))).toBe(true);
  });
});
