import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { parts } from "../../db/schema";
import { fromJsonColumn } from "../../db/json";
import { drawnLayers, resolveWatch, type ResolveInput } from "../composite";
import { SHAPES, SHAPE_FALLBACK, shapeById, shapesFor, type ShapeCategory } from "../shape-vocabulary";
import { caseDimensions, type RenderMm } from "../dimensions";
import { DEFAULT_MM, watchMm } from "../art/geometry";

const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
const ILLUSTRATED: ShapeCategory[] = ["hands", "crown", "chapter_ring", "bezel_insert", "strap"];

const meta: ResolveInput["meta"] = Object.fromEntries(
  approved.map((p) => {
    const a = fromJsonColumn<Record<string, unknown>>(p.attributes);
    const mm = p.category === "case" ? caseDimensions(a as never) : (a.renderMm as RenderMm | undefined);
    return [
      p.id,
      {
        name: p.name,
        shape: String(a.shapeTag ?? ""),
        tags: Array.isArray(a.styleTags) ? (a.styleTags as string[]) : [],
        mm: mm && Object.keys(mm).length > 0 ? mm : undefined,
      },
    ];
  }),
);

function input(over: Partial<ResolveInput> = {}): ResolveInput {
  return { parts: {}, previewable: new Set<string>(), meta, ...over };
}

describe("every approved part is drawable", () => {
  // The point of the rollout: no part in an illustrated category may fall
  // through to unshaded or to nothing. Its own silhouette or a documented
  // fallback, never a gap.
  for (const category of ILLUSTRATED) {
    it(`${category}: all have a shape from the vocabulary`, () => {
      const rows = approved.filter((p) => p.category === category);
      expect(rows.length).toBeGreaterThan(0);
      const bad: string[] = [];
      for (const p of rows) {
        const shape = String(fromJsonColumn<Record<string, unknown>>(p.attributes).shapeTag ?? "");
        const def = shapeById(shape);
        if (!def || def.category !== category) bad.push(`${p.name} -> ${shape || "(none)"}`);
      }
      expect(bad.slice(0, 5), `${bad.length} parts have no usable shape`).toEqual([]);
    });
  }

  it("defines no shape that matches nothing", () => {
    // Dead art is worse than no art: it looks like coverage that isn't
    // there. The backfill warns about this too; this pins it.
    const used = new Set(
      approved.map((p) => String(fromJsonColumn<Record<string, unknown>>(p.attributes).shapeTag ?? "")),
    );
    const unused = SHAPES.filter((s) => !used.has(s.id)).map((s) => s.id);
    expect(unused).toEqual([]);
  });

  it("keeps every category's fallback inside that category's own shapes", () => {
    for (const category of ILLUSTRATED) {
      const ids = shapesFor(category).map((s) => s.id);
      expect(ids, `${category} fallback`).toContain(SHAPE_FALLBACK[category]);
    }
  });
});

