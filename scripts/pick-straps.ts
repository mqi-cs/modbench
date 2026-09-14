// Chooses a strap for each curated style build.
//
// WHY THIS EXISTS RATHER THAN A HAND-EDITED LIST
//
// The first pass at this validated each candidate against the
// compatibility engine and took the first that passed. Every build passes
// on nearly every strap, so "the first that passed" was the same strap
// every time: seven of ten curated builds ended up on one brushed
// bracelet, including a dress build that wanted leather and a field watch
// that wanted a NATO. Validation is a floor, not a preference.
//
// So this picks on three things in order: the KIND of strap the build's
// own style tags imply, then colour agreement with what is already on the
// build, then whether the exact strap has been used already. The
// compatibility check stays where it was -- as the floor every candidate
// still has to clear.
//
//   pnpm pick-straps [--write]
//
// Prints the picks; only rewrites data/fixtures/style-builds.ts with
// --write.

import { readFileSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { familyExceptions, listings, parts, vendors } from "../lib/db/schema";
import { fromJsonColumn } from "../lib/db/json";
import { evaluateBuild, type CatalogSlice, type SlotKey } from "../lib/compat";
import { STYLE_BUILDS } from "../data/fixtures/style-builds";

const CATEGORY_TO_SLOT: Record<string, SlotKey> = {
  movement: "movement", case: "case", dial: "dial", hands: "hands", bezel_insert: "bezelInsert",
  bezel: "bezel", crystal: "crystal", chapter_ring: "chapterRing", crown: "crown", strap: "strap",
};

const rows = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
const byName = new Map(rows.map((r) => [r.name, r]));
const tagsOf = (r: (typeof rows)[number]) => {
  const t = fromJsonColumn<{ styleTags?: string[] }>(r.attributes).styleTags;
  return Array.isArray(t) ? t : [];
};
const shapeOf = (r: (typeof rows)[number]) => fromJsonColumn<{ shapeTag?: string }>(r.attributes).shapeTag ?? "";

const sliceParts: CatalogSlice["parts"] = {};
for (const p of rows) {
  const slot = CATEGORY_TO_SLOT[p.category];
  if (!slot) continue;
  sliceParts[p.id] = {
    id: p.id, slot, family: p.family, name: p.name,
    attributes: fromJsonColumn<Record<string, unknown>>(p.attributes),
    specSource: p.specSource as never, confidence: p.confidence as never,
  };
}
const allVendors = db.select().from(vendors).all();
const vendorById = new Map(allVendors.map((v) => [v.id, v]));
const slice: CatalogSlice = {
  parts: sliceParts,
  listings: db.select().from(listings).all()
    .filter((l) => sliceParts[l.partId] && l.priceMinorBase !== null)
    .map((l) => ({
      partId: l.partId,
      vendorKey: vendorById.get(l.vendorId)?.key ?? "unknown",
      priceMinorBase: l.priceMinorBase as number,
      shippingFlatMinor: vendorById.get(l.vendorId)?.shippingFlatMinor ?? 0,
      inStock: Boolean(l.inStock),
    })) as never,
  familyExceptions: db.select().from(familyExceptions).all().map((e) => ({
    partId: e.partId, ruleKey: e.ruleKey, severity: e.severity as never, message: e.message,
  })),
} as CatalogSlice;

/** The standard curated builds are held to, same as lib/__tests__/sharing.test.ts. */
const CATALOG_WIDE = new Set([
  "unverified-part", "date-window-alignment", "day-window-presence",
  "hand-stack-clearance", "strap-fit",
]);
function passes(base: Record<string, string>, strapId: string): boolean {
  const result = evaluateBuild({ parts: { ...base, strap: strapId } } as never, slice);
  if (result.status === "blocked") return false;
  return !result.findings.some((f) => f.severity === "warning" && !CATALOG_WIDE.has(f.ruleKey));
}

/**
 * Strap kinds this build's own tags call for, best first.
 *
 * Deliberately ordered, not weighted: a dress watch on a dive bracelet is
 * not "slightly worse", it is the wrong object, and no amount of colour
 * agreement should outrank that.
 */
type Archetype = "dress" | "field" | "gmt" | "utility" | "skin" | "vintage" | "dive";

/**
 * What kind of watch this build is.
 *
 * Taken from the curated slug first. These ten pages are hand-named looks
 * -- "white-dial-dress", "field-watch", "skin-diver" -- and that label is
 * a more reliable statement of intent than tags aggregated up from the
 * parts, which said "dive-bezel" for the field watch because its insert
 * happens to be ceramic. Tags are the fallback for any build whose slug
 * says nothing.
 */
function archetypeOf(slug: string, tags: Set<string>): Archetype {
  if (/dress/.test(slug)) return "dress";
  if (/field/.test(slug)) return "field";
  if (/gmt|traveller/.test(slug)) return "gmt";
  if (/utility/.test(slug)) return "utility";
  if (/skin/.test(slug)) return "skin";
  if (/vintage/.test(slug)) return "vintage";
  if (tags.has("dressy") && !tags.has("tool-watch")) return "dress";
  if (tags.has("pilot")) return "field";
  return "dive";
}

const KINDS: Record<Archetype, string[]> = {
  dress: ["strap-band", "strap-jubilee", "strap-oyster"],
  field: ["strap-nato", "strap-band", "strap-oyster"],
  gmt: ["strap-jubilee", "strap-oyster", "strap-band"],
  utility: ["strap-band", "strap-nato", "strap-oyster"],
  skin: ["strap-band", "strap-oyster", "strap-nato"],
  vintage: ["strap-band", "strap-nato", "strap-oyster"],
  dive: ["strap-oyster", "strap-jubilee", "strap-bracelet", "strap-band"],
};

/** What a band on this kind of watch should be made of. */
const MATERIAL: Record<Archetype, "leather" | "rubber" | "either"> = {
  dress: "leather", field: "either", gmt: "either",
  utility: "rubber", skin: "rubber", vintage: "rubber", dive: "rubber",
};

/** Words that say what a band is made of, since material is not a tag. */
const LEATHER = /\bleather\b|\bcordovan\b|\bsuede\b|\bcalf\b|\bpebbled\b|\bshell\b/i;
const RUBBER = /\brubber\b|\bfkm\b|\bsilicone\b|\btropic\b|\bwaffle\b/i;

const straps = rows.filter((r) => r.category === "strap");

function main() {
  const write = process.argv.includes("--write");
  const usedParts = new Set<string>();
  const usedKinds = new Map<string, number>();
  const picks: { slug: string; name: string; why: string }[] = [];

  for (const build of STYLE_BUILDS) {
    const base: Record<string, string> = {};
    const tags = new Set<string>();
    let caseName = "";
    for (const [slot, name] of Object.entries(build.partNames)) {
      if (slot === "strap") continue;
      const row = byName.get(name as string);
      if (!row) continue;
      base[slot] = row.id;
      if (slot === "case") caseName = row.name;
      for (const t of tagsOf(row)) tags.add(t);
    }
    const archetype = archetypeOf(build.slug, tags);
    const kinds = KINDS[archetype];
    const material = MATERIAL[archetype];
    const platform = /SKX013/i.test(caseName) ? "SKX013" : /Turtle|SRP/i.test(caseName) ? "Turtle" : "SKX007";
    const buildColours = [...tags].filter((t) => ["green", "blue", "brown", "orange", "red", "cream", "grey"].includes(t));
    const dark = /black|pvd|dlc/i.test(caseName);

    const scored = straps
      .map((s) => {
        const kind = shapeOf(s);
        const rank = kinds.indexOf(kind);
        if (rank === -1) return null;
        const st = tagsOf(s);
        let score = (kinds.length - rank) * 100;

        // Material, for bands: a vintage diver wants tropic rubber, a
        // dress build wants leather, and neither is a style tag.
        // Material outranks colour. The first version had these the other
        // way round and put a red rubber strap on the dress build,
        // because the dial has a red seconds hand.
        if (kind === "strap-band") {
          if (material === "leather") score += LEATHER.test(s.name) ? 120 : RUBBER.test(s.name) ? -40 : 0;
          else if (material === "rubber") score += RUBBER.test(s.name) ? 120 : LEATHER.test(s.name) ? 30 : 0;
          else score += LEATHER.test(s.name) || RUBBER.test(s.name) ? 60 : 0;
          // A vintage build wants tropic rubber specifically.
          if (archetype === "vintage" && /\btropic\b/i.test(s.name)) score += 60;
        }
        // Colour: echo a colour already on the build, else stay neutral.
        if (buildColours.some((c) => st.includes(c))) score += 30;
        else if (st.includes("black") || st.includes("brown")) score += 14;
        if (dark && st.includes("black")) score += 10;
        // A steel bracelet on a steel case, not a black one.
        if (kind !== "strap-band" && kind !== "strap-nato") {
          if (dark && st.includes("black")) score += 8;
          if (!dark && (st.includes("silver-tone") || st.length === 0)) score += 14;
          if (!dark && st.includes("black")) score -= 30;
        }
        if (new RegExp(platform, "i").test(s.name)) score += 18;
        // Variety. The whole reason this script exists.
        if (usedParts.has(s.id)) score -= 250;
        score -= (usedKinds.get(kind) ?? 0) * 22;
        return { s, score, kind };
      })
      .filter((x): x is { s: (typeof rows)[number]; score: number; kind: string } => x !== null)
      .sort((a, b) => b.score - a.score);

    const chosen = scored.find((c) => passes(base, c.s.id));
    if (!chosen) {
      console.log(`${build.slug.padEnd(22)} NO CANDIDATE PASSED`);
      continue;
    }
    usedParts.add(chosen.s.id);
    usedKinds.set(chosen.kind, (usedKinds.get(chosen.kind) ?? 0) + 1);
    picks.push({ slug: build.slug, name: chosen.s.name, why: `${archetype}/${chosen.kind}` });
    console.log(`${build.slug.padEnd(22)} ${archetype.padEnd(9)} ${chosen.kind.padEnd(16)} ${chosen.s.name}`);
  }

  const kinds = [...usedKinds.entries()].map(([k, n]) => `${k} x${n}`).join(", ");
  console.log(`\nKinds used: ${kinds}`);
  console.log(`Distinct straps: ${new Set(picks.map((p) => p.name)).size} of ${picks.length}`);

  if (!write) {
    console.log("\nDry run. Re-run with --write to update data/fixtures/style-builds.ts.");
    return;
  }
  let src = readFileSync("data/fixtures/style-builds.ts", "utf-8");
  for (const p of picks) {
    const before = STYLE_BUILDS.find((b) => b.slug === p.slug)?.partNames.strap;
    if (!before || before === p.name) continue;
    src = src.replace(`strap: "${before}",`, `strap: "${p.name}",`);
  }
  writeFileSync("data/fixtures/style-builds.ts", src);
  console.log("\nWrote data/fixtures/style-builds.ts.");
}

main();
sqlite.close();
