// Writes the synthetic photos the BYO photo gate is tested on
// (data/fixtures/photo-gate/). Run: npx tsx scripts/make-photo-gate-fixtures.ts
// Synthetic by necessity: no real listing photos exist until marketplace API
// access (D15a, D15e). Each file's name says what the gate should decide.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const OUT = "data/fixtures/photo-gate";

/** A dial face: 12 index bars, unlit (pale) lume pips, a date window, two hands. */
function dialFace(cx: number, cy: number, r: number, face = "#1b1d22", lume = "#e8e4d0") {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const x = cx + Math.sin(a) * r * 0.8, y = cy - Math.cos(a) * r * 0.8;
    return `<rect x="${x - 7}" y="${y - 20}" width="14" height="40" fill="${lume}" transform="rotate(${i * 30} ${x} ${y})"/>`;
  }).join("");
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${face}"/>${ticks}
    <rect x="${cx + r * 0.52}" y="${cy - 18}" width="44" height="36" fill="#ffffff"/>
    <rect x="${cx - 6}" y="${cy - r * 0.62}" width="12" height="${r * 0.62}" fill="${lume}"/>
    <rect x="${cx - 5}" y="${cy - 5}" width="${r * 0.45}" height="10" fill="${lume}" transform="rotate(-30 ${cx} ${cy})"/>`;
}

const svg = (w: number, h: number, bg: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>${body}</svg>`;

const fixtures: Record<string, string> = {
  // Should pass.
  "pass-dial-frontal.png": svg(800, 800, "#ffffff", dialFace(400, 400, 320)),
  "pass-insert-frontal.png": svg(800, 800, "#ffffff", `<circle cx="400" cy="400" r="340" fill="#1c2a55"/><circle cx="400" cy="400" r="270" fill="#ffffff"/><rect x="390" y="66" width="20" height="44" fill="#ffffff"/>`),
  // Saturated green print in daylight: the lume check must not fire on a white backdrop.
  "pass-dial-green-print-daylight.png": svg(800, 800, "#ffffff", dialFace(400, 400, 320, "#0f2a18", "#6dff7a")),
  "pass-chapter-ring-frontal.png": svg(800, 800, "#ffffff", `<circle cx="400" cy="400" r="340" fill="#9a9ca3"/><circle cx="400" cy="400" r="295" fill="#ffffff"/>`),
  // Should be rejected.
  "reject-dial-low-resolution.png": svg(360, 360, "#ffffff", dialFace(180, 180, 144)),
  "reject-dial-tilted.png": svg(800, 800, "#ffffff", `<g transform="translate(400 400) scale(1 0.72) translate(-400 -400)">${dialFace(400, 400, 320)}</g>`),
  "reject-dial-tilted-diagonal.png": svg(800, 800, "#ffffff", `<g transform="rotate(45 400 400) translate(400 400) scale(1 0.78) translate(-400 -400)">${dialFace(400, 400, 300)}</g>`),
  "reject-dial-lume-lit.png": svg(800, 800, "#060607", dialFace(400, 400, 320, "#121315", "#6dff7a")),
  "reject-dial-on-a-strap.png": svg(800, 800, "#ffffff", `<rect x="290" y="0" width="220" height="800" fill="#3b2a1c"/>${dialFace(400, 400, 250)}`),
};

mkdirSync(OUT, { recursive: true });
for (const [name, s] of Object.entries(fixtures)) {
  await sharp(Buffer.from(s)).png().toFile(`${OUT}/${name}`);
  console.log(`${OUT}/${name}`);
}
