import { describe, expect, it } from "vitest";
import {
  assignHandRoles,
  assignHoles,
  findComponents,
  findHoles,
  handGeometry,
  isRoundish,
  markEnclosed,
  measure,
  probeBackground,
  subjectMask,
  type Raster,
} from "../segment";
import { classify, isHandShaped, partitionSubjects, NOISE_FLOOR } from "../classify";

const W = 120;

function blank(bg: [number, number, number] = [255, 255, 255]): Raster {
  const data = new Uint8Array(W * W * 4);
  for (let i = 0; i < W * W; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: W, height: W };
}

function fill(img: Raster, test: (x: number, y: number) => boolean, colour: [number, number, number]) {
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (!test(x, y)) continue;
      const i = (y * W + x) * 4;
      img.data[i] = colour[0];
      img.data[i + 1] = colour[1];
      img.data[i + 2] = colour[2];
    }
  }
}

const dist = (x: number, y: number, cx = 60, cy = 60) => Math.hypot(x - cx, y - cy);

function analyse(img: Raster) {
  const bg = probeBackground(img);
  const mask = subjectMask(img, bg.color);
  markEnclosed(img, mask, bg.color);
  const { components, labels } = findComponents(mask, W, W, Math.round(NOISE_FLOOR * W * W));
  assignHoles(components, findHoles(mask, labels, W, W));
  return { bg, mask, components, labels, shape: components[0] ? measure(components[0], W, W) : null };
}

describe("background probe", () => {
  it("reports full agreement on a seamless backdrop and low agreement on a busy one", () => {
    expect(probeBackground(blank()).agreement).toBe(1);

    // A photo taken on a prop surface: the border is a mix of colours, and
    // no single one dominates. This is the measure that rejects wrist
    // shots and lifestyle photography before any shape test runs, because
    // a flood fill against a non-uniform backdrop fails silently.
    const busy = blank();
    fill(busy, (x, y) => (x + y) % 3 === 0, [40, 90, 30]);
    fill(busy, (x, y) => (x * 2 + y) % 5 === 0, [180, 120, 60]);
    expect(probeBackground(busy).agreement).toBeLessThan(0.9);
  });

  it("finds a dark backdrop as readily as a white one", () => {
    // Two vendors shoot on black. The backdrop is whatever the border
    // agrees on, not "white".
    const dark = blank([12, 12, 14]);
    fill(dark, (x, y) => dist(x, y) < 40, [230, 230, 230]);
    const probe = probeBackground(dark);
    expect(probe.agreement).toBe(1);
    expect(probe.color.r).toBeLessThan(30);
  });
});

describe("shape classification", () => {
  it("accepts a plain disc as a dial", () => {
    const img = blank();
    fill(img, (x, y) => dist(x, y) < 45, [30, 30, 35]);
    const { bg, components, shape } = analyse(img);
    expect(components).toHaveLength(1);
    expect(shape!.aspect).toBeCloseTo(1, 1);
    expect(classify({ category: "dial", agreement: bg.agreement, components, shape })).toEqual({ state: "ready", reason: "ok" });
  });

  it("accepts an annulus as a bezel insert and rejects the same shape filled in", () => {
    const ring = blank();
    fill(ring, (x, y) => dist(x, y) < 50 && dist(x, y) > 40, [20, 20, 25]);
    const r = analyse(ring);
    expect(classify({ category: "bezel_insert", agreement: r.bg.agreement, components: r.components, shape: r.shape }).state).toBe("ready");

    // The failure that matters: two of the four vendors photograph inserts
    // fitted to a complete watch. Those images are square, circular and on
    // a clean backdrop -- everything a disc test looks at -- and differ
    // only in having a dial where the hole should be. Without this, the
    // preview would composite a whole watch over the user's own dial.
    const solid = blank();
    fill(solid, (x, y) => dist(x, y) < 50, [20, 20, 25]);
    const s = analyse(solid);
    expect(classify({ category: "bezel_insert", agreement: s.bg.agreement, components: s.components, shape: s.shape })).toEqual({
      state: "needs-manual",
      reason: "solid-centre-not-an-annulus",
    });
  });

  it("rejects a photograph whose backdrop is not seamless before looking at shape", () => {
    const img = blank();
    fill(img, (x, y) => (x + y) % 3 === 0, [40, 90, 30]);
    fill(img, (x, y) => dist(x, y) < 45, [30, 30, 35]);
    const { bg, components, shape } = analyse(img);
    expect(classify({ category: "dial", agreement: bg.agreement, components, shape }).reason).toBe("backdrop-not-seamless");
  });

  it("rejects three parts in one frame but tolerates a vendor watermark beside one", () => {
    const three = blank();
    for (const cx of [30, 60, 90]) fill(three, (x, y) => dist(x, y, cx, 60) < 14, [30, 30, 35]);
    const t = analyse(three);
    expect(classify({ category: "dial", agreement: t.bg.agreement, components: t.components, shape: t.shape }).reason).toBe("multiple-subjects");

    // A watermark clears the noise floor and, on a thin ring, can clear a
    // share-of-area threshold too -- 70 good dials were rejected over one.
    // Extent is the measure that says "another object this size".
    const marked = blank();
    fill(marked, (x, y) => dist(x, y) < 45, [30, 30, 35]);
    fill(marked, (x, y) => x > 100 && x < 112 && y > 108 && y < 114, [90, 90, 90]);
    const m = analyse(marked);
    expect(m.components.length + partitionSubjects(m.components).debris.length).toBeGreaterThanOrEqual(1);
    const { subjects } = partitionSubjects(m.components);
    expect(subjects).toHaveLength(1);
    expect(classify({ category: "dial", agreement: m.bg.agreement, components: subjects, shape: measure(subjects[0]!, W, W) }).state).toBe("ready");
  });
});

