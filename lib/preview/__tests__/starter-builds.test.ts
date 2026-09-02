import { describe, expect, it } from "vitest";
import { db } from "../../db/client";
import { parts } from "../../db/schema";
import { eq } from "drizzle-orm";
import { STARTER_BUILDS } from "../../../data/fixtures/starter-builds";
import { drawCalls, placeholders, resolveLayers } from "../composite";
import { familyPlatform } from "../../compat/platform";
import { PLATFORM_GEOMETRY, DEFAULT_PLATFORM } from "../layers";

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

      it("draws every layer its slots call for", () => {
        const caseFamily = resolved.case ? byName.get(starter.partNames.case!)?.family : undefined;
        const platform = caseFamily ? familyPlatform(caseFamily) : null;
        const layers = resolveLayers({
          parts: resolved,
          previewable,
          names,
          platform: platform && platform in PLATFORM_GEOMETRY ? platform : DEFAULT_PLATFORM,
          hasCase: Boolean(resolved.case),
        });
        const missing = placeholders(layers);
        expect(
          missing.map((l) => `${l.key}: ${l.label}`),
          "starter builds are the first thing a visitor sees, so a placeholder here is a broken first impression -- swap the part for one with a usable vendor photograph rather than relaxing this",
        ).toEqual([]);
        // Case, bezel and glare are drawn art; the rest come from the
        // prepared assets. Anything less means a layer went missing.
        expect(drawCalls(layers).length).toBe(3 + Object.keys(resolved).filter((s) => s !== "case" && s !== "movement").length);
      });
    });
  }
});
