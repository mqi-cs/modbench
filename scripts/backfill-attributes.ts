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
//
// CORRECTED 2026-09-01 (Phase 2 mechanism audit). Two conflations were
// found and fixed here, the same class of bug as the crown-vs-date-position
// one below:
//
// 1. `dialApertureMm` carried three different numbers across families
//    (30.5 / 28.5 / 31.0 / 29.0) as if dial size varied by case model. It
//    doesn't. 28.5mm is the universal Seiko-mod dial standard, confirmed
//    by all four vendors independently: watchandstyle's Alpinist case
//    states "Dial fit: 28.5mm"; Lucius's dial pages say "As a standard
//    28.5mm dial it drops into any case built for that size"; Lucius's
//    NH35 movement page says "Dial: 28.5mm Seiko Mod dials"; DLW's dial
//    lists "SKX007 series, 5 SRPD series, SNZF17 series, SRP Turtle
//    series, SKX031, SNK809" as fitting one dial. SKX007 and SKX013 take
//    the SAME 28.5mm dial despite very different case diameters.
// 2. `crystalDiameterMm` was being assigned from `dialApertureMm` in
//    main() below -- reusing the dial number as the crystal number. They
//    are different parts with different sizes: SKX007 takes a 31.5mm
//    crystal, SKX013 takes 28mm, and those are explicitly NOT
//    interchangeable. Crystal is now its own field with its own values.
const CASE_DEFAULTS: Record<
  string,
  { caseDiameterMm: number | null; lugWidthMm: number | null; dialApertureMm: number | null; crystalDiameterMm: number | null }
> = {
  "skx007-case": { caseDiameterMm: 42.5, lugWidthMm: 22, dialApertureMm: 28.5, crystalDiameterMm: 31.5 },
  "skx013-case": { caseDiameterMm: 37.8, lugWidthMm: 20, dialApertureMm: 28.5, crystalDiameterMm: 28.0 },
  "srpe-case": { caseDiameterMm: 43.8, lugWidthMm: 22, dialApertureMm: 28.5, crystalDiameterMm: null }, // dial fit is the shared standard; SRPE crystal size not independently confirmed
  "alpinist-style-case": { caseDiameterMm: 39.5, lugWidthMm: 20, dialApertureMm: 28.5, crystalDiameterMm: null }, // "Dial fit: 28.5mm" vendor-stated (watchandstyle RC1697)
  "srp-turtle-case": { caseDiameterMm: 44.3, lugWidthMm: 22, dialApertureMm: 28.5, crystalDiameterMm: null },
  "nmk-n4-case": { caseDiameterMm: 40, lugWidthMm: 22, dialApertureMm: null, crystalDiameterMm: null }, // 40mm + 22mm lug are vendor-stated (body_html); dial fit not stated
  "vk6x-case": { caseDiameterMm: null, lugWidthMm: null, dialApertureMm: null, crystalDiameterMm: null }, // chronograph case sizes vary more, no single family constant
  "lucius-ultra-thin-case": { caseDiameterMm: null, lugWidthMm: null, dialApertureMm: null, crystalDiameterMm: null }, // vendor's own line spans 33-38mm per model; parsed per-part from title below
};

// Finding B (three-way date position): a case's crown position is one of
// the three facts needed to know where a movement's date wheel actually
// ends up relative to the dial. Vendor-stated only -- these come from
// DLW's own NH36 movement listing, which names the case lines by crown
// position directly: "3H Crown Position... Watch models with 3H crown:
// Samurai series, Urchin series, etc." and "4H Crown Position... To be
// exact, the crown position is at 3.8H, but most people refer to this as
// 4H. Watch models with 3.8H crown: SKX007, 5 SRPD series, SRP Turtle
// series, 5 SRPE series, etc."
//
// SKX013 is deliberately absent: it is not named in that list, and
// inferring it from being SKX007's smaller sibling would be exactly the
// kind of guess Amendment A forbids.
// Dials whose own listing names case models they will NOT fit. Vendor
// warning text, quoted verbatim in the comments -- the strongest evidence
// class this catalog has (the same class as the Ultra Thin case warning
// that Phase 0 built its false-positive-trap fixture on). These are
// invisible to family matching: all three are tagged nh3x-dial-standard,
// a movement-family family with no case-model constraint at all, so
// nothing else in the engine would ever catch them.
const DIAL_INCOMPATIBLE_CASE_FAMILIES: Record<string, string[]> = {
  // "Fit Models SNK803, SNK805, SNK807, SNK809, SKX007, SKX009, SKX011 and
  //  more / Not compatible with SKX013, SKX015 and SKX017"
  // luciusatelier.com -- SNKK87 / SNKL15 / SNKL23 dial listings
  "SEIKO SNKK87 Sunburst Dial": ["skx013-case"],
  "SEIKO SNKL15 Pinstriped Dial": ["skx013-case"],
  "SEIKO SNKL23 Pinstriped Dial": ["skx013-case"],
};