describe("resolveWatch", () => {
  const byCategory = (c: string) => approved.find((p) => p.category === c)!;
  const caseId = byCategory("case").id;
  const dialId = byCategory("dial").id;
  const handsId = byCategory("hands").id;
  const ringId = byCategory("chapter_ring").id;
  const crownId = byCategory("crown").id;
  const insertId = byCategory("bezel_insert").id;
  const strapId = byCategory("strap").id;

  it("draws the dial from a photo only when one exists, and says so when it does not", () => {
    const withPhoto = resolveWatch(input({ parts: { dial: dialId }, previewable: new Set([dialId]) }));
    expect(withPhoto.dialHref).toBe(`/assets/dial/${dialId}.webp`);
    expect(withPhoto.dialPlaceholder).toBe(false);

    const withoutPhoto = resolveWatch(input({ parts: { dial: dialId } }));
    expect(withoutPhoto.dialHref).toBeNull();
    // Named, not silently dropped: a missing photo is a statement about
    // us, not about the build.
    expect(withoutPhoto.dialPlaceholder).toBe(true);
    expect(withoutPhoto.dialName).toBeTruthy();
  });

  it("resolves illustrated parts without needing a photo at all", () => {
    const watch = resolveWatch(input({ parts: { case: caseId, hands: handsId, chapterRing: ringId, crown: crownId, bezelInsert: insertId } }));
    for (const slot of ["hands", "chapterRing", "crown", "bezelInsert"] as const) {
      expect(watch[slot], slot).not.toBeNull();
      expect(shapeById(watch[slot]!.shape), `${slot} shape`).not.toBeNull();
    }
  });

  it("keeps the physical assembly order in every combination", () => {
    // specs/05-phase-4-preview.md pass measure 5.
    const slots = { case: caseId, dial: dialId, hands: handsId, chapterRing: ringId, crown: crownId, bezelInsert: insertId, strap: strapId };
    const keys = Object.keys(slots) as (keyof typeof slots)[];
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const chosen: Record<string, string> = {};
      keys.forEach((k, i) => {
        if (mask & (1 << i)) chosen[k] = slots[k];
      });
      const order = drawnLayers(resolveWatch(input({ parts: chosen, previewable: new Set([dialId]) })));
      const at = (k: string) => order.indexOf(k);
      if (at("case") !== -1 && at("bezelInsert") !== -1) expect(at("bezelInsert")).toBeGreaterThan(at("case"));
      if (at("dial") !== -1 && at("hands") !== -1) expect(at("hands")).toBeGreaterThan(at("dial"));
      if (at("dial") !== -1 && at("chapterRing") !== -1) expect(at("chapterRing")).toBeGreaterThan(at("dial"));
      if (at("chapterRing") !== -1 && at("hands") !== -1) expect(at("hands")).toBeGreaterThan(at("chapterRing"));
      // The strap tucks UNDER the case, so it must be behind everything.
      if (at("strap") !== -1) expect(at("strap")).toBe(0);
    }
  });

  it("draws a strap with or without a case, since a strap needs no case to exist", () => {
    expect(drawnLayers(resolveWatch(input({ parts: { strap: strapId } })))).toEqual(["strap"]);
    const withCase = drawnLayers(resolveWatch(input({ parts: { strap: strapId, case: caseId } })));
    expect(withCase).toEqual(["strap", "case"]);
  });

  it("carries the case's own dimensions through to the art", () => {
    const sized = approved.find(
      (p) => p.category === "case" && typeof fromJsonColumn<Record<string, unknown>>(p.attributes).caseDiameterMm === "number",
    )!;
    expect(resolveWatch(input({ parts: { case: sized.id } })).caseMm?.caseDiameter).toBeGreaterThan(30);
    expect(resolveWatch(input()).caseMm).toBeNull();
  });

  it("leaves a case that states no diameter to fall back, rather than drawing nothing", () => {
    // 5 of 401 approved cases state none. They must still draw, at the
    // platform default -- a missing dimension is not a missing case.
    const unsized = approved.filter(
      (p) => p.category === "case" && fromJsonColumn<Record<string, unknown>>(p.attributes).caseDiameterMm == null,
    );
    for (const p of unsized) {
      const watch = resolveWatch(input({ parts: { case: p.id } }));
      expect(watch.hasCase, p.name).toBe(true);
      expect(watch.caseMm?.caseDiameter, p.name).toBeUndefined();
      expect(watchMm({ case: watch.caseMm }).caseDiameter, p.name).toBe(DEFAULT_MM.caseDiameter);
    }
  });

  it("draws nothing for an empty build", () => {
    expect(drawnLayers(resolveWatch(input()))).toEqual([]);
  });

  it("hides the crown and insert when there is no case to mount them on", () => {
    const order = drawnLayers(resolveWatch(input({ parts: { crown: crownId, bezelInsert: insertId, dial: dialId } })));
    expect(order).not.toContain("crown");
    expect(order).not.toContain("bezelInsert");
  });

  it("treats inherited object keys as unresolvable rather than as parts", () => {
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      const watch = resolveWatch(input({ parts: { hands: key, dial: key } }));
      expect(watch.hands).toBeNull();
      expect(watch.dialName).toBeNull();
    }
  });
});
