import { describe, expect, it } from "vitest";
import { resolveScene, type RenderIndex } from "../scene";
import { readFileSync } from "node:fs";
import { printsFor } from "../prints";
import { INTEGRATED_RING_PRINT, PLACEHOLDER, STANDIN_KEYS, STANDIN_PRINT } from "../standins";

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
      ["hero/surface/ring/" + C + "/ring:angled", "surface"],
      ["top/surface/ring/" + C + "/ring:angled", "surface"],
      ["top/surface/dial/" + C + "/dial:disc", "surface"],
      ["top/surface/insert/" + C + "/insert:flat", "surface"],
      ["top/beauty/hands/" + C + "/hands:sword#steel", "beauty"],
      ["top/surface/date/" + C + "/dial:disc", "surface"],
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
    expect(s.labels).toContain("Crystal not previewed: not in the render index");
    // The case, plus labelled stand-ins where the dial, ring and insert go.
    expect(s.layers.map((l) => (l.kind === "surface" ? l.print : l.src))).toEqual([STANDIN_PRINT, STANDIN_PRINT, STANDIN_PRINT, "s1.png"]);
    expect(s.labels.filter((l) => l.includes("the chosen part can't be previewed · placeholder shape"))).toHaveLength(3);
  });

  it("labels an approximated shape with what it really is", () => {
    const s = resolveScene({ index, view: "hero", parts: { case: "case1", hands: "merc" }, prints: {} });
    expect(s.ok && s.labels).toContain("Hands shape approximated: hand-three-lobe drawn as sword");
  });

  it("pairs case and strap in the hero view, separates them from above", () => {
    const hero = resolveScene({ index, view: "hero", parts: { case: "case1", strap: "jub" }, prints: {} });
    const top = resolveScene({ index, view: "top", parts: { case: "case1", strap: "jub" }, prints: {} });
    const beauty = (s: typeof hero) => s.ok && s.layers.flatMap((l) => (l.kind === "beauty" ? [l.src] : []));
    expect(beauty(hero)).toEqual(["s2.png"]);
    expect(beauty(top)).toEqual(["s1.png", "s3.png"]);
  });

  // WS2c whole-build p99: the case holds out the inner parts (and a separate
  // strap the case), so their seams must add, not overlap; hand edges mix
  // with the dial in linear light. Plain over darkened both.
  it("blends the held-out case and strap disjointly and the hands in linear light", () => {
    const hero = resolveScene({ index, view: "hero", parts: { case: "case1", strap: "jub", hands: "merc", dial: "dialA" }, prints: { dial: photo("dialA"), date } });
    const top = resolveScene({ index: { ...index, jobs: { ...index.jobs } }, view: "top", parts: { case: "case1", strap: "jub" }, prints: {} });
    // date, dial, ring, hands, insert, case+strap / dial, ring, insert, case, strap (stand-ins where not chosen)
    expect(hero.ok && hero.layers.map((l) => l.blend ?? "over")).toEqual(["over", "over", "over", "linear", "over", "disjoint"]);
    expect(top.ok && top.layers.map((l) => l.blend ?? "over")).toEqual(["over", "over", "over", "disjoint", "disjoint"]);
  });

  // The case layer holds the ring out and the dial was lit with it, so the
  // ring is always drawn: the case's own, or a labelled stand-in.
  describe("a build without a chapter ring", () => {
    const ringLayer = (s: ReturnType<typeof resolveScene>) => (s.ok ? s.layers.find((l) => l.kind === "surface" && l.stem === "s8") : undefined);
    it("draws the case's built-in ring with a generic print, labelled as part of the case", () => {
      const s = resolveScene({ index, view: "hero", parts: { case: "case1" }, prints: { ring: { src: INTEGRATED_RING_PRINT, generated: true } }, caseAttributes: { integratedChapterRing: true } });
      expect(ringLayer(s)).toMatchObject({ print: INTEGRATED_RING_PRINT });
      expect(s.ok && s.labels).toContain("Chapter ring: part of the case (built-in rehaut) · generic print generated by Modbench, not this case's own design");
    });
    it.each([
      ["unstated", {}, "Chapter ring: none chosen, and the case's vendor doesn't say whether it needs one · placeholder shape, not part of this build"],
      ["required", { requiresChapterRing: true }, "Chapter ring: not chosen yet · placeholder shape, not part of this build"],
    ] as const)("draws a labelled stand-in when the case's ring is %s", (_, caseAttributes, label) => {
      const s = resolveScene({ index, view: "hero", parts: { case: "case1" }, prints: {}, caseAttributes });
      expect(ringLayer(s)).toMatchObject({ print: STANDIN_PRINT });
      expect(s.ok && s.labels).toContain(label);
    });
    it("draws the chosen ring, not the stand-in, once one is picked", () => {
      const s = resolveScene({ index: { ...index, parts: { ...index.parts, r1: { key: "ring:angled", approximated: false } } }, view: "hero", parts: { case: "case1", chapterRing: "r1" }, prints: { ring: { src: "/render/prints/ring-ring-gold.webp", generated: true } }, caseAttributes: { integratedChapterRing: true } });
      expect(ringLayer(s)).toMatchObject({ print: "/render/prints/ring-ring-gold.webp" });
    });
  });

  // Every subset of the optional slots, each chosen, missing or not drawable,
  // in both views and for every ring status.
  describe("any build", () => {
    const withRing = { ...index, parts: { ...index.parts, r1: { key: "ring:angled", approximated: false } } };
    const choices = { dial: ["dialA", "byo_d"], chapterRing: ["r1", "turtle"], bezelInsert: ["ins", "gone"], hands: ["merc"], strap: ["jub"] } as const;
    const builds: Record<string, string>[] = [{ case: "case1" }];
    for (const [slot, ids] of Object.entries(choices)) for (const b of [...builds]) for (const id of ids) builds.push({ ...b, [slot]: id });
    const cases = builds.flatMap((parts) =>
      (["hero", "top"] as const).flatMap((view) => [{}, { requiresChapterRing: true }, { integratedChapterRing: true }].map((caseAttributes) => ({ parts, view, caseAttributes }))),
    );
    const prints = { dial: photo("dialA"), date, insert: insertPrint, ring: { src: INTEGRATED_RING_PRINT, generated: true } };
    const scenes = cases.map((c) => resolveScene({ index: withRing, prints, ...c }));

    it("always draws the dial, ring and insert the case holds out", () => {
      expect(scenes.length).toBe(3 * 3 * 3 * 2 * 2 * 2 * 3);
      for (const s of scenes) {
        expect(s.ok).toBe(true);
        if (!s.ok) continue;
        const surfaces = s.layers.filter((l) => l.kind === "surface").length;
        expect(surfaces === 3 || surfaces === 4).toBe(true); // + the date wheel under a real dial
      }
    });

    it("labels every stand-in it shows (fails on an unlabelled one)", () => {
      for (const s of scenes) {
        if (!s.ok) continue;
        const shown = s.layers.filter((l) => l.kind === "surface" && l.print === STANDIN_PRINT).length;
        expect(s.labels.filter((l) => l.endsWith(` · ${PLACEHOLDER}`))).toHaveLength(shown);
      }
    });
  });

  it("falls back, with the reason, for a case size not checked in 3D or a built-in bezel", () => {
    const small = { ...index, parts: { ...index.parts, c41: { key: "case:round/41/20/28.5#steel", approximated: false } } };
    expect(resolveScene({ index: small, view: "hero", parts: { case: "c41" }, prints: {} })).toEqual({ ok: false, reason: "this case size isn't checked in 3D yet" });
    expect(resolveScene({ index, view: "hero", parts: { case: "case1" }, prints: {}, caseAttributes: { integratedBezel: true } })).toEqual({
      ok: false,
      reason: "this case's bezel is built in, and its shape isn't modelled in 3D",
    });
    expect(resolveScene({ index, view: "top", parts: { case: "case1" }, prints: {}, caseAttributes: { outline: "square" } })).toEqual({
      ok: false,
      reason: "this case's square shape isn't modelled in 3D",
    });
  });

  it("picks each stand-in shape as the most common key in the real render index, nothing else", () => {
    const real = JSON.parse(readFileSync("public/render/layers/index.json", "utf-8")) as RenderIndex;
    for (const [slot, key] of Object.entries(STANDIN_KEYS)) {
      const counts = new Map<string, number>();
      for (const { key: k } of Object.values(real.parts)) if (k.startsWith(`${slot}:`)) counts.set(k, (counts.get(k) ?? 0) + 1);
      const modal = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      expect(key, slot).toBe(modal);
    }
  });

  it("gives a case's built-in ring a generic print only when no separate ring is chosen", () => {
    const attrs = (id: string) => (id === "own" ? { integratedChapterRing: true } : {});
    expect(printsFor({ case: "own" }, attrs, () => false).ring).toEqual({ src: INTEGRATED_RING_PRINT, generated: true });
    expect(printsFor({ case: "plain" }, attrs, () => false).ring).toBeUndefined();
    expect(printsFor({ case: "own", chapterRing: "r" }, attrs, () => false).ring?.src).toBe("/render/prints/ring-ring-white.webp");
  });

  it("falls back, with the reason, when the case can't be drawn or the dial has no photo", () => {
    expect(resolveScene({ index, view: "hero", parts: { case: "turtle" }, prints: {} })).toEqual({ ok: false, reason: "case family srp-turtle-case needs its own outline" });
    expect(resolveScene({ index, view: "hero", parts: { case: "case1", dial: "dialA" }, prints: { date } })).toEqual({ ok: false, reason: "no dial photo" });
  });
});
