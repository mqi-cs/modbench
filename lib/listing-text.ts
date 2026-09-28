// Pure listing-text parsers: title/tag text -> part attributes. Shared by
// the catalog pipeline (scripts/tag-parts.ts, scripts/backfill-attributes.ts)
// and WS4's bring-your-own-link extraction (lib/byo/extract.ts), so a fix to
// one pattern reaches both. Moved here unchanged from those two scripts.

// Shared keyword -> family-prefix resolver for every category that follows
// the skx007-*/skx013-*/srpe-*/srp-turtle-*/ssk-gmt-* naming convention
// (chapter_ring, bezel, crown, and the case-specific strap/bracelet
// families). Checked against the combined title+type+tags text.
export function resolveCaseModelPrefix(text: string): string | null {
  if (/\bssk\b/.test(text) && !text.includes("ssk023")) return "ssk-gmt";
  if (text.includes("srpe")) return "srpe";
  if (text.includes("skx013")) return "skx013";
  if (text.includes("skx007") || text.includes("srpd")) return "skx007";
  if (text.includes("turtle")) return "srp-turtle";
  return null;
}

// A day/date-wheel disc, rotor, bridge, corrector wheel, dial washer,
// barrel, mainspring, C-clip, small screws, intermediate wheel/pinion,
// gasket, movement stem, or spacer ring installs onto an existing movement
// -- none of these are themselves a swappable movement. Found pre-Phase-2
// (2026-09-01): 33 were tagged straight into nh3x-movement alongside
// complete movements in this session's own tagging pass (fixed below), and
// a SEPARATE 75 were found already sitting in nh3x-movement from an
// earlier review pass that predates this split entirely -- decorative
// rotor/bridge finishes (Côtes de Genève, Clous de Paris, Great Wave,
// GS 9SA5, FPJ Diamond, ...) and small mechanical spares, all approved
// before nh3x-movement-accessory existed, so the tagger's "never overwrite
// an approved part" guard meant they'd stay silently mixed into the
// complete-movement family forever. A build configurator's movement slot
// treating "NH Movement Rotor - Côtes de Genève - Blue" as if it fulfilled
// the slot is exactly the false-positive shape this project exists to
// prevent -- movements anchor every Phase 2 rule. The 75 pre-existing rows
// were corrected directly (same evidence, see parts.evidence for each);
// this broadened pattern is what makes a full rebuild from scratch produce
// the same, correct classification from the source data.
//
// Deliberately checks the TITLE only, not the full title+type+tags blob:
// a complete movement's own tags can legitimately mention "Black Date
// Wheel" or "White Day Wheel" to describe which wheel color ships
// installed (watchandstyle does this) -- that's a spec of the movement,
// not evidence the product IS a wheel disc. Caught this as a live false
// positive on "Seiko (TMI) NH35A Automatic Movement" (tags: "White Day
// Wheel") before it reached review. Product titles for the actual spare
// parts always name the part itself ("... Day Wheel Disc", "... Movement
// Rotor", "... Movement Stem", "... Spacer Ring"), so title-only matching
// is both sufficient and precise here.
// A caseback sold on its own ("SKX Slim Caseback", "C0367 SKX007 Sterile Case
// Back"), not a case that comes with one ("Case - SKX007 Sub - Polished Steel
// (With Case Back)"). There's no caseback slot, and in the case slot every
// rule judged one as a whole SKX case (WS2c follow-up, 2026-09-28).
export function isCaseback(title: string): boolean {
  return /case ?back/i.test(title) && !/with case ?back/i.test(title);
}

export function isMovementAccessory(title: string): boolean {
  return /day.?wheel|date.?wheel|\brotor\b|\bbridge\b|corrector|\bwheel\b|washer|\bscrews?\b|\bbarrel\b|mainspring|\bc clip\b|\bsnap\b|\bspacer\b|\bpinion\b|\bgasket\b|movement stem|\bstem\b|holding spacer/i.test(title);
}

// Out-of-scope markers, split by what they actually constrain:
//
// BRAND markers indicate a genuinely different movement/pinion spec --
// these apply everywhere, hands and dials included, because a Miyota hand
// set is not sized for an NH3x pinion regardless of what case it's styled
// after.
//
// CASE_MODEL markers (Sumo, Samurai, MM300, etc.) are model-shape/diameter
// constraints. They matter for case, crown, bezel, bracelet-strap, crystal,
// and chapter_ring, which all physically depend on the case's exact
// dimensions -- but NOT for hands or dial, where "Sumo style" or "Samurai
// style" is a cosmetic name on an otherwise-ordinary NH3x-compatible part.
// (Concretely: "Hands - Sumo" at dlwwatches is a real NH3x hand set styled
// after the Sumo -- it mounts on the standard pinion regardless, and was
// already correctly tagged nh3x-hands-standard and used in
// known-builds.json before this pass. Applying the case-model check to
// hands/dial would silently regress that.)
export const BRAND_OUT_OF_SCOPE: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bmiyota\b/, reason: "Miyota movement/hands -- a different movement brand from the NH3x family this catalog scopes, no family seeded" },
  { pattern: /\borient\b/, reason: "Orient brand part -- out of scope, this catalog covers Seiko/aftermarket NH3x-and-SKX-family parts only" },
  { pattern: /\btweezers?\b|\bbergeon\b|\bscrewdriver|\bhand.?press|\bcase.?opener|\bmovement holder/, reason: "a tool, not a watch part" },
  { pattern: /\bdiy watchmaking kit\b/, reason: "a bundled multi-part kit product, does not map to a single part category" },
  { pattern: /\bgasket\b/, reason: "a seal/gasket accessory, not a component with its own compatibility family" },
];

