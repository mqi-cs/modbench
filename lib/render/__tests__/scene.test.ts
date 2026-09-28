import { describe, expect, it } from "vitest";
import { resolveScene, type RenderIndex } from "../scene";

const C = "case:round/42.5/22/28.5";
const index: RenderIndex = {
  order: ["date", "dial", "ring", "hands", "insert", "case", "strap"],
  pair: { layer: "casestrap", replaces: ["case", "strap"], views: ["hero"] },
  jobs: Object.fromEntries(
    [
      ["hero/beauty/case/" + C + "#steel", "beauty"],
      ["top/beauty/case/" + C + "#steel", "beauty"],
      ["hero/beauty/casestrap/" + C + "#steel/strap:jubilee", "beauty"],
      ["top/beauty/strap/" + C + "/strap:jubilee", "beauty"],
      ["hero/surface/date/" + C + "/dial:disc", "surface"],
      ["hero/surface/dial/" + C + "/dial:disc", "surface"],
      ["hero/surface/insert/" + C + "/insert:flat", "surface"],
      ["hero/beauty/hands/" + C + "/hands:sword#steel", "beauty"],
    ].map(([id, pass], i) => [id!, { stem: `s${i}`, pass: pass as "beauty" | "surface" }]),
  ),
  parts: {
    case1: { key: C + "#steel", approximated: false },
    dialA: { key: "dial:disc", approximated: false },
    dialB: { key: "dial:disc", approximated: false },
    ins: { key: "insert:flat", approximated: false },
    merc: { key: "hands:sword#steel", approximated: true, actualShape: "hand-three-lobe" },
    jub: { key: "strap:jubilee", approximated: false },
  },
  notRenderable: { turtle: "case family srp-turtle-case needs its own outline" },
};
const photo = (id: string) => ({ src: `/assets/dial/${id}.webp`, generated: false });
const insertPrint = { src: "/render/prints/insert-ins-black.webp", generated: true };
const date = { src: "/render/prints/date-skx.webp", generated: true };

describe("resolveScene", () => {
  it("a new dial needs no render: same geometry jobs, only the print differs", () => {
    const a = resolveScene({ index, view: "hero", parts: { case: "case1", dial: "dialA" }, prints: { dial: photo("dialA"), date } });
    const b = resolveScene({ index, view: "hero", parts: { case: "case1", dial: "dialB" }, prints: { dial: photo("dialB"), date } });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const stems = (s: typeof a) => s.layers.map((l) => (l.kind === "beauty" ? l.src : l.stem));
    expect(stems(b)).toEqual(stems(a));
    expect(b.layers.find((l) => l.kind === "surface" && l.print.includes("dialB"))).toBeTruthy();
  });

  it("labels every generated print, and a vendor photo as a photo", () => {
    const s = resolveScene({ index, view: "hero", parts: { case: "case1", dial: "dialA", bezelInsert: "ins" }, prints: { dial: photo("dialA"), date, insert: insertPrint } });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const generated = s.layers.filter((l) => l.kind === "surface" && [insertPrint.src, date.src].includes(l.print)).length;
    expect(s.labels.filter((l) => l.includes("generic print generated")).length).toBe(generated);
    expect(s.labels).toContain("Dial: print from vendor photo");
  });

  it("names every chosen part it leaves out, including ids the index has never seen", () => {
    const parts = { case: "case1", dial: "byo_dial1", hands: "byo_hands1", bezelInsert: "gone", chapterRing: "turtle", strap: "byo_strap1", crystal: "c1", crown: "byo_crown1", movement: "byo_mv1" };
    const s = resolveScene({ index, view: "top", parts, prints: {} });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    // Every chosen part but the case (drawn) and the movement (hidden): 7.
    expect(s.labels.filter((l) => l.includes(" not previewed: "))).toHaveLength(7);
    expect(s.labels).toContain("Dial not previewed: not in the render index");
    expect(s.labels).toContain("Chapter ring not previewed: case family srp-turtle-case needs its own outline");
    expect(s.layers).toHaveLength(1); // only the case is drawn
  });

  it("labels an approximated shape with what it really is", () => {
    const s = resolveScene({ index, view: "hero", parts: { case: "case1", hands: "merc" }, prints: {} });
    expect(s.ok && s.labels).toContain("Hands shape approximated: hand-three-lobe drawn as sword");
  });

  it("pairs case and strap in the hero view, separates them from above", () => {
    const hero = resolveScene({ index, view: "hero", parts: { case: "case1", strap: "jub" }, prints: {} });
    const top = resolveScene({ index, view: "top", parts: { case: "case1", strap: "jub" }, prints: {} });
    expect(hero.ok && hero.layers.map((l) => l.kind === "beauty" && l.src)).toEqual(["s2.png"]);
    expect(top.ok && top.layers.map((l) => l.kind === "beauty" && l.src)).toEqual(["s1.png", "s3.png"]);
  });

  // WS2c whole-build p99: the case holds out the inner parts (and a separate
  // strap the case), so their seams must add, not overlap; hand edges mix
  // with the dial in linear light. Plain over darkened both.
  it("blends the held-out case and strap disjointly and the hands in linear light", () => {
    const hero = resolveScene({ index, view: "hero", parts: { case: "case1", strap: "jub", hands: "merc", dial: "dialA" }, prints: { dial: photo("dialA"), date } });
    const top = resolveScene({ index: { ...index, jobs: { ...index.jobs } }, view: "top", parts: { case: "case1", strap: "jub" }, prints: {} });
    expect(hero.ok && hero.layers.map((l) => l.blend ?? "over")).toEqual(["over", "over", "linear", "disjoint"]);
    expect(top.ok && top.layers.map((l) => l.blend ?? "over")).toEqual(["disjoint", "disjoint"]);
  });

  it("falls back, with the reason, when the case can't be drawn or the dial has no photo", () => {
    expect(resolveScene({ index, view: "hero", parts: { case: "turtle" }, prints: {} })).toEqual({ ok: false, reason: "case family srp-turtle-case needs its own outline" });
    expect(resolveScene({ index, view: "hero", parts: { case: "case1", dial: "dialA" }, prints: { date } })).toEqual({ ok: false, reason: "no dial photo" });
  });
});
