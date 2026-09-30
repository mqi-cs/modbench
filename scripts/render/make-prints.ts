// Draws every generated insert and chapter-ring print the preview can pick
// (lib/render/prints.ts PRINTS) into public/render/prints/<key>.webp.
// Offline and deterministic; no render needed, since prints are applied in
// the browser over geometry-only passes.
//
//   npx tsx scripts/render/make-prints.ts
import sharp from "sharp";
import { INKS, PRINTS, TONES } from "../../lib/render/prints";
import { insertSvg, ringSvg } from "./print-art";

for (const { key, slot, colours: c } of PRINTS) {
  const o = { bg: TONES[c.bg], bg2: c.bg2 && TONES[c.bg2], ink: INKS[c.ink] };
  await sharp(Buffer.from(slot === "insert" ? insertSvg(o) : ringSvg(o))).webp().toFile(`public/render/prints/${key}.webp`);
}
console.log(`wrote ${PRINTS.length} prints`);
