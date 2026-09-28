// WS4 step 4: a marketplace listing's title and item specifics -> a draft
// part the user confirms. Pure: no DB, no network.
//
// The recurring bug in this project is a text pattern matching structure
// instead of the attribute ("SKX007 MM" read as a 7 mm case; a case listing
// "for 28.5mm dial" read as a dial). So every number is taken only from an
// item specific named for it, or from a title phrase that names the
// attribute next to the number, and must fall in a plausible range. Anything
// not found is listed in `unmatched` -- loud, never guessed.
import type { SlotKey } from "../compat";
import {
  checkOutOfScope,
  parseDialComplication,
  parseMaterial,
  parseMovementCrown,
  parseProfile,
  resolveCaseModelPrefix,
} from "../listing-text";

export interface ListingText {
  title: string;
  // Item specifics, name -> value (eBay "localizedAspects"). Optional:
  // manual entry has only what the user pasted.
  aspects?: Record<string, string>;
}

// The fields the confirmation screen shows per slot -- the ones rules read.
// Order is display order.
export const KEY_FIELDS: Record<SlotKey, string[]> = {
  case: ["caseDiameterMm", "lugWidthMm", "crownPosition"],
  dial: ["diameterMm", "hasFeet", "hasDateWindow", "hasDayWindow"],
  movement: ["caliber", "hasDate", "hasDay", "crownPosition"],
  hands: [],
  strap: ["lugWidthMm"],
  bezelInsert: ["outerDiameterMm", "profile", "material"],
  crystal: ["profile", "material"],
  chapterRing: [],
  crown: [],
  bezel: [],
};

export interface Draft {
  slot: SlotKey | null;
  family: string;
  name: string;
  attributes: Record<string, unknown>;
  // Every value the listing stated, whatever slot it belongs to, so the
  // confirm screen can refill when the user changes the slot. `from` says
  // where each came from.
  found: Record<string, unknown>;
  movementsListed: string[];
  // Where each proposed value came from, for the confirm screen and the
  // stored audit trail: "item specific: Case Size" or "title: '42mm case'".
  from: Record<string, string>;
  // Key fields (and "slot") nothing in the listing stated.
  unmatched: string[];
  // Why the family is "unknown", when a case line was named but isn't one
  // the catalog models.
  outOfScope: string | null;
}

