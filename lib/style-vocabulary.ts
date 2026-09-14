// The controlled style vocabulary.
//
// specs/07-phase-6-nl-image-input.md: "Constrain the model to the existing
// `styleTags` vocabulary. Pass the full list in the prompt. Tags outside
// it are dropped, not invented."
//
// There was no existing vocabulary. `styleTags` is a column on every
// dial, hand set and bezel insert, and it is an empty array on all 3,451
// approved parts -- no tagging pass ever filled it, because nothing until
// now read it. So the list below is the vocabulary, and
// scripts/backfill-style-tags.ts is what puts it on the parts.
//
// Two rules shaped it:
//
// 1. Every tag has to be assignable from evidence in the catalog. A tag
//    nothing can carry is worse than no tag: it makes a query silently
//    return nothing, and the user cannot tell that from "no matches".
//    Each entry names the words that assign it.
// 2. No trademarked model names, for the same reason as Phase 5 -- these
//    tags are user-facing, they appear as editable chips, and they would
//    end up in page copy. Vendors' listing names are full of them, so the
//    mapping deliberately translates: a listing saying "Submariner style"
//    contributes `dive-bezel` and `baton-indices`, not the model name.

export type TagCategory = "colour" | "finish" | "indices" | "hands" | "bezel" | "character";

export interface StyleTag {
  tag: string;
  category: TagCategory;
  label: string;
  /** Words in a vendor listing name that evidence this tag. */
  evidence: RegExp;
  /** Which part categories may carry it. */
  slots: ("dial" | "hands" | "bezel_insert" | "strap" | "case")[];
}

const COLOUR_WORD = "black|white|blue|green|red|orange|yellow|grey|gray|gold|silver|brown|bronze|cream|beige|biege|pink|purple|navy|slate";

/**
 * Two named colours separated by a slash, dash or "and".
 *
 * Deliberately not "anything slash anything": that matched the SKX007/SRPD
 * fitment note present in nearly every insert listing, and tagged 364 of
 * 681 inserts two-tone when most are a single colour. A tag that wrong is
 * worse than a missing one, because a user filtering on it gets a page of
 * results that look like answers.
 */
const TWO_COLOUR = new RegExp(`\\b(?:${COLOUR_WORD})\\b\\s*(?:/|-|\\band\\b)\\s*\\b(?:${COLOUR_WORD})\\b|\\bpepsi\\b|\\bbatman\\b|\\bcoke\\b|\\broot\\s?beer\\b`, "i");