describe("hole ownership", () => {
  it("attributes a hole to the shape that encloses it, not the one whose box overlaps it", () => {
    // Hands in a loose set overlap heavily in bounding box. Attributing by
    // box put seven of one hand's holes on its neighbour, which moved that
    // hand's pivot into empty space.
    const img = blank();
    fill(img, (x, y) => dist(x, y, 40, 60) < 22, [20, 20, 20]);
    fill(img, (x, y) => dist(x, y, 40, 60) < 8, [255, 255, 255]);
    fill(img, (x, y) => Math.abs(x - 75) < 3 && y > 20 && y < 100, [20, 20, 20]);
    const { components, labels } = analyse(img) as ReturnType<typeof analyse>;
    const disc = components.find((c) => c.area > 500)!;
    const bar = components.find((c) => c.area <= 500)!;
    expect(disc.holes).toHaveLength(1);
    expect(bar.holes).toHaveLength(0);
    expect(labels).toBeInstanceOf(Int32Array);
  });

  it("tells a drilled hole from a printed stripe", () => {
    // The mounting hole and the lume slot are both enclosed background.
    // Roundness is what separates them, and getting it wrong put the pivot
    // at the wrong end: hands were drawn boss-first, pointing outward.
    expect(isRoundish({ area: 78, cx: 0, cy: 0, radius: 5, owner: 0, aspect: 1.0, fill: 0.78 })).toBe(true);
    expect(isRoundish({ area: 270, cx: 0, cy: 0, radius: 9, owner: 0, aspect: 0.13, fill: 0.98 })).toBe(false);
  });
});

describe("hand geometry", () => {
  /** A hand pointing up: shaft from the boss at the bottom to a tip at the top. */
  function handImage(holeAtBottom: boolean): Raster {
    const img = blank();
    fill(img, (x, y) => Math.abs(x - 60) < 4 && y > 25 && y < 90, [30, 30, 30]);
    fill(img, (x, y) => dist(x, y, 60, 88) < 10, [30, 30, 30]);
    if (holeAtBottom) fill(img, (x, y) => dist(x, y, 60, 88) < 4.5, [255, 255, 255]);
    return img;
  }

  it("puts the pivot at the boss and the tip at the far end", () => {
    const { components, labels } = analyse(handImage(true));
    const g = handGeometry(components[0]!, labels, W, W);
    expect(g.pivotFromHole).toBe(true);
    expect(g.pivotY).toBeGreaterThan(80);
    expect(g.tipY).toBeLessThan(35);
    expect(g.tailRatio).toBeLessThan(0.55);
    expect(isHandShaped(g)).toBe(true);
  });

  it("still finds the right end when there is no visible hole", () => {
    // The seconds hand's pivot is a pinhole a few pixels across and is
    // routinely filled by shadow. Requiring a hole on every hand rejected
    // 150 of 237 sampled sets; the mass estimate is the fallback.
    const { components, labels } = analyse(handImage(false));
    const g = handGeometry(components[0]!, labels, W, W);
    expect(g.pivotFromHole).toBe(false);
    expect(g.pivotY).toBeGreaterThan(g.tipY);
    expect(g.tipY).toBeLessThan(35);
  });

  it("names the needle the seconds hand even when it is not the longest", () => {
    // Length alone is unreliable across sets. Thinness is not: a seconds
    // hand carries no lume and drives no load.
    const roles = assignHandRoles([
      { pivotX: 0, pivotY: 0, tipX: 0, tipY: -90, length: 90, thickness: 12, pivotFromHole: true, tailRatio: 0.1 },
      { pivotX: 0, pivotY: 0, tipX: 0, tipY: -60, length: 60, thickness: 14, pivotFromHole: true, tailRatio: 0.1 },
      { pivotX: 0, pivotY: 0, tipX: 0, tipY: -80, length: 80, thickness: 1.5, pivotFromHole: false, tailRatio: 0.2 },
    ]);
    expect(roles).toEqual(["minute", "hour", "second"]);
  });

  it("rejects a set whose pivot landed mid-shaft", () => {
    const balanced = { pivotX: 0, pivotY: 0, tipX: 0, tipY: -50, length: 50, thickness: 5, pivotFromHole: true, tailRatio: 0.95 };
    expect(isHandShaped(balanced)).toBe(false);
  });

  it("rejects a stubby blob that is not a hand at all", () => {
    const washer = { pivotX: 0, pivotY: 0, tipX: 0, tipY: -8, length: 8, thickness: 7, pivotFromHole: false, tailRatio: 0.4 };
    expect(isHandShaped(washer)).toBe(false);
  });
});

