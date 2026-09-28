import { afterAll, describe, expect, it } from "vitest";
// Must come before the db client: this file stores parts and saves builds.
import "../../__tests__/temp-db";
import { like } from "drizzle-orm";
import { db, sqlite } from "../../db/client";
import { submittedParts } from "../../db/schema";
import { loadCatalog } from "../../catalog";
import { catalogSlice } from "../../build-view";
import { saveBuild } from "../../builds";
import { evaluateBuild, type Build, type SlotKey } from "../../compat";
import { saveSubmittedPart, submittedPartsById, withSubmitted } from "../store";

const URL = "https://www.ebay.co.uk/itm/335123456789";
const created: string[] = [];

async function submit(body: Record<string, unknown>) {
  const r = await saveSubmittedPart({ url: URL, ...body });
  if (r.ok) created.push(r.id);
  return r;
}

afterAll(() => {
  for (const id of created) db.delete(submittedParts).where(like(submittedParts.id, id)).run();
});

describe("bring-your-own link: storing a confirmed part", () => {
  it("writes to a throwaway copy, never the committed database", () => {
    expect(sqlite.name).toBe(process.env.MODBENCH_DB);
  });

  it("stores it user-entered, with the family derived server-side", async () => {
    const r = await submit({ slot: "case", name: "SKX007 Style Case 42.5mm", attributes: { caseDiameterMm: 42.5, lugWidthMm: 22, crownPosition: "4", family: "srpe-case" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const part = submittedPartsById([r.id])[r.id]!;
    expect(part).toMatchObject({ slot: "case", family: "skx007-case", specSource: "user-entered", sourceUrl: URL.replace("co.uk", "com") });
    expect(part.attributes).toMatchObject({ caseDiameterMm: 42.5, lugWidthMm: 22, crownPosition: "4" });
    expect(part.attributes).not.toHaveProperty("family");
  });

  it("refuses a non-allow-listed link, an impossible size and a missing slot", async () => {
    expect(await submit({ url: "https://evil.net/itm/1", slot: "case", name: "Case", attributes: {} })).toMatchObject({ ok: false });
    expect(await submit({ slot: "case", name: "Case", attributes: { caseDiameterMm: 7 } })).toMatchObject({ ok: false });
    expect(await submit({ name: "Case", attributes: {} })).toMatchObject({ ok: false });
  });

  it("is only visible to builds that name it", async () => {
    const r = await submit({ slot: "strap", name: "20mm Nylon Strap", attributes: { lugWidthMm: 20 } });
    if (!r.ok) throw new Error(r.error);
    expect(loadCatalog().parts[r.id]).toBeUndefined();
    expect(withSubmitted({}, [r.id])[r.id]).toMatchObject({ family: "generic-strap" });
    expect(withSubmitted({}, ["__proto__", "byo___proto__"])).toEqual({});
  });
});

// WS4 pass measure 2: no build containing a BYO part reaches `ok` without a
// warning -- and, since every value is someone's claim, the BYO part never
// blocks. Stored parts, not relabelled catalog ones: this goes through the
// real extraction, family derivation and storage path.
describe("property: a build with a bring-your-own part is never clean, and the part never blocks", () => {
  const SAMPLES: [SlotKey, string, Record<string, unknown>][] = [
    ["case", "SKX007 Case 42.5mm 22mm lug", { caseDiameterMm: 42.5, lugWidthMm: 22, crownPosition: "3" }],
    ["case", "Unbranded Case", {}],
    ["dial", "NH35 Dial 28.5mm", { diameterMm: 28.5, hasFeet: true, hasDateWindow: true, hasDayWindow: false }],
    ["dial", "Mystery Dial 31mm", { diameterMm: 31 }],
    ["movement", "NH36 Movement", { caliber: "NH36", hasDate: true, hasDay: true, crownPosition: "3" }],
    ["hands", "NH35 Hands", {}],
    ["bezelInsert", "SKX007 Insert", { outerDiameterMm: 38, profile: "flat", material: "ceramic" }],
    ["crystal", "SKX013 Domed Sapphire Crystal", { profile: "domed", material: "sapphire" }],
    ["chapterRing", "Chapter Ring", {}],
    ["crown", "SRPE Crown", {}],
    ["bezel", "Bezel", {}],
    ["strap", "22mm Rubber Strap", { lugWidthMm: 22 }],
  ];
  const catalog = loadCatalog();
  const slice = catalogSlice(catalog);
  const all = Object.values(slice.parts);
  let seed = 20260927;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

  it("12 stored parts x 300 random real partners, and saving refuses none for fit", async () => {
    for (const [slot, name, attributes] of SAMPLES) {
      const r = await submit({ slot, name, attributes });
      if (!r.ok) throw new Error(`${name}: ${r.error}`);
      const parts = withSubmitted(slice.parts, [r.id]);
      const withByo = { ...slice, parts };
      for (let i = 0; i < 300; i++) {
        const partner = all[Math.floor(rand() * all.length)]!;
        if (partner.slot === slot) continue;
        const build: Build = { parts: { [slot]: r.id, [partner.slot]: partner.id } };
        const result = evaluateBuild(build, withByo);
        const context = `${name} + ${partner.name}`;
        expect(result.status, context).not.toBe("ok");
        expect(result.findings.some((f) => f.severity === "warning" && f.slots.includes(slot)), context).toBe(true);
        for (const f of result.findings) if (f.slots.includes(slot)) expect(f.severity, `${context}: ${f.ruleKey}`).not.toBe("error");
      }
      expect(saveBuild({ [slot]: r.id }, withByo).ok, name).toBe(true);
    }
  });
});
