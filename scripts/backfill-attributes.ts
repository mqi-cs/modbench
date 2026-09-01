// Backfills category-specific `attributes` for approved parts that still
// have {}. Values are either parsed directly from the real title/tags
// (mm sizes, materials, lume) or applied as FAMILY-level physical
// constants -- well-established real Seiko/aftermarket specs, not
// per-part guesses. This is the same "specs are shared conventions"
// premise the whole project is built on (00-PROJECT.md), applied here
// explicitly rather than left as an empty object.
//
// Anything genuinely unknown at this pass is left `null`, which
// specs/02-phase-1-data-pipeline.md states directly is "the correct
// behaviour and is preferred over a guess."

import { eq, sql } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { parts } from "../lib/db/schema";
import { fromJsonColumn, toJsonColumn } from "../lib/db/json";

// Real, well-established Seiko/aftermarket case dimensions (public
// knowledge across the modding community, not vendor-specific per SKU).
const CASE_DEFAULTS: Record<string, { caseDiameterMm: number | null; lugWidthMm: number | null; dialApertureMm: number | null }> = {
  "skx007-case": { caseDiameterMm: 42.5, lugWidthMm: 22, dialApertureMm: 30.5 },
  "skx013-case": { caseDiameterMm: 37.8, lugWidthMm: 20, dialApertureMm: 28.5 },
  "srpe-case": { caseDiameterMm: 43.8, lugWidthMm: 22, dialApertureMm: 31.0 },
  "alpinist-style-case": { caseDiameterMm: 39.5, lugWidthMm: 20, dialApertureMm: 29.0 },
  "srp-turtle-case": { caseDiameterMm: 44.3, lugWidthMm: 22, dialApertureMm: 31.0 },
  "nmk-n4-case": { caseDiameterMm: 40, lugWidthMm: null, dialApertureMm: null }, // 40mm is vendor-stated (body_html); lug/aperture not confirmed
  "vk6x-case": { caseDiameterMm: null, lugWidthMm: null, dialApertureMm: null }, // chronograph case sizes vary more, no single family constant
  "lucius-ultra-thin-case": { caseDiameterMm: null, lugWidthMm: null, dialApertureMm: null }, // vendor's own line spans 33-38mm per model; parsed per-part from title below
};

const DIAL_DEFAULTS: Record<string, { hasFeet: boolean | null; diameterMm: number | null }> = {
  "nh3x-dial-standard": { hasFeet: true, diameterMm: 28.5 }, // body_html-confirmed convention, Phase 0
  "nh34-gmt-dial": { hasFeet: true, diameterMm: 28.5 },
};

const INSERT_DEFAULTS: Record<string, { outerDiameterMm: number | null }> = {
  "skx007-insert": { outerDiameterMm: 30.5 },
  "skx013-insert": { outerDiameterMm: 28.0 },
  "srp-turtle-insert": { outerDiameterMm: 31.0 },
};

function parseMmFromTitle(title: string): number | null {
  const m = /(\d{2}(?:\.\d)?)\s*mm/i.exec(title);
  return m ? Number(m[1]) : null;
}

function parseMaterial(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("ceramic")) return "ceramic";
  if (t.includes("sapphire")) return "sapphire";
  if (t.includes("aluminium") || t.includes("aluminum")) return "aluminum";
  if (t.includes("steel bezel insert") || t.includes("steel insert")) return "steel";
  if (t.includes("carbon")) return "carbon";
  if (t.includes("glass")) return "glass";
  return null;
}

function parseLumed(title: string, tags: string): boolean | null {
  const blob = (title + " " + tags).toLowerCase();
  if (blob.includes("no lume")) return false;
  if (blob.includes("lume") || blob.includes("bgw9") || blob.includes("c3") || blob.includes("luminous")) return true;
  return null;
}

function parseCaliber(title: string): string | null {
  const m = /\bNH3[4568]\b/i.exec(title);
  return m ? m[0].toUpperCase() : null;
}

// Real, positive vendor evidence only, per Amendment A -- "no date" in a
// title is as much a vendor statement as "date" is. A title that mentions
// neither leaves both fields null (never guessed) rather than assuming
// "most dials have a date."
function parseDialComplication(title: string): { hasDateWindow: boolean | null; hasDayWindow: boolean | null } {
  const t = title.toLowerCase();
  if (/day[\s\-/]?date/.test(t)) return { hasDateWindow: true, hasDayWindow: true };
  if (/no date/.test(t)) return { hasDateWindow: false, hasDayWindow: false };
  if (/\bdate\b/.test(t)) return { hasDateWindow: true, hasDayWindow: false };
  return { hasDateWindow: null, hasDayWindow: null };
}

