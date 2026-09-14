// Silhouettes the preview can draw, and how a part is matched to one.
//
// Separate from lib/style-vocabulary.ts on purpose. That vocabulary was
// built for SEARCH -- it answers "what does this look like" in the words a
// shopper types (black, lumed, dressy) -- and the rollout audit found it
// cannot answer "what shape is this": 55% of hands carried only colour
// tags, and crowns and chapter rings carried none at all.
//
// So this is a second, narrower vocabulary about FORM only, mined from
// the vendors' own listing names and descriptions the same evidence-based
// way as Phase 2. Where the evidence is silent a part takes a documented
// fallback, and scripts/backfill-shapes.ts logs every one so the set is
// auditable if the silhouette classifier is ever built.
//
// A shape is a DISPLAY decision. Nothing here reaches lib/compat, and
// falling back to a default silhouette is explicitly not the same class of
// claim as asserting that two parts fit.

export type ShapeCategory = "hands" | "crown" | "chapter_ring" | "bezel_insert" | "strap";

export interface ShapeDef {
  id: string;
  category: ShapeCategory;
  label: string;
  /** Words in a vendor's name or description that evidence this shape. */
  evidence: RegExp;
}

export const SHAPES: ShapeDef[] = [
  // --- Hand silhouettes. Ordered most specific first; the first match wins.
  { id: "hand-three-lobe", category: "hands", label: "three-lobe", evidence: /\bmercedes\b|\bmerc\b/i },
  { id: "hand-faceted", category: "hands", label: "faceted", evidence: /\bsnowflake\b|\bfacet/i },
  { id: "hand-dauphine", category: "hands", label: "dauphine", evidence: /\bdauphine\b/i },
  { id: "hand-syringe", category: "hands", label: "syringe", evidence: /\bsyringe\b/i },
  { id: "hand-arrow", category: "hands", label: "broad arrow", evidence: /\bbroad\s?arrow\b|\barrow\b/i },
  { id: "hand-cathedral", category: "hands", label: "cathedral", evidence: /\bcathedral\b/i },
  { id: "hand-pencil", category: "hands", label: "pencil", evidence: /\bpencil\b/i },
  // Flieger and plongeur are sword-family silhouettes under other names.
  { id: "hand-sword", category: "hands", label: "sword", evidence: /\bsword\b|\bdagger\b|\bflieger\b|\bplongeur\b|\blance\b/i },
  { id: "hand-baton", category: "hands", label: "baton", evidence: /\bbaton\b|\bstick\b|\bbar\s?hand/i },

  // --- Crown silhouettes.
  { id: "crown-onion", category: "crown", label: "onion", evidence: /\bonion\b/i },
  { id: "crown-bolt", category: "crown", label: "bolt", evidence: /\bbolt\b/i },
  { id: "crown-coin", category: "crown", label: "coin edge", evidence: /\bcoin\b|\bfluted\b|\bribbed\b/i },
  { id: "crown-knurled", category: "crown", label: "knurled", evidence: /\bknurl/i },
  { id: "crown-chunky", category: "crown", label: "chunky", evidence: /\bchunky\b|\bbig\b|\boversiz/i },
  { id: "crown-smooth", category: "crown", label: "smooth", evidence: /\bsmooth\b|\bflat\b|\bplain\b|\bpolished\b/i },

  // --- Chapter ring profiles. What varies is the wall, not the outline.
  // There is no separate "flat" shape: every listing mentioning "flat"
  // turned out to be describing the INSERT it suits ("flat chapter ring
  // for sloped inserts"), so a flat shape matched nothing and would have
  // shipped as dead art. The backfill's unused-shape warning caught it.
  { id: "ring-angled", category: "chapter_ring", label: "angled", evidence: /\bangled\b|\bslope|\bincline|\bbevel/i },
  { id: "ring-plain", category: "chapter_ring", label: "plain", evidence: /\bplain\b|\bsandbl|\bbrushed\b|\bpolished\b|\bsmooth\b/i },

  // --- Bezel insert scales. The annulus is the same; the printing differs.
  { id: "insert-gmt", category: "bezel_insert", label: "24-hour", evidence: /\bgmt\b|\bdual\s?time\b|\b24\s?h(our)?\b|\bworldtime|\bpepsi\b|\bbatman\b/i },
  { id: "insert-dive", category: "bezel_insert", label: "count-up dive", evidence: /\bdive\b|\bdiver\b|\bcount\s?(up|down)\b|\btimer\b|\bsub\b/i },
  { id: "insert-plain", category: "bezel_insert", label: "plain", evidence: /\bsmooth\b|\bplain\b|\bfluted\b|\byacht\b|\bno\s?scale\b/i },

  // --- Strap kinds. Only three, because only three LOOK different from
  // directly above: a bracelet fills the lug gap in steel with a link
  // seam, a NATO passes under the case as one continuous band across the
  // gap, and everything else is a band butting into each lug. Leather and
  // rubber are not separate shapes here -- at this angle they differ in
  // colour and stitching, both of which the band already carries.
  { id: "strap-nato", category: "strap", label: "pass-through", evidence: /\bnato\b|\bzulu\b|\bsingle\s?pass\b|\bseatbelt\b|\bperlon\b/i },
  // Jubilee and Oyster are split out because they differ where a bracelet
  // actually reads from above: a Jubilee is five lanes with narrow
  // polished centre links, an Oyster three broad brushed ones. Anything
  // else evidenced as a bracelet takes the generic three-lane drawing.
  { id: "strap-jubilee", category: "strap", label: "jubilee bracelet", evidence: /\bjubilee\b|\bbeads?\s?of\s?rice\b|\bpresident\b/i },
  { id: "strap-oyster", category: "strap", label: "oyster bracelet", evidence: /\boyster\b|\bsuper\s?-?\s?engineer\b|\bengineer\b/i },
  { id: "strap-bracelet", category: "strap", label: "bracelet", evidence: /\bbracelet\b|\bmilanese\b|\bmesh\b|\bnautilus\b/i },
  { id: "strap-band", category: "strap", label: "band", evidence: /\bleather\b|\brubber\b|\bfkm\b|\bsilicone\b|\bnylon\b|\bcanvas\b|\bsuede\b|\bcordovan\b|\btropic\b|\bwaffle\b|\bstrap\b/i },
];

