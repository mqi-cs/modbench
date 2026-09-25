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
// Textures for the parts that have no usable vendor image:
//
//   ring-skx.png   SKX-style angled chapter ring print, white minute bars on
//                  black, longer at the fives. Spans the ring's 30.5mm
//                  outer diameter. The catalog's chapter-ring assets are
//                  three-quarter perspective photos, so none can be projected
//                  onto a ring seen from above.
//   dial-cut.png   The vendor dial photo with its day-date window cut out
//                  (the photo shows the window as solid white).
//   date-skx.png   What shows through that window: a white day wheel and
//                  date wheel reading TUE 22, in the dial photo's own frame.
//
//   npx tsx scripts/3d-test/make-textures.ts

import sharp from "sharp";

const OUT = "scripts/3d-test/out";
// Per build: DIAL_ID picks the dial photo; TAG suffixes every output;
// RING_BG / RING_INK colour the chapter ring print.
const DIAL = `public/assets/dial/${process.env.DIAL_ID ?? "ZDs4QjjlRw6lbypEnGaFV"}.webp`;
const TAG = process.env.TAG ? `-${process.env.TAG}` : "";
const RING_BG = process.env.RING_BG ?? "#141516";
const RING_INK = process.env.RING_INK ?? "#eeede6";

async function ring() {
  const PX = 2048;
  const OUTER = 30.5; // modal stated chapter ring (66 rings)
  const INNER = 27.7;
  const s = PX / OUTER;
  const c = PX / 2;
  const ro = (OUTER / 2) * s;
  const ri = (INNER / 2) * s;
  const at = (r: number, deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const marks: string[] = [];
  for (let i = 0; i < 60; i++) {
    const five = i % 5 === 0;
    const [x1, y1] = at(ri + (ro - ri) * 0.12, i * 6);
    const [x2, y2] = at(ri + (ro - ri) * (five ? 0.8 : 0.55), i * 6);
    marks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${RING_INK}" stroke-width="${(five ? 0.32 : 0.16) * s}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}"><rect width="${PX}" height="${PX}" fill="${RING_BG}"/>${marks.join("")}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/ring${TAG || "-skx"}.png`);
}

/** Bounding box of the white window, grown from a seed inside it. */
async function windowBox() {
  const { data, info } = await sharp(DIAL).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  // `?? 0` keeps this honest under noUncheckedIndexedAccess: an out-of-range
  // read is treated as "not white", which is what the flood fill wants.
  const at4 = (k: number) => data[k] ?? 0;
  const white = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return at4(i) > 225 && at4(i + 1) > 225 && at4(i + 2) > 225 && at4(i + 3) > 200;
  };
  // Seed: the white pixel nearest where a 3 o'clock window sits. Dials
  // differ -- the SKX day-date window is wide and further in, a date-only
  // window is small and further out.
  let seed: [number, number] | null = null;
  let best = Infinity;
  for (let y = 340; y < 460; y++)
    for (let x = 470; x < 730; x++)
      if (white(x, y)) {
        const d = (x - 575) ** 2 + (y - 400) ** 2;
        if (d < best) { best = d; seed = [x, y]; }
      }
  const seen = new Set<number>();
  const stack: [number, number][] = seed ? [seed] : [];
  let [x0, y0, x1, y1] = [W, W, 0, 0];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const k = y * W + x;
    if (seen.has(k) || !white(x, y)) continue;
    seen.add(k);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { data, info, x0, y0, x1, y1 };
}

async function dialAndDate() {
  const { data, info, x0, y0, x1, y1 } = await windowBox();
  if (x1 <= x0) {
    // No window on this dial: nothing to cut, nothing to print.
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${OUT}/dial-cut${TAG}.png`);
    await sharp({ create: { width: info.width, height: info.height, channels: 3, background: "#f4f3ee" } }).png().toFile(`${OUT}/date${TAG || "-skx"}.png`);
    console.log("no window found");
    return;
  }
  // Cut the window, one pixel inside its edge so the frame stays printed.
  const out = Buffer.from(data);
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) out[(y * info.width + x) * 4 + 3] = 0;
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(`${OUT}/dial-cut${TAG}.png`);

  // Day and date wheels, printed so they read through the window.
  const w = x1 - x0;
  const h = y1 - y0;
  const cy = (y0 + y1) / 2;
  // Wide window: day and date. Narrow: date only.
  const dayDate = w / h > 2.2;
  const cx = (x0 + x1) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">
    <rect width="100%" height="100%" fill="#f4f3ee"/>
    ${dayDate ? `<line x1="${x0 + w * 0.64}" y1="${y0 - h}" x2="${x0 + w * 0.64}" y2="${y1 + h}" stroke="#c9c7bf" stroke-width="1.2"/>
    <text x="${x0 + w * 0.32}" y="${cy}" font-family="Arial, sans-serif" font-weight="700" font-size="${h * 0.62}" text-anchor="middle" dominant-baseline="central" fill="#1b1b1b">TUE</text>
    <text x="${x0 + w * 0.82}" y="${cy}" font-family="Arial, sans-serif" font-weight="700" font-size="${h * 0.66}" text-anchor="middle" dominant-baseline="central" fill="#1b1b1b">22</text>`
    : `<text x="${cx}" y="${cy}" font-family="Arial, sans-serif" font-weight="700" font-size="${h * 0.72}" text-anchor="middle" dominant-baseline="central" fill="#1b1b1b">22</text>`}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`${OUT}/date${TAG || "-skx"}.png`);
  console.log("window px", { x0, y0, x1, y1, dayDate });
}

Promise.all([ring(), dialAndDate()]).then(() => console.log("wrote ring-skx.png, dial-cut.png, date-skx.png"));