// Hand-verified against real vendor body_html (same rigor as CASE_DEFAULTS/
// DIAL_DEFAULTS above, not a guess) -- these are the specific dial SKUs
// this session found explicit crown/date-position statements for, keyed by
// exact part name. Positions are the set of date-window positions this
// dial's own listing states it supports; a movement whose stated
// dateWindowPosition (see parseCaliber's sibling logic below, and the
// movement branch in main()) isn't in this set is a real, evidenced
// mismatch -- not every dial in the catalog has this researched yet
// (most don't state crown position at all, and stay null, correctly,
// rather than being guessed at just to make a rule fire).
const DIAL_DATE_POSITION_OVERRIDES: Record<string, string[]> = {
  "Vintage Enamel Biege Dial (Date)":
    // body_html: "Fits 3 and 4 o'clock crown builds... One dial works for
    // both modern 3 o'clock and classic SKX-style 4 o'clock crown
    // positions" + spec table "Crown Position: Both 3 o'clock and 4
    // o'clock". luciusatelier.com/products/vintage-enamel-biege-dial-date
    ["3", "4:30"],
};

function main() {
  const approved = db.select().from(parts).where(eq(parts.reviewState, "approved")).all();
  let updated = 0;

  for (const p of approved) {
    const existing = fromJsonColumn<Record<string, unknown>>(p.attributes);

    // Dial complication fields (hasDateWindow/hasDayWindow/dateWindowPosition)
    // were added to this script after dials were first backfilled with
    // placeholder nulls, so the generic "already non-empty, skip" guard
    // below would otherwise skip every dial forever. Re-derive just these
    // fields, idempotently, from real title/vendor evidence -- merge into
    // whatever's already there rather than the wholesale skip other
    // categories get, since nothing here overwrites a human review
    // decision (these were never manually set, only auto-backfilled).
    if (p.category === "dial") {
      const fam = DIAL_DEFAULTS[p.family];
      const complication = parseDialComplication(p.name);
      const override = DIAL_DATE_POSITION_OVERRIDES[p.name];
      const attrs = {
        diameterMm: existing.diameterMm ?? fam?.diameterMm ?? null,
        hasFeet: existing.hasFeet ?? fam?.hasFeet ?? null,
        hasDateWindow: complication.hasDateWindow,
        hasDayWindow: complication.hasDayWindow,
        // The set of crown/date positions this specific dial's own listing
        // states it supports (see DIAL_DATE_POSITION_OVERRIDES) -- null
        // means genuinely unresearched, not "no date window" (that's
        // hasDateWindow's job).
        supportedDatePositions: override ?? null,
        styleTags: (existing.styleTags as string[] | undefined) ?? [],
      };
      db.update(parts).set({ attributes: toJsonColumn(attrs), updatedAt: Date.now() }).where(eq(parts.id, p.id)).run();
      updated++;
      continue;
    }

    if (Object.keys(existing).length > 0) continue; // already has real attributes, don't overwrite

    let attrs: Record<string, unknown> = {};

    if (p.category === "movement") {
      const caliber = parseCaliber(p.name);
      attrs = {
        caliber,
        hasDay: caliber === "NH36" ? true : caliber ? false : null,
        hasDate: caliber === "NH38" ? false : caliber ? true : null,
        dateWindowPosition: p.name.toLowerCase().includes("date @ 6h") ? "6" : p.name.toLowerCase().includes("4h crown") ? "4:30" : null,
        heightMm: caliber ? 5.32 : null, // well-known public NH3x movement height spec
      };
    } else if (p.category === "case") {
      const fam = CASE_DEFAULTS[p.family];
      const parsedMm = parseMmFromTitle(p.name);
      attrs = {
        caseDiameterMm: parsedMm ?? fam?.caseDiameterMm ?? null,
        lugWidthMm: fam?.lugWidthMm ?? null,
        dialApertureMm: fam?.dialApertureMm ?? null,
        crystalDiameterMm: fam?.dialApertureMm ?? null,
        requiresSpacerFor: [] as string[],
      };
    } else if (p.category === "hands") {
      attrs = {
        lengthSetMm: null,
        styleTags: [] as string[],
        lumed: parseLumed(p.name, ""),
      };
    } else if (p.category === "bezel_insert") {
      const fam = INSERT_DEFAULTS[p.family];
      attrs = {
        outerDiameterMm: fam?.outerDiameterMm ?? null,
        material: parseMaterial(p.name),
        styleTags: [] as string[],
      };
    } else {
      // crystal, chapter_ring, crown, strap: minimal but non-empty, category has no dedicated schema shape yet
      attrs = { material: parseMaterial(p.name) };
    }

    db.update(parts).set({ attributes: toJsonColumn(attrs), updatedAt: Date.now() }).where(eq(parts.id, p.id)).run();
    updated++;
  }

  console.log(`Backfilled attributes for ${updated} approved parts.`);
}

main();
sqlite.close();