/**
 * Shape used when the vendor's own words say nothing about form.
 *
 * Chosen as the most common evidenced shape in each category, so a part
 * with no signal looks like its most likely neighbour rather than like
 * something arbitrary. Every part that lands here is logged by the
 * backfill.
 */
export const SHAPE_FALLBACK: Record<ShapeCategory, string> = {
  hands: "hand-sword",
  crown: "crown-knurled",
  chapter_ring: "ring-plain",
  bezel_insert: "insert-dive",
  strap: "strap-band",
};

/**
 * Form tags the search vocabulary already carries, mapped to silhouettes.
 *
 * Those tags were mined from the same vendor text in Phase 6, so they are
 * evidence of exactly the same quality -- ignoring them would send parts
 * to a fallback that already have a known shape. Checked before the text
 * match, since a tag is a reviewed conclusion and the text is raw.
 *
 * `skeleton-hands` is deliberately absent: skeletonising is a treatment
 * applied to a silhouette, not a silhouette of its own.
 */
export const STYLE_TAG_TO_SHAPE: Record<string, string> = {
  "three-lobe-hands": "hand-three-lobe",
  "faceted-hands": "hand-faceted",
  "dauphine-hands": "hand-dauphine",
  "syringe-hands": "hand-syringe",
  "arrow-hands": "hand-arrow",
  "pencil-hands": "hand-pencil",
  "sword-hands": "hand-sword",
  "gmt-bezel": "insert-gmt",
  "dive-bezel": "insert-dive",
  "plain-bezel": "insert-plain",
};

/** Shape implied by a part's existing style tags, if any. */
export function shapeFromStyleTags(tags: readonly string[], category: ShapeCategory): string | null {
  for (const shape of shapesFor(category)) {
    for (const tag of tags) {
      if (STYLE_TAG_TO_SHAPE[tag] === shape.id) return shape.id;
    }
  }
  return null;
}

const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));

export function shapeById(id: string): ShapeDef | null {
  return BY_ID.get(id) ?? null;
}

export function shapesFor(category: ShapeCategory): ShapeDef[] {
  return SHAPES.filter((s) => s.category === category);
}

/**
 * First shape whose evidence appears in the text. Order in SHAPES is the
 * precedence: "Mercedes sword" is a three-lobe hand, not a sword one.
 */
export function matchShape(text: string, category: ShapeCategory): string | null {
  for (const shape of shapesFor(category)) {
    if (shape.evidence.test(text)) return shape.id;
  }
  return null;
}
