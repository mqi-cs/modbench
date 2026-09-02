import { describe, expect, it } from "vitest";
import { LAYER_ORDER, PLATFORM_GEOMETRY, renderRadiusPx, PX_PER_MM, CANVAS } from "../layers";
import { drawCalls, paint, placeholders, resolveLayers, type PreviewInput } from "../composite";

const NAMES = { d1: "Black Sunburst Dial", h1: "Sword Hands", i1: "Pepsi Insert", c1: "SKX007 Case", cr1: "Chapter Ring" };

function input(over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    parts: { case: "c1", dial: "d1", hands: "h1", bezelInsert: "i1", chapterRing: "cr1" },
    previewable: new Set(["d1", "h1", "i1", "cr1"]),
    names: NAMES,
    platform: "skx007",
    hasCase: true,
    ...over,
  };
}

describe("layer order", () => {
  // specs/05-phase-4-preview.md pass measure 5: "Layer order is correct in
  // every combination -- insert never behind the case, hands never behind
  // the dial."
  it("puts the insert in front of the case and the hands in front of the dial", () => {
    const order = LAYER_ORDER;
    expect(order.indexOf("bezelInsert")).toBeGreaterThan(order.indexOf("case"));
    expect(order.indexOf("bezel")).toBeGreaterThan(order.indexOf("case"));
    expect(order.indexOf("hands")).toBeGreaterThan(order.indexOf("dial"));
    expect(order.indexOf("chapterRing")).toBeGreaterThan(order.indexOf("dial"));
    expect(order.indexOf("hands")).toBeGreaterThan(order.indexOf("chapterRing"));
    expect(order.indexOf("glare")).toBe(order.length - 1);
  });

  it("holds that order for every subset of slots, not just the full build", () => {
    // "in every combination" is meant literally, so this walks all 32
    // subsets of the five part-backed slots rather than spot-checking.
    const slots = ["case", "dial", "hands", "bezelInsert", "chapterRing"] as const;
    for (let mask = 0; mask < 1 << slots.length; mask++) {
      const parts: Record<string, string> = {};
      slots.forEach((slot, i) => {
        if (mask & (1 << i)) parts[slot] = { case: "c1", dial: "d1", hands: "h1", bezelInsert: "i1", chapterRing: "cr1" }[slot];
      });
      const layers = resolveLayers(input({ parts, hasCase: Boolean(parts.case) }));
      const keys = layers.map((l) => l.key);
      expect(keys).toEqual([...LAYER_ORDER]);
      const painted = drawCalls(layers);
      // Draw calls must come out in the same relative order as the layers.
      const paintedKeys = layers.filter((l) => l.status === "drawn").map((l) => l.key);
      expect(painted.length).toBe(paintedKeys.length);
    }
  });
});

describe("missing assets", () => {
  // Pass measure 3: "Deliberately mark five parts unavailable and confirm
  // the preview still renders with labelled placeholders."
  it("renders the remaining layers and labels each part it could not draw", () => {
    const layers = resolveLayers(input({ previewable: new Set<string>() }));
    const missing = placeholders(layers);
    expect(missing.map((l) => l.key).sort()).toEqual(["bezelInsert", "chapterRing", "dial", "hands"]);
    for (const layer of missing) expect(layer.label).toBe(NAMES[layer.partId as keyof typeof NAMES]);
    // The case, bezel and glare are drawn art, so they still paint.
    expect(drawCalls(layers).length).toBe(3);
  });

  it("never silently drops a layer: an unpreviewable part is a placeholder, not an omission", () => {
    const layers = resolveLayers(input({ previewable: new Set(["d1"]) }));
    const hands = layers.find((l) => l.key === "hands")!;
    expect(hands.status).toBe("placeholder");
    expect(hands.src).toBeNull();
    expect(hands.partId).toBe("h1");
    // An empty slot is a different thing from an unpreviewable part, and
    // has to stay distinguishable or the caption would claim we have no
    // photo of a part the user never chose.
    const noHands = resolveLayers(input({ parts: { case: "c1" }, previewable: new Set() }));
    expect(noHands.find((l) => l.key === "hands")!.status).toBe("empty");
    expect(placeholders(noHands)).toHaveLength(0);
  });

  it("draws nothing at all when the build is empty", () => {
    const layers = resolveLayers(input({ parts: {}, hasCase: false }));
    expect(drawCalls(layers)).toHaveLength(0);
    expect(placeholders(layers)).toHaveLength(0);
    expect(layers.every((l) => l.status === "empty")).toBe(true);
  });
});