export const STYLE_TAGS: StyleTag[] = [
  // --- Colour. The single most common thing anyone asks for.
  { tag: "black", category: "colour", label: "black", evidence: /\bblack\b|\bonyx\b|\bnoir\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "white", category: "colour", label: "white", evidence: /\bwhite\b|\bsnow\b|\barctic\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "cream", category: "colour", label: "cream or ivory", evidence: /\bcream\b|\bivory\b|\bbiege\b|\bbeige\b|\becru\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "blue", category: "colour", label: "blue", evidence: /\bblue\b|\bnavy\b|\baegean\b|\bcobalt\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "green", category: "colour", label: "green", evidence: /\bgreen\b|\bolive\b|\bemerald\b|\bjade\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "grey", category: "colour", label: "grey", evidence: /\bgrey\b|\bgray\b|\bslate\b|\bgun\s?metal\b|\bcharcoal\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "brown", category: "colour", label: "brown or bronze tone", evidence: /\bbrown\b|\bbronze\b|\bcopper\b|\bumber\b|\bchocolate\b|\btropical\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "red", category: "colour", label: "red or burgundy", evidence: /\bred\b|\bburgundy\b|\bmaroon\b|\bcherry\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "orange", category: "colour", label: "orange", evidence: /\borange\b|\bamber\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "yellow", category: "colour", label: "yellow", evidence: /\byellow\b|\bmustard\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  // Before gold-tone deliberately: "Rose Gold Finish" contains "gold",
  // so the broader tag would swallow it and 70-odd parts would draw yellow.
  { tag: "rose-gold", category: "colour", label: "rose gold tone", evidence: /\brose\s?gold\b|\bsalmon\s?gold\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "gold-tone", category: "colour", label: "gold tone", evidence: /\bgold\b|\bgilt\b|\bbrass\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },
  { tag: "silver-tone", category: "colour", label: "silver or steel tone", evidence: /\bsilver\b|\bsteel\b|\bstainless\b|\brhodium\b/i, slots: ["dial", "hands", "bezel_insert", "strap", "case"] },

  // --- Dial finish.
  { tag: "sunburst", category: "finish", label: "sunburst", evidence: /\bsunburst\b|\bsun\s?ray\b/i, slots: ["dial"] },
  { tag: "matte", category: "finish", label: "matte", evidence: /\bmatte\b|\bmatt\b|\bsandblast/i, slots: ["dial", "bezel_insert", "case"] },
  { tag: "textured", category: "finish", label: "textured", evidence: /\btextur|\bwaffle\b|\bgrain|\bhammered\b|\blinen\b|\bwave\b/i, slots: ["dial"] },
  { tag: "enamel", category: "finish", label: "enamel or lacquer", evidence: /\benamel\b|\blacquer\b|\bglossy?\b/i, slots: ["dial"] },
  { tag: "mother-of-pearl", category: "finish", label: "mother of pearl", evidence: /\bmother\s?(of\s?)?pearl\b|\bMOP\b/i, slots: ["dial"] },
  { tag: "aged-lume", category: "finish", label: "aged or patina lume", evidence: /\bpatina\b|\baged\b|\bfaded\b|\bvintage\b|\bghost\b/i, slots: ["dial", "hands", "bezel_insert"] },
  { tag: "polished", category: "finish", label: "polished", evidence: /\bpolish/i, slots: ["hands", "bezel_insert", "case"] },
  { tag: "brushed", category: "finish", label: "brushed", evidence: /\bbrushed\b/i, slots: ["hands", "bezel_insert", "case"] },

  // --- Dial index style.
  { tag: "arabic-numerals", category: "indices", label: "Arabic numerals", evidence: /\barabic\b|\bnumeral/i, slots: ["dial"] },
  { tag: "roman-numerals", category: "indices", label: "Roman numerals", evidence: /\broman\b/i, slots: ["dial"] },
  { tag: "no-branding", category: "indices", label: "sterile, no branding", evidence: /\bsterile\b|\bno\s?logo\b|\bunbranded\b|\bblank\b/i, slots: ["dial"] },
  { tag: "half-numeral", category: "indices", label: "half-numeral layout", evidence: /\bcalifornia\b/i, slots: ["dial"] },

  // --- Hand shapes. Named for the shape, not the watch that made it famous.
  { tag: "sword-hands", category: "hands", label: "sword hands", evidence: /\bsword\b/i, slots: ["hands"] },
  { tag: "dauphine-hands", category: "hands", label: "dauphine hands", evidence: /\bdauphine\b/i, slots: ["hands"] },
  { tag: "syringe-hands", category: "hands", label: "syringe hands", evidence: /\bsyringe\b/i, slots: ["hands"] },
  { tag: "pencil-hands", category: "hands", label: "pencil hands", evidence: /\bpencil\b/i, slots: ["hands"] },
  { tag: "arrow-hands", category: "hands", label: "arrow hands", evidence: /\barrow\b/i, slots: ["hands"] },
  { tag: "faceted-hands", category: "hands", label: "faceted hands", evidence: /\bsnowflake\b|\bfacet/i, slots: ["hands"] },
  { tag: "three-lobe-hands", category: "hands", label: "three-lobe hands", evidence: /\bmercedes\b|\bmerc\b/i, slots: ["hands"] },
  { tag: "skeleton-hands", category: "hands", label: "skeleton hands", evidence: /\bskeleton\b/i, slots: ["hands"] },
  { tag: "lumed", category: "hands", label: "strongly lumed", evidence: /\blume(d)?\b|\bluminous\b|\bbgw\b|\bsuper\s?luminova\b/i, slots: ["dial", "hands", "bezel_insert"] },

  // --- Bezel insert character.
  { tag: "dive-bezel", category: "bezel", label: "count-up dive scale", evidence: /\bdive\b|\bcount\s?(up|down)\b|\bsub\b|\bdiver\b|\btimer\b/i, slots: ["bezel_insert"] },
  { tag: "gmt-bezel", category: "bezel", label: "24-hour GMT scale", evidence: /\bgmt\b|\bdual\s?time\b|\b24\s?h(our)?\b|\bworldtime/i, slots: ["bezel_insert"] },
  // Two NAMED COLOURS either side of a slash, not any slash. "X/Y"
  // matched "SKX007/SRPD" -- which is in the name of essentially every
  // insert -- and tagged 364 of 681 two-tone, most of them single colour.
  { tag: "two-tone-bezel", category: "bezel", label: "two-colour bezel", evidence: TWO_COLOUR, slots: ["bezel_insert"] },
  { tag: "plain-bezel", category: "bezel", label: "plain, no scale", evidence: /\bsmooth\b|\bplain\b|\bfluted\b|\byacht\b/i, slots: ["bezel_insert"] },
  { tag: "ceramic", category: "bezel", label: "ceramic", evidence: /\bceramic\b/i, slots: ["bezel_insert"] },
  { tag: "aluminium", category: "bezel", label: "aluminium", evidence: /\baluminium\b|\baluminum\b/i, slots: ["bezel_insert"] },

  // --- Overall character. Broad, and the words people actually use.
  { tag: "vintage", category: "character", label: "vintage-looking", evidence: /\bvintage\b|\bretro\b|\bheritage\b|\bpatina\b|\bfaded\b|\baged\b/i, slots: ["dial", "hands", "bezel_insert"] },
  { tag: "dressy", category: "character", label: "dressy", evidence: /\bdress\b|\bdauphine\b|\broman\b|\benamel\b|\bmother\s?(of\s?)?pearl\b/i, slots: ["dial", "hands"] },
  { tag: "tool-watch", category: "character", label: "tool watch", evidence: /\bdiver?\b|\bfield\b|\bpilot\b|\bmilitary\b|\bmilspec\b|\bsterile\b|\btool\b/i, slots: ["dial", "hands", "bezel_insert"] },
  { tag: "pilot", category: "character", label: "pilot style", evidence: /\bpilot\b|\bflieger\b|\baviator\b/i, slots: ["dial", "hands"] },
];

export const TAG_NAMES: string[] = STYLE_TAGS.map((t) => t.tag);
const TAG_SET = new Set(TAG_NAMES);

/**
 * Keeps only tags in the controlled list.
 *
 * This is the single chokepoint the spec's "tags outside it are dropped,
 * not invented" guarantee rests on, so it is deliberately dumb: an exact
 * membership test, no fuzzy matching, no nearest-neighbour rescue. A tag
 * the model made up is dropped, and the free text it came from is shown
 * back to the user instead.
 */
export function validateTags(candidates: unknown): string[] {
  if (!Array.isArray(candidates)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalised = candidate.trim().toLowerCase();
    if (!TAG_SET.has(normalised) || seen.has(normalised)) continue;
    seen.add(normalised);
    out.push(normalised);
  }
  return out;
}

export function tagLabel(tag: string): string {
  return STYLE_TAGS.find((t) => t.tag === tag)?.label ?? tag;
}

/** Tags a part's listing name evidences, for the slots that may carry them. */
export function tagsFromName(name: string, category: string): string[] {
  return STYLE_TAGS.filter((t) => t.slots.includes(category as never) && t.evidence.test(name)).map((t) => t.tag);
}
