import { describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { parts } from "../../db/schema";
import { eq } from "drizzle-orm";
import { STARTER_BUILDS } from "../../../data/fixtures/starter-builds";
import { drawnLayers, resolveWatch, type ResolveInput } from "../composite";
import { fromJsonColumn } from "../../db/json";

// specs/05-phase-4-preview.md pass measure 1: "All three starter builds
// render with every layer present."
//
// Run against the real database rather than a fixture, because the thing
// being checked is whether the asset pipeline actually produced layers for
// the parts the app puts in front of a first-time visitor. A fixture would
// pass whatever the pipeline did.

const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
const byName = new Map(approved.map((p) => [p.name, p]));
const previewable = new Set(approved.filter((p) => p.assetState === "ready").map((p) => p.id));
const names = Object.fromEntries(approved.map((p) => [p.id, p.name]));

describe("starter builds", () => {
  for (const starter of STARTER_BUILDS) {
    describe(starter.name, () => {
      const resolved: Record<string, string> = {};
      for (const [slot, name] of Object.entries(starter.partNames)) {
        const part = byName.get(name);
        if (part) resolved[slot] = part.id;
      }

      it("resolves every named part to an approved catalog row", () => {
        expect(Object.keys(resolved).sort()).toEqual(Object.keys(starter.partNames).sort());
      });

      it("draws every part its slots call for", () => {
        const meta: ResolveInput["meta"] = Object.fromEntries(
          approved.map((p) => {
            const a = fromJsonColumn<Record<string, unknown>>(p.attributes);
            return [p.id, { name: p.name, shape: String(a.shapeTag ?? ""), tags: Array.isArray(a.styleTags) ? (a.styleTags as string[]) : [] }];
          }),
        );
        const watch = resolveWatch({ parts: resolved, previewable, meta });
        // Starter builds are the first thing a visitor sees, so every
        // part they name must actually draw.
        for (const slot of ["crown", "chapterRing", "hands", "bezelInsert"] as const) {
          if (resolved[slot]) expect(watch[slot], `${slot} did not resolve`).not.toBeNull();
        }
        expect(
          watch.dialPlaceholder,
          "a starter build showing no dial is a broken first impression -- swap the dial for one with a usable photograph rather than relaxing this",
        ).toBe(false);
        expect(drawnLayers(watch).length).toBeGreaterThan(2);
      });
    });
  }
});