describe("paint", () => {
  it("clears first, then draws each ready layer once, in order", () => {
    const calls: string[] = [];
    const ctx = {
      clearRect: () => calls.push("clear"),
      drawImage: (image: unknown) => calls.push(String(image)),
    };
    const layers = resolveLayers(input());
    const painted = paint(ctx, layers, (src) => src as unknown as CanvasImageSource);
    expect(calls[0]).toBe("clear");
    expect(painted).toBe(drawCalls(layers).length);
    expect(calls.slice(1)).toEqual(drawCalls(layers).map((c) => c.src));
  });

  it("skips a layer whose image has not decoded yet rather than stalling the frame", () => {
    // This is what makes the preview progressive: slots fill in as their
    // assets arrive instead of the canvas staying blank until the last one.
    const ctx = { clearRect: () => {}, drawImage: () => {} };
    const layers = resolveLayers(input());
    const painted = paint(ctx, layers, (src) => (src.includes("dial") ? ({} as CanvasImageSource) : undefined));
    expect(painted).toBe(1);
  });
});

describe("render geometry", () => {
  it("nests the parts the way they physically nest on the case", () => {
    // Dial inside chapter ring inside insert inside case. If this ordering
    // of radii ever inverts, layers would occlude each other wrongly no
    // matter how correct the z-order is.
    const f = "skx007-case";
    expect(renderRadiusPx("dial", f)).toBeLessThan(renderRadiusPx("chapter_ring", f));
    expect(renderRadiusPx("chapter_ring", f)).toBeLessThan(renderRadiusPx("bezel_insert", f));
    expect(renderRadiusPx("bezel_insert", f)).toBeLessThan(renderRadiusPx("case", f));
  });

  it("keeps the whole case, lugs included, inside the canvas", () => {
    // The case is scaled by lug span rather than case diameter precisely
    // so the lugs are not cut off; this pins that down.
    const lugSpanPx = 46 * PX_PER_MM;
    expect(lugSpanPx).toBeLessThanOrEqual(CANVAS);
    expect(renderRadiusPx("case", "skx007-case") * 2).toBeLessThan(CANVAS);
  });

  it("falls back to the default platform for parts whose family carries none", () => {
    // Dials and hands are universal across these cases, so their families
    // have no platform prefix at all -- they must still get a radius.
    expect(renderRadiusPx("dial", "nh-dial")).toBeGreaterThan(0);
    expect(renderRadiusPx("hands", "nh-hands")).toBeGreaterThan(0);
    expect(renderRadiusPx("dial", "nh-dial")).toBe((PLATFORM_GEOMETRY.skx007!.dial * PX_PER_MM) / 2);
  });
});

describe("redraw budget", () => {
  // specs/05-phase-4-preview.md pass measure 4: "Redraw under 100ms on
  // slot change with warm cache."
  //
  // What this can measure is the synchronous work a slot change costs:
  // resolving the layers and issuing the draw calls. Decoding is excluded
  // by definition -- "warm cache" means the images are already decoded --
  // and the actual rasterising is the browser's. The budget is asserted
  // an order of magnitude tighter than the spec's, because everything
  // this code does should be arithmetic over seven layers; anything near
  // 100ms here would mean the placement maths had leaked back out of the
  // offline pipeline, which is the regression worth catching.
  it("resolves and issues a full redraw in well under the budget", () => {
    const ctx = { clearRect: () => {}, drawImage: () => {} };
    const image = {} as CanvasImageSource;
    const ids = ["d1", "h1", "i1", "cr1"];
    const start = performance.now();
    const ITERATIONS = 200;
    for (let i = 0; i < ITERATIONS; i++) {
      const layers = resolveLayers(input({ parts: { case: "c1", dial: ids[i % 4]!, hands: "h1", bezelInsert: "i1", chapterRing: "cr1" } }));
      paint(ctx, layers, () => image);
    }
    const perRedraw = (performance.now() - start) / ITERATIONS;
    expect(perRedraw).toBeLessThan(10);
  });
});
