// Three hand-curated starting points, per
// specs/04-phase-3-configurator.md: "An empty six-slot grid is
// intimidating for the audience you picked."
//
// Parts are referenced by NAME, not id. Part ids are nanoids generated at
// ingest, so they change whenever the database is rebuilt from the feed
// files; names are the stable identifier across rebuilds. Resolved to ids
// once, server-side, at page load.
import type { SlotKey } from "../../lib/compat";

export interface StarterBuild {
  id: string;
  name: string;
  blurb: string;
  partNames: Partial<Record<SlotKey, string>>;
}

export const STARTER_BUILDS: StarterBuild[] = [
  {
    id: "classic-dive",
    name: "Classic diver",
    blurb: "The build most people start with. A 42.5mm SKX007 case, a steel count-up insert, and the NH35 that replaced the old 7S26.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date (White)",
      case: "NMK960 Sumo SKX007/SRPD Case: Steel Finish",
      dial: "Watch Dial: Spork Green",
      hands: "Watch Hands: Syringe Silver",
      bezelInsert: "SKX007/SRPD Steel Bezel Insert: Nautical Steel",
    },
  },
  {
    id: "dress-38",
    name: "Small dress build",
    blurb: "A 38mm SKX013 case with an enamel dial and Breguet hands. Wears much smaller than the diver — worth trying if 42mm is too much watch.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date (White)",
      case: "NMK912 Field Watch Case Bundle : Sandblasted Finish",
      dial: "Vintage Enamel Biege Dial (Date)",
      hands: "1908 Sword Breguet Hands - Polished Silver",
      bezelInsert: "SKX013 Ceramic Bezel Insert (Slope) - Submariner Green",
    },
  },
  {
    id: "field",
    name: "Field watch",
    blurb: "Arabic numerals, lumed insert, matte case. Spans three vendors, so it's a good one for seeing what shipping consolidation does to the total.",
    partNames: {
      movement: "Seiko (TMI) NH35 Automatic Movement - Date (White)",
      case: "RC1331 SKX007 Field Case - Black",
      dial: "D0590 Arabic Dial - Sunburst Green",
      hands: "Hands - Sumo",
      bezelInsert: "CI0004 SKX007/SRPD Luminous Sub Black Ceramic Bezel Insert",
    },
  },
];