describe("hand set classification", () => {
  const hand = (length: number, thickness: number) => ({
    pivotX: 0, pivotY: 0, tipX: 0, tipY: -length, length, thickness, pivotFromHole: true, tailRatio: 0.1,
  });

  const stub = (n: number) =>
    Array.from({ length: n }, () => ({ area: 100, minX: 0, minY: 0, maxX: 9, maxY: 9, cx: 0, cy: 0, holes: [], label: 0 }));

  it("accepts a normal three-hand set", () => {
    const hands = [hand(90, 10), hand(60, 12), hand(80, 1.5)];
    expect(classify({ category: "hands", agreement: 1, components: stub(3), shape: null, hands, debris: [] }).state).toBe("ready");
  });

  it("rejects a colour-variant montage", () => {
    // One image showing the same set in eight finishes segments into 20+
    // components; without a ceiling it would be treated as a 20-hand watch.
    expect(classify({ category: "hands", agreement: 1, components: stub(9), shape: null, hands: [], debris: [] }).reason).toBe(
      "too-many-subjects-likely-a-variant-grid",
    );
  });

  it("rejects a lone hand", () => {
    expect(classify({ category: "hands", agreement: 1, components: stub(1), shape: null, hands: [hand(90, 10)], debris: [] }).reason).toBe(
      "fewer-than-two-hands",
    );
  });
});

describe("variant montages that merge into few components", () => {
  const hand = (length: number, thickness: number) => ({
    pivotX: 0, pivotY: 0, tipX: 0, tipY: -length, length, thickness, pivotFromHole: true, tailRatio: 0.1,
  });
  const stub = (n: number) =>
    Array.from({ length: n }, () => ({ area: 100, minX: 0, minY: 0, maxX: 9, maxY: 9, cx: 0, cy: 0, holes: [], label: 0 }));

  it("rejects a set that sits beside a large shape which is not a hand", () => {
    // The component ceiling alone does not catch this. One vendor's
    // montages put the hero set beside seven small colour panels on a
    // backdrop about ten levels off white -- just outside the flood
    // tolerance, so the panels became subject and adjacent ones merged.
    // Five components, three of them real hands: every count passed, and
    // the asset rendered as a tangle of white slivers across the dial.
    const hands = [hand(90, 10), hand(60, 12), hand(80, 1.5)];
    const panel = { pivotX: 0, pivotY: 0, tipX: 0, tipY: -70, length: 70, thickness: 60, pivotFromHole: false, tailRatio: 0.9 };
    expect(classify({ category: "hands", agreement: 1, components: stub(5), shape: null, hands, debris: [panel] }).reason).toBe(
      "large-shape-that-is-not-a-hand",
    );
  });

  it("still tolerates a small screw or lume pip in the frame", () => {
    const hands = [hand(90, 10), hand(60, 12), hand(80, 1.5)];
    const pip = { pivotX: 0, pivotY: 0, tipX: 0, tipY: -8, length: 8, thickness: 7, pivotFromHole: false, tailRatio: 0.4 };
    expect(classify({ category: "hands", agreement: 1, components: stub(4), shape: null, hands, debris: [pip] }).state).toBe("ready");
  });
});
