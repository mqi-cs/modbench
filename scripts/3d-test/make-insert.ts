// TEMPORARY -- 3D proof of concept. Not wired into anything; delete
// scripts/3d-test/ when the question is answered.
//
// OPEN QUESTION FOR THE OWNER (2026-09-23): this print is GENERATED, not the
// vendor's artwork. It had to be: every lumed black SKX-style insert in the
// catalog with a prepared asset was photographed with its lume glowing, and
// every chapter-ring asset is a three-quarter perspective photo that cannot be
// projected onto a ring seen from above. The result sits next to a real vendor
// dial photograph and looks equally real. For a tool whose promise is "never
// tell someone two parts fit when they don't", there should be an explicit
// rule about showing an approximation of a real product's printing. The demo
// pages label it; a shipped feature would need a policy. See
// docs/CHANGES-2026-09-23.md, "Open question for the owner".
//
// Generates an SKX-style 60-minute dive insert print as a texture: white
// print on black, triangle with a lume pip at zero, a dot every minute,
// bars at the odd fives, numerals at 10-50 with their tops pointing out
// (so 30 reads upside down, as on the real part).
//
// Why generated and not a vendor photo: every lumed SKX-style black insert
// in the catalog with a prepared asset was photographed with the lume
// GLOWING, which reads as wrong in a daylight render. This is a design
// approximation, labelled as such wherever it is shown.
//
// The texture spans the insert's stated outer diameter edge to edge.
//
//   npx tsx scripts/3d-test/make-insert.ts

import sharp from "sharp";

const PX = 2048;
const OUTER_MM = 38.0; // stated by the vendor (CI0015, GI0643, ...)
const INNER_MM = 31.8;
const s = PX / OUTER_MM; // px per mm
const c = PX / 2;
const ro = (OUTER_MM / 2) * s;
const ri = (INNER_MM / 2) * s;
const band = ro - ri;

const at = (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};

const parts: string[] = [];
// Per build: INSERT_BG / INSERT_INK / INSERT_LUME colours, TAG suffix.
const INK = process.env.INSERT_INK ?? "#f2f1ea";
const LUME = process.env.INSERT_LUME ?? "#e9e6d2";
const BG = process.env.INSERT_BG ?? "#111214";
const TAG = process.env.TAG ? `-${process.env.TAG}` : "-skx";

for (let i = 1; i < 60; i++) {
  const deg = i * 6;
  if (i % 10 === 0) continue; // numerals
  if (i % 5 === 0) {
    // Bar at 5, 15, 25, ...
    const [x1, y1] = at(ri + band * 0.16, deg);
    const [x2, y2] = at(ri + band * 0.86, deg);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${0.85 * s}" stroke-linecap="butt"/>`);
  } else {
    const [x, y] = at(ri + band * 0.55, deg);
    parts.push(`<circle cx="${x}" cy="${y}" r="${0.34 * s}" fill="${INK}"/>`);
  }
}

// Numerals, rotated with the ring so their tops face outward.
for (const n of [10, 20, 30, 40, 50]) {
  const deg = n * 6;
  const [x, y] = at(ri + band * 0.5, deg);
  parts.push(
    `<text x="${x}" y="${y}" transform="rotate(${deg} ${x} ${y})" fill="${INK}" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="${2.5 * s}" text-anchor="middle" dominant-baseline="central" letter-spacing="${0.05 * s}">${n}</text>`,
  );
}

// Zero: a downward triangle with a lume pip in a steel-edged cup.
{
  const top = c - ro + band * 0.08;
  const tip = c - ri - band * 0.08;
  const half = band * 0.46;
  parts.push(`<polygon points="${c - half},${top} ${c + half},${top} ${c},${tip}" fill="${INK}"/>`);
  parts.push(`<circle cx="${c}" cy="${top + (tip - top) * 0.38}" r="${0.62 * s}" fill="#9aa0a3"/>`);
  parts.push(`<circle cx="${c}" cy="${top + (tip - top) * 0.38}" r="${0.48 * s}" fill="${LUME}"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">
  <rect width="${PX}" height="${PX}" fill="${BG}"/>
  ${parts.join("\n  ")}
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(`scripts/3d-test/out/insert${TAG}.png`)
  .then(() => console.log(`wrote insert${TAG}.png`));
