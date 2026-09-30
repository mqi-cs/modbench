import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { PRINTS, printColours, printKey } from "../prints";
import { INTEGRATED_RING_PRINT } from "../standins";

// Real listing names from the catalog, and the print each should get.
const CASES: [slot: "insert" | "ring", name: string, key: string][] = [
  ["insert", "SKX007/SRPD Ceramic Bezel Insert: Seiko style Blue", "insert-blue-white"],
  ["insert", "SKX013 Ceramic Bezel Insert: Seiko style Batman", "insert-black-blue-white"],
  ["insert", "Aluminium Bezel Insert: GMT style Red/Blue (Pepsi)", "insert-red-blue-white"],
  ["insert", "Ceramic Bezel Insert (Slope) - GMT 24H - Pepsi Blue/Red", "insert-red-blue-white"],
  ["insert", "Aluminium Bezel Insert (Slope) - GMT 24H - Root Beer Black/Brown", "insert-black-brown-white"],
  ["insert", "Ceramic Bezel Insert: Sub style Black/Gold", "insert-black-gold"],
  ["insert", "Aluminium Bezel Insert: BB style Green/White", "insert-green-white"],
  ["insert", "SKX007/SRPD Ceramic Bezel Insert: Seiko style Green/Black", "insert-green-black-white"],
  ["insert", "Steel Bezel Insert: Black Series Style Red", "insert-black-white"],
  ["insert", "Steel Bezel Insert: SMP style", "insert-silver-black"],
  ["insert", "SI0117 SKX013 Stainless Bezel Insert - Dual Time Red", "insert-red-white"],
  ["insert", "Ceramic Insert - SRP Turtle BAT.", "insert-black-blue-white"],
  ["insert", "Ceramic Insert - 007 Dual Time Umber", "insert-brown-white"],
  ["insert", "Ceramic Bezel Insert: DSSD style Stealth", "insert-black-grey"],
  ["insert", "Ceramic Bezel Insert (Slope) - Yacht Master Silver", "insert-silver-black"],
  ["insert", "Ceramic Bezel Insert: Vintage Fathoms", "insert-black-white"],
  ["ring", "SKX007/SRPD Chapter Ring: Brushed Gold Finish", "ring-gold-black"],
  ["ring", "Slim Chapter Ring - Polished Rose Gold", "ring-rose-black"],
  ["ring", "C0765 SKX013 Slim Chapter Ring - Brushed Silver", "ring-silver-black"],
  ["ring", "SKX013 Mirror Polished Black Chapter Ring", "ring-black-white"],
  ["ring", "Chapter Ring - SKX007/SRPD - Matt Black w Markers (White)", "ring-black-white"],
  ["ring", "SRP Turtle Chapter Ring: Matte Black Finish with Yellow Markers", "ring-black-white"],
  ["ring", "Chapter Ring: Kanji Style Blue Finish w Silver Markers", "ring-blue-white"],
  ["ring", "Chapter Ring: Orange Finish with Black Markers", "ring-orange-black"],
  ["ring", "Brushed Ice Blue Chapter Ring - Black Numerals", "ring-blue-black"],
  ["ring", "Chapter Ring - Polished Dark Blue", "ring-navy-white"],
  ["ring", "GMT  Chapter Ring - Blue/Red", "ring-blue-red-white"],
  ["ring", "SSK Chapter Ring: Polished Finish", "ring-silver-black"],
];

describe("printColours", () => {
  it.each(CASES)("%s %s -> %s", (slot, name, key) => {
    expect(printKey(slot, printColours(slot, name))).toBe(key);
  });

  it("only returns prints that are drawn, and every drawn print exists", () => {
    const keys = new Set(PRINTS.map((p) => p.key));
    for (const [slot, name] of CASES) expect(keys.has(printKey(slot, printColours(slot, name))), name).toBe(true);
    for (const { key } of PRINTS) expect(existsSync(`public/render/prints/${key}.webp`), key).toBe(true);
    expect(existsSync(`public${INTEGRATED_RING_PRINT}`)).toBe(true);
  });
});
