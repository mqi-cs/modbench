// Model and brand names that must not appear in a page title, slug,
// heading, or meta description.
//
// specs/06-phase-5-sharing.md: "Describe styles generically. Do not use
// trademarked model or brand names as page titles, slugs, headings, or
// meta descriptions... This is both a legal caution and better writing."
//
// The list is not a claim about who owns what, and it is not legal
// advice. It is the vocabulary a grep can check, so that a generated
// title cannot quietly pick one up from a vendor's listing name -- which
// is exactly where the risk lives, since several vendors put model
// references straight into their product titles and those names flow into
// lib/build-name.ts.
//
// Part names in a parts list are out of scope: you cannot order a part
// without the name the vendor gave it. The restriction is on the words
// this site chooses for its own headings.
export const RESERVED_MODEL_TERMS = [
  "rolex", "omega", "tudor", "submariner", "sub", "explorer", "daytona", "datejust",
  "gmt-master", "gmt master", "yacht-master", "yacht master", "sea-dweller", "sea dweller",
  "milgauss", "oyster", "mercedes", "pepsi", "batman", "hulk", "kermit", "coke",
  "black bay", "pelagos", "speedmaster", "seamaster", "planet ocean", "railmaster",
  "nautilus", "aquanaut", "royal oak", "fifty fathoms", "fathoms", "luminor", "radiomir",
  "flieger", "marinemaster", "turtle", "samurai", "monster", "sumo", "willard",
  "captain willard", "alpinist", "spork", "tuna", "shogun", "cocktail time",
  "snowflake", "milspec", "divemaster", "worldtimer", "vantage", "b. wayne",
];

/**
 * Terms found in a piece of user-facing copy.
 *
 * Word-boundary matched so "sub" does not fire on "submersible" or
 * "subdial", and lowercased so casing cannot smuggle one through.
 */
export function findReservedTerms(text: string): string[] {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return RESERVED_MODEL_TERMS.filter((term) => haystack.includes(` ${term.replace(/[^a-z0-9]+/g, " ")} `));
}
