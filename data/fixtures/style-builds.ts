// Ten curated builds, one per recognisable look.
// specs/06-phase-5-sharing.md: "Ten hand-made pages, each a curated build
// for a recognisable look."
//
// TRADEMARK DISCIPLINE
//
// Titles, slugs, headings and descriptions here are written generically,
// per the spec's instruction not to use trademarked model or brand names
// as page titles, slugs, headings or meta descriptions -- "white textured
// dial with a snowflake-style hand set", not the brand's model name.
//
// Part NAMES are a different matter: those are the vendors' own listing
// titles, and several contain model references. They appear only in the
// parts list, where they are needed to order the part, and never in a
// title, heading, slug or meta description. lib/build-name.ts scrubs the
// same vocabulary out of generated build titles, and a test greps every
// rendered page's metadata for the list.
//
// Parts are referenced by NAME, not id, for the same reason the starter
// builds are: nanoid ids are regenerated whenever the catalog is rebuilt.

import type { SlotKey } from "../../lib/compat";

export interface StyleBuild {
  slug: string;
  title: string;
  /** One-sentence meta description. Generic vocabulary only. */
  summary: string;
  /** A paragraph on what actually defines the look. */
  description: string;
  partNames: Partial<Record<SlotKey, string>>;
}

export const STYLE_BUILDS: StyleBuild[] = [
  {
    slug: "vintage-diver",
    title: "Vintage-style diver",
    summary: "Warm off-white lume, a faded insert and a sword hand set — a diver built to look like it has been worn for thirty years.",
    description:
      "The vintage look is mostly about colour temperature. Modern lume is bright white or green; aged lume goes cream, and matching the dial's lume tone to the hands and the insert pip is what makes the whole thing read as one watch rather than three parts. A domed or sloped insert helps, because the flat ceramic inserts on modern divers are visibly a modern part. Nothing here is aged artificially — these are parts made in these colours.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date (White)",
      case: "NMK960 Sumo SKX007/SRPD Case: Brushed Black Finish",
      dial: "Vintage Enamel Biege Dial (GMT)",
      hands: "Watch Hands: Milspec Patina Lume Finish",
      bezelInsert: "CI0975 SKX007/SRPD White Flat Ceramic Bezel  Insert - Vintage Sub",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      crystal: "NMK314 SKX/SRPD Slim Flat Sapphire Crystal for Flat Inserts",
    },
  },
  {
    slug: "field-watch",
    title: "Field watch",
    summary: "Arabic numerals, a plain steel insert and high-contrast hands — legibility first, with nothing on the dial that isn't telling you the time.",
    description:
      "A field watch is defined by what it leaves out. Printed Arabic numerals rather than applied markers, a hand set with enough contrast to read at a glance, and a bezel that does not compete with the dial. The insert here is a plain count-up rather than a dive scale, which keeps the eye on the numerals. It is the easiest style to get right and the hardest to make interesting.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date @ 6H (White)",
      case: "NMK960 Sumo SKX007/SRPD Case: Steel Finish",
      dial: "Watch Dial: 1016 Explorer",
      hands: "Watch Hands: VK Flieger Sword Black",
      bezelInsert: "CI1576 SKX007/SRPD Count Down Timer Flat Ceramic Bezel Insert - Black",
      chapterRing: "SKX007/SRPD Angled Chapter Ring: Sandblasted",
      crystal: "NMK314 SKX/SRPD Slim Flat Sapphire Crystal for Flat Inserts",
    },
  },
  {
    slug: "white-dial-dress",
    title: "White-dial dress build",
    summary: "A clean white dial, dauphine hands and a silver insert — the least sporty thing you can build on a diver case.",
    description:
      "White dials are unforgiving: every printed line and every applied marker sits in full view, so the dial has to be well finished and the hands have to match its tone exactly. Dauphine hands and a polished or silver insert push the build away from tool-watch territory without pretending the case is something it isn't. Expect it to look better in person than in photographs, which is the usual problem with white dials.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date @ 6H (White)",
      case: "NMK930 Nautical w Crown Guard SKX/SPRD Watch Case: Brushed Finish",
      dial: "Watch Dial: 556 White",
      hands: "Watch Hands: Pitched Dauphine + Red Seconds Hand",
      bezelInsert: "SKX007 Ceramic Bezel Insert (Slope) - Yacht Master Silver",
      chapterRing: "SKX007/SRPD Angled Chapter Ring: Brushed",
      crystal: "NMK315 SKX/SRPD Flat Sapphire Crystal for Sloped Inserts w Cyclops",
    },
  },
  {
    slug: "gmt-traveller",
    title: "Two-tone GMT traveller",
    summary: "A 24-hour dial, an arrow-tipped hand and a two-colour 24-hour insert, for reading a second time zone at a glance.",
    description:
      "The two-colour insert is not decoration: the light half is daytime in the second zone and the dark half is night, which is the whole reason the colour split exists. That only works if the insert's 24-hour scale matches the dial's, and if the extra hand is distinguishable from the hour hand — hence the arrow tip. Check the movement: a true GMT calibre drives the fourth hand independently, and this build's does not, so the extra hand reads a fixed offset rather than a settable one.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date @ 6H (Black)",
      case: "NMK930 Nautical w Crown Guard SKX/SPRD Watch Case: PVD Black Finish",
      dial: "Watch Dial: Worldtimer GMT Orange",
      hands: "Watch Hands: VK Broad Arrow Steel",
      bezelInsert: "SKX007 Ceramic Bezel Insert (Slope) - Pepsi Dual Time *SWISS MADE*",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Black Finish w Gold Markers",
      crystal: "NMK315 SKX/SRPD Flat Sapphire Crystal for Sloped Inserts w Cyclops",
    },
  },
  {
    slug: "black-dive-classic",
    title: "Black dive classic",
    summary: "Black dial, black dive insert, three-pointed hands — the shape most people picture when they hear the word diver.",
    description:
      "Everything on this build is doing the same job: maximum contrast between the markers and the ground, and a bezel that only counts up. The reason it is copied so widely is that it works, and the reason it is hard to make your own is the same. The variables worth thinking about are the lume colour and whether the insert is ceramic or aluminium — ceramic stays sharp, aluminium wears, and which you prefer is a taste question rather than a quality one.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date (White)",
      case: "NMK929 Nautical SKX/SPRD Watch Case: Brushed Finish",
      dial: "Watch Dial: Vintage N1 Black",
      hands: "Watch Hands: Mercedes Black Lume w Silver Finish",
      bezelInsert: "SKX007 Ceramic Bezel Insert (Slope) - Yacht Master Black",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      crystal: "NMK315 SKX/SRPD Flat Sapphire Crystal for Sloped Inserts w Cyclops",
    },
  },
  {
    slug: "three-six-nine",
    title: "Three-six-nine dial",
    summary: "Numerals at three, six and nine with batons elsewhere, on a smooth steel bezel — a three-point layout that reads at a glance.",
    description:
      "The three-six-nine layout is a legibility trick: three anchor points around the dial let you read the position of the hands without reading the numbers at all. Pairing it with a plain smooth or brushed insert rather than a dive scale is what keeps it from looking like a diver wearing the wrong dial. A sandblasted case suits it, because the whole style is about matte surfaces and no glare. Note the crystal: a flat sapphire will not seat against a sloped insert, so the two have to be chosen together.",
    partNames: {
      movement: "Seiko (TMI) NH36 Automatic Movement - Day Date @ 4H Crown (Black)",
      case: "NMK962 SKX007/SRPD N50 Tool Diver Case Bundle: Sandblasted Finish",
      dial: "Watch Dial: 1016 Explorer",
      hands: "Watch Hands: Mercedes Skeleton Finish",
      // Flat insert with a flat crystal. The stainless inserts that suit
      // this style better have no stated profile, and pairing one with a
      // crystal then draws a "can't confirm these seat together" warning
      // -- fine in the configurator, but a curated page should be built
      // from parts whose fitment is actually confirmed.
      bezelInsert: "CI1390 SKX007/SRPD U1 Style Flat Ceramic Bezel Insert - White",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      crystal: "NMK310 - SKX/SRPD Flat Sapphire Crystal for Flat Inserts",
    },
  },
  {
    slug: "warm-tone-diver",
    title: "Warm-tone diver",
    summary: "Beige enamel, gilt-toned hands and a brown insert — the warm end of the palette, without a bronze case.",
    description:
      "A genuine bronze case patinates unevenly and stains cuffs, which is a real commitment. This gets most of the warmth from the dial and hands instead: a beige or enamel dial, gold or steel-gold hands, and a brown or khaki insert to carry the tone round the outside. The case stays steel, so the watch still looks the same in a year. If you want the real thing, the constraint to check is whether your case supplier offers a bronze bezel to match, because a bronze case with a steel bezel ages into two different watches.",
    partNames: {
      movement: "Seiko (TMI) NH36 Automatic Movement - Day Date @ 4H Crown (Black)",
      case: "NMK962 SKX007/SRPD N50 Tool Diver Case Bundle: Matte Black Finish",
      dial: "Watch Dial: Perpetual Enamel Beige",
      hands: "Watch Hands: FPJ Gold",
      bezelInsert: "CI1189 SKX007/SRPD Slope Ceramic Bezel Insert - Dual Time Black/Brown",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      crystal: "NMK315 SKX/SRPD Flat Sapphire Crystal for Sloped Inserts w Cyclops",
    },
  },
  {
    slug: "skin-diver",
    title: "Skin diver",
    summary: "A grey dial, pencil hands and a plain black insert — the stripped-back mid-century diver, before dive watches got large.",
    description:
      "Skin divers came before saturation diving made watches thick, so the look is defined by restraint: no crown guards if you can avoid them, a plain insert, and a hand set with no flourish. Grey and slate dials suit it better than black, because the softer contrast reads as older. The one thing worth spending on is the crystal — a slim flat sapphire keeps the profile low, which is most of the effect.",
    partNames: {
      movement: "Seiko (TMI) NH36 Automatic Movement - Day Date @ 4H Crown (Black)",
      case: "NMK957 Fathoms SKX007/SRPD Dive Case Bundle: Brushed Black Finish",
      dial: "Watch Dial: Spork Grey",
      hands: "Watch Hands: Pencil Blue Finish",
      bezelInsert: "SKX007 Ceramic Bezel Insert (Slope) - Yacht Master Black",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      // Sloped insert, so the crystal has to be the sloped-profile one --
      // the slim flat crystal blocks against it, which the engine catches.
      crystal: "NMK315 SKX/SRPD Flat Sapphire Crystal for Sloped Inserts w Cyclops",
    },
  },
  {
    slug: "half-numeral-dial",
    title: "Half-numeral dial",
    summary: "Roman numerals on one half of the dial and batons on the other — a divided layout originally used to make lume easier to read.",
    description:
      "The split-numeral dial exists because early luminous compounds were applied by hand, and mixing numeral shapes with plain markers gave more distinct silhouettes to read in the dark. It is now purely a style, and a divisive one: it either looks like a deliberate quotation or like the dial printer ran out of numerals. Syringe or sword hands suit it, because anything ornate fights the dial.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date @ 6H (White)",
      case: "NMK957 Fathoms SKX007/SRPD Dive Case Bundle: Steel Finish",
      dial: "Watch Dial: California Ghost",
      hands: "Watch Hands: Lumed Syringe Skeleton Finish",
      bezelInsert: "SKX007 Ceramic Bezel Insert (Slope) - Yacht Master Black",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      crystal: "NMK315 SKX/SRPD Flat Sapphire Crystal for Sloped Inserts w Cyclops",
    },
  },
  {
    slug: "matte-green-utility",
    title: "Matte green utility",
    summary: "A flat green dial, no branding, and a lumed insert — the unbranded military look, in the one colour that isn't black.",
    description:
      "Sterile dials carry no maker's name, which is the point: issued watches were marked with a contract number, not a brand. Green is the usual departure from black, and it works because a matte green dial changes tone under different light in a way that flat black does not. Keep the hand set plain, and prefer a lumed insert over a polished one — the whole style leans on being readable rather than being seen.",
    partNames: {
      movement: "Seiko (TMI) NH36 Automatic Movement - Day Date @ 4H Crown (Black)",
      case: "NMK957 Fathoms SKX007/SRPD Dive Case Bundle: Steel Finish",
      dial: "Watch Dial: Spork Green",
      hands: "Watch Hands: VK Flieger Sword Black",
      bezelInsert: "GI002 SKX007/SRPD Flat Glass Bezel Insert - Lumed GMT Black/Green",
      chapterRing: "SKX007/SRPD Chapter Ring: Kanji Style Blue Finish w Silver Markers",
      crystal: "NMK314 SKX/SRPD Slim Flat Sapphire Crystal for Flat Inserts",
    },
  },
];