// Vendor text, found in the Phase 3 body_html mining pass. A chapter ring
// is not decoration on these cases -- it is the part that sets dial
// height, and the vendor says so in as many words:
//   "This case needs an SKX013 chapter ring to seat the dial correctly --
//    it is mandatory and never included."
//   "...without it the dial sits too low and the hands won't clear."
//   -- luciusatelier, 26 case listings
// Matched on a title fragment because the statement is per-SKU and the
// families involved (lucius-ultra-thin-case, skx013-case) also contain
// cases that carry no such statement.
const CASE_REQUIRES_CHAPTER_RING = /ultra thin|\[nh34-ready\]|watch case - 3[689]mm|datejust watch case|gs watch case|gs diver watch case|explorer watch case|seikonaut watch case/i;

// "Fits Lucius Atelier cases only. The end-links are shaped to our case
// profiles -- this bracelet does not fit generic 20mm lugs or OEM [cases]"
// -- luciusatelier, 20 bracelet listings. Stronger than the usual
// platform constraint: scoped to one VENDOR's cases, not one case line,
// so even a correctly-sized SKX013 case from another vendor is excluded.
const BRACELET_VENDOR_SCOPED = /^(oyster|settimo|president|jubilee|gs|super engineer|beads of rice|milanese) bracelet \d+\/\d+mm/i;

const CASE_CROWN_POSITIONS: Record<string, string> = {
  "skx007-case": "3.8",
  "srp-turtle-case": "3.8",
  "srpe-case": "3.8",
};

const DIAL_DEFAULTS: Record<string, { hasFeet: boolean | null; diameterMm: number | null; hasSubdials: boolean | null }> = {
  "nh3x-dial-standard": { hasFeet: true, diameterMm: 28.5, hasSubdials: false }, // body_html-confirmed convention, Phase 0
  "nh34-gmt-dial": { hasFeet: true, diameterMm: 28.5, hasSubdials: false }, // a GMT dial has a 24h track printed on it, not a subdial aperture
  "nh3x-dial-feetless": { hasFeet: false, diameterMm: 28.5, hasSubdials: false }, // the family name is the evidence -- no approved parts yet, added for when this family is populated
  // A VK6x chronograph dial has real subdial APERTURES cut in it (VK63:
  // small seconds at 6, 60-minute counter at 9, 24-hour at 3). Those holes
  // need matching subdial pinions underneath -- which only a VK6x movement
  // has. This, not "different dial feet", is the real NH-vs-VK dial
  // constraint (caliber references confirm VK63 shares the NH35's
  // mounting dimensions AND dial feet positions with zero modification).
  "vk6x-dial": { hasFeet: true, diameterMm: null, hasSubdials: true },
};

// Bezel insert outer diameters. NOTE: not currently consumed by any rule
// (insert-case-fit matches on the vendor's own family tag, which is
// stronger evidence than these numbers) -- retained as reference data.
// The previous skx007 figure (30.5mm) was never independently verified and
// looks too small for a ~38mm aftermarket insert; cleared to null rather
// than left as unverified data a future rule might trust.
const INSERT_DEFAULTS: Record<string, { outerDiameterMm: number | null }> = {
  "skx007-insert": { outerDiameterMm: null },
  "skx013-insert": { outerDiameterMm: null },
  "srp-turtle-insert": { outerDiameterMm: null },
};