export const CASE_MODEL_OUT_OF_SCOPE: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bssk023\b/, reason: "SKX023 family (abbreviated SSK023 by some vendors) -- a different case model, no family seeded this session" },
  { pattern: /\bsnxs\b/, reason: "insufficient real family size (snxs-crystal confirmed at 2 SKUs across all 4 vendors, all categories -- see singleton-verification.md)" },
  { pattern: /\bsumo\b/, reason: "Seiko Sumo case model -- a different case line (~45mm), no family seeded this session" },
  { pattern: /\bmm300\b/, reason: "Seiko MM300 case model -- a different case line, no family seeded this session" },
  { pattern: /\bsamurai\b/, reason: "Seiko Samurai case model -- a different case line, no family seeded this session" },
  { pattern: /\burchin\b|\bsnzf\b/, reason: "Seiko 'Sea Urchin' (SNZF) case model -- a different case line, no family seeded this session" },
  { pattern: /\b62mas\b/, reason: "Seiko 62MAS-style case -- a different case line, no family seeded this session" },
  { pattern: /\bmako\b|\bray\b/, reason: "Orient Mako/Ray case model -- different brand and case line, no family seeded this session" },
];

// bezel_insert included: an insert's outer diameter is exactly as
// case-diameter-dependent as the bezel ring it sits in, chapter ring, or
// crystal -- this was a real gap (found via Investigation B follow-up)
// that let model-specific inserts (e.g. "Ceramic Insert - Samurai...")
// silently stay untagged instead of being rejected with a reason.
export const CASE_SHAPE_DEPENDENT_CATEGORIES = new Set(["case", "crown", "bezel", "bezel_insert", "strap", "crystal", "chapter_ring"]);

export function checkOutOfScope(text: string, category: string): string | null {
  for (const { pattern, reason } of BRAND_OUT_OF_SCOPE) {
    if (pattern.test(text)) return reason;
  }
  if (CASE_SHAPE_DEPENDENT_CATEGORIES.has(category)) {
    for (const { pattern, reason } of CASE_MODEL_OUT_OF_SCOPE) {
      if (pattern.test(text)) return reason;
    }
  }
  return null;
}

// The number must stand alone: "SKX007 MM" (MarineMaster-style) and
// "NMK908 MM300" used to parse as 7mm and 8mm, the tail of a model code.
export function parseMmFromTitle(title: string): number | null {
  const m = /(?<![\w.])(\d{2}(?:\.\d)?)\s*mm\b/i.exec(title);
  return m ? Number(m[1]) : null;
}

export function parseMaterial(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("ceramic")) return "ceramic";
  if (t.includes("sapphire")) return "sapphire";
  if (t.includes("aluminium") || t.includes("aluminum")) return "aluminum";
  if (t.includes("steel bezel insert") || t.includes("steel insert")) return "steel";
  if (t.includes("carbon")) return "carbon";
  if (t.includes("glass")) return "glass";
  return null;
}

export function parseLumed(title: string, tags: string): boolean | null {
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
export function parseProfile(title: string): "flat" | "domed" | "slope" | null {
  const t = title.toLowerCase();
  if (/double.?dome|domed/.test(t)) return "domed";
  if (/\bslope[d]?\b/.test(t)) return "slope";
  if (/\bflat\b/.test(t)) return "flat";
  return null;
}

// "NH35A" is the same caliber as "NH35" (WS1: 10 real movements had no
// caliber because of the suffix). NH70/71/72 are the skeleton calibers.
export function parseCaliber(title: string): string | null {
  const m = /\bNH(?:3[4568]|7[012])(?=A?\b)/i.exec(title);
  return m ? m[0].toUpperCase() : null;
}

export function parseMovementCrown(title: string): string | null {
  const m = /\((\d(?:\.\d)?) o'clock crown case\)|@ (\d)H Crown/i.exec(title);
  return m ? (m[1] ?? m[2]!) : null;
}

// Real, positive vendor evidence only, per Amendment A -- "no date" in a
// title is as much a vendor statement as "date" is. A title that mentions
// neither leaves both fields null (never guessed) rather than assuming
// "most dials have a date."
export function parseDialComplication(title: string): { hasDateWindow: boolean | null; hasDayWindow: boolean | null } {
  const t = title.toLowerCase();
  if (/day[\s\-/]?date/.test(t)) return { hasDateWindow: true, hasDayWindow: true };
  if (/no date/.test(t)) return { hasDateWindow: false, hasDayWindow: false };
  if (/\bdate\b/.test(t)) return { hasDateWindow: true, hasDayWindow: false };
  return { hasDateWindow: null, hasDayWindow: null };
}