// Most specific first: "bezel insert" must win over "bezel", "chapter ring"
// over "ring". A title naming two slots ("case for 28.5mm dial") proposes
// neither -- the user picks.
const SLOT_WORDS: [SlotKey, RegExp][] = [
  ["bezelInsert", /\bbezel insert\b|\binsert\b/],
  ["chapterRing", /\bchapter ring\b|\brehaut\b/],
  ["bezel", /\bbezel\b(?! insert)/],
  ["crystal", /\bcrystal\b|\bsapphire glass\b/],
  // "4 o'clock crown" and "crown at 4" describe a case, not a crown for sale.
  ["crown", /(?<!o'?clock |\dh )\bcrown\b(?! (?:at|@|position)\b)/],
  ["hands", /\bhands?\b/],
  ["dial", /\bdial\b/],
  ["movement", /\bmovement\b/],
  ["case", /\bcase\b/],
  ["strap", /\bstrap\b|\bbracelet\b|\bband\b/],
];

const CATEGORY: Record<SlotKey, string> = {
  movement: "movement", case: "case", dial: "dial", hands: "hands", bezelInsert: "bezel_insert",
  bezel: "bezel", crystal: "crystal", chapterRing: "chapter_ring", crown: "crown", strap: "strap",
};

const PLATFORM_SUFFIX: Partial<Record<SlotKey, string>> = {
  case: "case", bezelInsert: "insert", crystal: "crystal", chapterRing: "chapter-ring", crown: "crown", bezel: "bezel", strap: "bracelet",
};

const CALIBER = /(?<![\w.])(NH(?:3[4568]|7[012])|VK6[34])A?(?![\w])/gi;

// A number the listing ties to one attribute, with a range that rejects a
// model-code fragment or another part's size.
const NUMBERS: { field: string; aspects: RegExp; title: RegExp; min: number; max: number }[] = [
  { field: "caseDiameterMm", aspects: /^case (size|diameter)$/i, title: /(?<![\w.])(\d{2}(?:\.\d)?)\s*mm\s+(?:watch\s+)?case\b|\bcase\s+(?:size|diameter)?:?\s*(\d{2}(?:\.\d)?)\s*mm\b/i, min: 30, max: 50 },
  { field: "diameterMm", aspects: /^dial (size|diameter)$/i, title: /(?<![\w.])(\d{2}(?:\.\d)?)\s*mm\s+dial\b|\bdial\s+(?:size|diameter):?\s*(\d{2}(?:\.\d)?)\s*mm\b/i, min: 20, max: 40 },
  { field: "outerDiameterMm", aspects: /^(insert|bezel) (size|diameter)$/i, title: /(?<![\w.])(\d{2}(?:\.\d)?)\s*mm\s+(?:\w+\s+)?(?:bezel\s+)?insert\b/i, min: 28, max: 45 },
  { field: "lugWidthMm", aspects: /^(lug|band|strap) width$/i, title: /\blug\s+width:?\s*(\d{2})\s*mm\b|(?<![\w.])(\d{2})\s*mm\s+(?:[a-z]+\s+){0,2}(?:lugs?|strap|band|bracelet)\b/i, min: 10, max: 30 },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ");
}

export function extract(listing: ListingText, knownFamilies: ReadonlySet<string>, slotOverride?: SlotKey): Draft {
  const title = listing.title.trim().slice(0, 200);
  const t = norm(title);
  const aspects = Object.entries(listing.aspects ?? {});
  const from: Record<string, string> = {};
  const attributes: Record<string, unknown> = {};

  const slots = SLOT_WORDS.filter(([, re]) => re.test(t)).map(([s]) => s);
  // "bezel insert" also contains "bezel"; count the pair once.
  const distinct = slots.filter((s) => !(s === "bezel" && slots.includes("bezelInsert")));
  const slot = slotOverride ?? (distinct.length === 1 ? distinct[0]! : null);
  if (slot && !slotOverride) from.slot = `title: '${distinct[0]}'`;

  for (const n of NUMBERS) {
    const aspect = aspects.find(([k]) => n.aspects.test(k.trim()));
    let raw: string | undefined;
    if (aspect) {
      raw = /(?<![\w.])(\d{2}(?:\.\d)?)(?![\d])/.exec(aspect[1])?.[1];
      if (raw) from[n.field] = `item specific: ${aspect[0]}`;
    }
    if (!raw) {
      const m = n.title.exec(title);
      raw = m?.slice(1).find(Boolean);
      if (raw) from[n.field] = `title: '${m![0].trim()}'`;
    }
    const v = raw ? Number(raw) : NaN;
    if (v >= n.min && v <= n.max) attributes[n.field] = v;
    else delete from[n.field];
  }

  const calibers = [...`${title} ${aspects.map(([, v]) => v).join(" ")}`.matchAll(CALIBER)].map((m) => m[1]!.toUpperCase());
  const movementsListed = [...new Set(calibers)];
  if (movementsListed.length === 1) {
    attributes.caliber = movementsListed[0];
    from.caliber = "title or item specifics";
  }

  const crown = parseMovementCrown(title) ?? /(?<![\w.])(\d(?:\.\d)?)\s*(?:o'?clock|h)\s+crown\b|\bcrown\s+(?:at|@)\s*(\d(?:\.\d)?)\b/i.exec(title)?.slice(1).find(Boolean) ?? null;
  if (crown) {
    attributes.crownPosition = crown;
    from.crownPosition = "title";
  }

  const complication = parseDialComplication(title);
  if (complication.hasDateWindow !== null) {
    attributes.hasDateWindow = attributes.hasDate = complication.hasDateWindow;
    attributes.hasDayWindow = attributes.hasDay = complication.hasDayWindow;
    from.hasDateWindow = from.hasDayWindow = from.hasDate = from.hasDay = "title";
  }
  if (/\bfeetless\b|\bno (?:dial )?feet\b|\bwithout feet\b/.test(t)) attributes.hasFeet = false;
  else if (/\bwith (?:dial )?feet\b|\bfeet at\b/.test(t)) attributes.hasFeet = true;
  if ("hasFeet" in attributes) from.hasFeet = "title";

  const profile = parseProfile(title);
  if (profile) (attributes.profile = profile), (from.profile = "title");
  const material = parseMaterial(title);
  if (material) (attributes.material = material), (from.material = "title");

  const { family, outOfScope } = familyFor(slot, t, attributes, movementsListed, knownFamilies);

  // Keep only the slot's own fields; a case listing's "28.5mm dial" is not
  // the case's attribute.
  const keep = slot ? KEY_FIELDS[slot] : [];
  const own: Record<string, unknown> = {};
  for (const k of keep) own[k] = attributes[k] ?? null;
  const unmatched = [...(slot ? [] : ["slot"]), ...keep.filter((k) => own[k] === null)];

  return { slot, family, name: title, attributes: own, found: attributes, movementsListed, from, unmatched, outOfScope };
}

// Family from the case line or caliber the listing names, only when the
// catalog has that family. Two case lines named ("fits SKX007/SKX013") is a
// claim we can't pick between: unknown. "unknown" has no platform suffix, so
// every case-shape rule reads it as "can't confirm", never as a mismatch.
export function familyFor(
  slot: SlotKey | null,
  text: string,
  attributes: Record<string, unknown>,
  movementsListed: string[],
  knownFamilies: ReadonlySet<string>,
): { family: string; outOfScope: string | null } {
  if (!slot) return { family: "unknown", outOfScope: null };
  const outOfScope = checkOutOfScope(text, CATEGORY[slot]);
  if (outOfScope) return { family: "unknown", outOfScope };
  const known = (f: string) => ({ family: knownFamilies.has(f) ? f : "unknown", outOfScope: null });

  const suffix = PLATFORM_SUFFIX[slot];
  if (suffix) {
    const prefixes = new Set(text.split(/[\s,/|&+()]+/).map(resolveCaseModelPrefix).filter(Boolean));
    if (prefixes.size === 1) return known(`${[...prefixes][0]}-${suffix}`);
    if (slot === "strap" && prefixes.size === 0 && /\bstrap\b/.test(text)) return known("generic-strap");
    return { family: "unknown", outOfScope: null };
  }
  const nh = movementsListed.length > 0 && movementsListed.every((c) => c.startsWith("NH"));
  const vk = movementsListed.length > 0 && movementsListed.every((c) => c.startsWith("VK"));
  if (slot === "movement") return known(nh ? "nh3x-movement" : vk ? "vk6x-movement" : "unknown");
  if (slot === "dial") return known(nh ? (attributes.hasFeet === false ? "nh3x-dial-feetless" : "nh3x-dial-standard") : vk ? "vk6x-dial" : "unknown");
  if (slot === "hands") return known(nh ? "nh3x-hands-standard" : vk ? "vk6x-hands" : "unknown");
  return { family: "unknown", outOfScope: null };
}

export function categoryOf(slot: SlotKey): string {
  return CATEGORY[slot];
}