// The number must stand alone: "SKX007 MM" (MarineMaster-style) and
// "NMK908 MM300" used to parse as 7mm and 8mm, the tail of a model code.
function parseMmFromTitle(title: string): number | null {
  const m = /(?<![\w.])(\d{2}(?:\.\d)?)\s*mm\b/i.exec(title);
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

// Bezel inserts and crystals have to agree on PROFILE, independently of
// both being sized for the same case model. Real, repeated vendor
// statements (watchandstyle, ~39 SKUs):
//   "Ceramic Insert compatible with flat sapphire crystals only (not
//    compatible with double dome sapphire)"  -- CI1707, CI1708
//   "it takes flat crystals only, OEM or flat sapphire, and will not sit
//    correctly under a double dome"          -- CI0024
//   "Crystal will not fit SKX007 OEM aluminum insert"  -- SG003, SG007
// A flat insert sits under a flat crystal; a sloped insert is cut to sit
// under the curve of a double-domed one. Mixing profiles means the insert
// doesn't seat correctly even when both parts are the right diameter for
// the case -- which is exactly why platform matching alone can't catch it.
//
// Parsed from titles, which state the profile consistently across all four
// vendors ("Flat Ceramic Insert", "Slope Ceramic Bezel Insert", "Double
// Dome Sapphire Crystal", "Flat Sapphire Crystal"). Null when unstated.
function parseProfile(title: string): "flat" | "domed" | "slope" | null {
  const t = title.toLowerCase();
  if (/double.?dome|domed/.test(t)) return "domed";
  if (/\bslope[d]?\b/.test(t)) return "slope";
  if (/\bflat\b/.test(t)) return "flat";
  return null;
}

// "NH35A" is the same caliber as "NH35" (WS1: 10 real movements had no
// caliber because of the suffix). NH70/71/72 are the skeleton calibers.
function parseCaliber(title: string): string | null {
  const m = /\bNH(?:3[4568]|7[012])(?=A?\b)/i.exec(title);
  return m ? m[0].toUpperCase() : null;
}

function parseMovementCrown(title: string): string | null {
  const m = /\((\d(?:\.\d)?) o'clock crown case\)|@ (\d)H Crown/i.exec(title);
  return m ? (m[1] ?? m[2]!) : null;
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
// this session found an explicit DATE-APERTURE statement for (not crown
// position -- those are two different physical facts; see the false-
// positive audit below). Positions are the set of date-window positions
// this dial's own listing states its aperture is cut for; a movement
// whose stated dateWindowPosition isn't in this set is a real, evidenced
// mismatch.
//
// Empty as of 2026-09-01 (pre-Phase-2 fixture-collision investigation):
// the one entry this table ever had ("Vintage Enamel Biege Dial (Date)",
// ["3", "4:30"]) was extracted from the dial's "Fits 3 and 4 o'clock
// crown builds" / "Crown Position: Both 3 o'clock and 4 o'clock" text --
// that's crown/stem position (which crown location the case is built
// for), not date-aperture position (where the date cutout sits on the
// dial face). The two are independent facts (confirmed via the vendor's
// own comparison table for the NH35 6H movement, which lists "Crown
// Position" and "Complication" -- the latter carrying the date position
// -- as separate columns) that this override conflated. Removed rather
// than corrected: no dial in the catalog has been independently verified
// against a real date-aperture statement yet. Per Amendment A, this stays
// empty (supportedDatePositions null, genuinely unknown) until a real one
// is found, rather than guessed at just to make date-window-alignment
// fire.
const DIAL_DATE_POSITION_OVERRIDES: Record<string, string[]> = {};

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
        // Whether this dial has chronograph subdial APERTURES cut in it
        // (holes needing matching subdial pinions underneath), a
        // family-level fact: only the vk6x-dial family does.
        hasSubdials: fam?.hasSubdials ?? null,
        // Case families this dial's own listing says it will NOT fit.
        // Empty array means "no exclusion stated", which is different from
        // "confirmed compatible with everything" -- the rule treats it as
        // the former.
        incompatibleCaseFamilies: DIAL_INCOMPATIBLE_CASE_FAMILIES[p.name] ?? [],
        lumed: parseLumed(p.name, ""),
        styleTags: (existing.styleTags as string[] | undefined) ?? [],
      };
      db.update(parts).set({ attributes: toJsonColumn(attrs), updatedAt: Date.now() }).where(eq(parts.id, p.id)).run();
      updated++;
      continue;
    }

    // Case attributes are re-derived every run for the same reason dial
    // ones are: they're entirely family constants plus deterministic title
    // parsing (never a human review decision), and the Phase 2 mechanism
    // audit corrected several of the constants -- the generic skip guard
    // below would otherwise leave every already-backfilled case stuck on
    // the wrong crystal/dial numbers forever.
    if (p.category === "case") {
      const fam = CASE_DEFAULTS[p.family];
      const parsedMm = parseMmFromTitle(p.name);
      const attrs = {
        caseDiameterMm: parsedMm ?? fam?.caseDiameterMm ?? null,
        lugWidthMm: fam?.lugWidthMm ?? null,
        dialApertureMm: fam?.dialApertureMm ?? null,
        // Its own real number now, not a copy of dialApertureMm -- see the
        // CASE_DEFAULTS comment. SKX007 = 31.5mm, SKX013 = 28mm, and those
        // are explicitly not interchangeable.
        crystalDiameterMm: fam?.crystalDiameterMm ?? null,
        // Whether the crystal is double-domed, which buys ~1mm of extra
        // hand-stack clearance -- the real constraint on running an NH34
        // GMT (taller hand post) or any tall hand set. Null unless the
        // vendor's own title says so.
        hasDoubleDomedCrystal: /double.?dome/i.test(p.name) ? true : null,
        crownPosition: CASE_CROWN_POSITIONS[p.family] ?? null, // Finding B: vendor-stated only, null where unstated
        // Vendor-stated: this case will not seat a dial at the right
        // height without a chapter ring. See CASE_REQUIRES_CHAPTER_RING.
        requiresChapterRing: CASE_REQUIRES_CHAPTER_RING.test(p.name) ? true : null,
        requiresSpacerFor: (existing.requiresSpacerFor as string[] | undefined) ?? [],
      };
      db.update(parts).set({ attributes: toJsonColumn(attrs), updatedAt: Date.now() }).where(eq(parts.id, p.id)).run();
      updated++;
      continue;
    }

    // Bezel inserts and crystals are re-derived every run for the same
    // reason cases and dials are: pure title parsing plus family
    // constants, never a human decision, and the `profile` field below is
    // new as of the Phase 2 mechanism audit.
    if (p.category === "bezel_insert" || p.category === "crystal" || p.category === "strap") {
      const attrs: Record<string, unknown> = {
        material: parseMaterial(p.name),
        // flat / slope / domed -- a bezel insert and the crystal above it
        // have to agree on this independently of case-model sizing.
        profile: parseProfile(p.name),
        styleTags: (existing.styleTags as string[] | undefined) ?? [],
      };
      if (p.category === "bezel_insert") {
        attrs.outerDiameterMm = INSERT_DEFAULTS[p.family]?.outerDiameterMm ?? null;
      }
      if (p.category === "strap") {
        // Vendor-stated in the title: "20/16mm" (lug/clasp) or "22mm".
        const m = /(\d{2})\s*\/\s*\d{2}\s*mm|\b(\d{2})\s*mm\b/i.exec(p.name);
        attrs.lugWidthMm = m ? Number(m[1] ?? m[2]) : null;
        // Vendor-stated single-vendor scoping -- see BRACELET_VENDOR_SCOPED.
        attrs.vendorScopedTo = BRACELET_VENDOR_SCOPED.test(p.name) ? "luciusatelier" : null;
      }
      db.update(parts).set({ attributes: toJsonColumn(attrs), updatedAt: Date.now() }).where(eq(parts.id, p.id)).run();
      updated++;
      continue;
    }

    if (Object.keys(existing).length > 0) continue; // already has real attributes, don't overwrite

    let attrs: Record<string, unknown> = {};

    if (p.category === "movement") {
      const caliber = parseCaliber(p.name);
      // The skeleton calibers' day/date layout and height aren't stated by
      // any vendor here; unknown stays null.
      const skeleton = caliber !== null && caliber.startsWith("NH7");
      attrs = {
        caliber,
        hasDay: skeleton ? null : caliber === "NH36" ? true : caliber ? false : null,
        hasDate: skeleton ? null : caliber === "NH38" ? false : caliber ? true : null,
        // The crown position this movement's date wheel is set for, where
        // the listing names one: DLW's "(3.8 o'clock crown case)", Lucius's
        // "Day Date @ 4H Crown". Unnamed means the factory stem at 3.
        crownPosition: parseMovementCrown(p.name),
        // Only "Date @ NH" title language counts as date-APERTURE-position
        // evidence (e.g. "Date @ 6H" -- confirmed by the vendor's own
        // comparison table listing this as the "Complication" column, a
        // date-position fact). "N H Crown" language (e.g. "Day Date @ 4H
        // Crown") states CROWN/stem position, a different physical fact --
        // conflating the two was a false-positive-in-waiting this session
        // found and removed (see DIAL_DATE_POSITION_OVERRIDES above for
        // the matching dial-side bug). Crown position isn't tracked here
        // at all yet; genuinely unknown stays null rather than guessed.
        dateWindowPosition: p.name.toLowerCase().includes("date @ 6h") ? "6" : null,
        heightMm: caliber && !skeleton ? 5.32 : null, // well-known public NH3x movement height spec
      };
    } else if (p.category === "hands") {
      attrs = {
        lengthSetMm: null,
        styleTags: [] as string[],
        lumed: parseLumed(p.name, ""),
      };
    } else {
      // chapter_ring, crown: minimal but non-empty, category has no dedicated schema shape yet
      attrs = { material: parseMaterial(p.name) };
    }

    db.update(parts).set({ attributes: toJsonColumn(attrs), updatedAt: Date.now() }).where(eq(parts.id, p.id)).run();
    updated++;
  }

  console.log(`Backfilled attributes for ${updated} approved parts.`);
}

main();
sqlite.close();
