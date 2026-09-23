// TEMPORARY -- 3D proof of concept. Not wired into anything; delete
// scripts/3d-test/ when the question is answered.
//
// Flattens a 3D render onto the page's paper colour and lays it beside
// the tab 6 render (and optionally the vendor photo) at 800px each.
//
//   npx tsx scripts/3d-test/compare.ts <3d.png> <sheet.png> [vendor.png]

import sharp from "sharp";

const args = process.argv.slice(2);
/** Required positional argument. The repo type-checks with noUncheckedIndexedAccess. */
function req(v: string | undefined, what: string): string {
  if (!v) throw new Error(`compare.ts: missing ${what}
  usage: compare.ts <3d.png> <sheet.png> [vendor.png]`);
  return v;
}
const render = req(args[0], "<3d.png>");
const sheet = req(args[1], "<sheet.png>");
const vendor = args[2];
const dir = "scripts/3d-test/out";

async function main() {
  // Paper, plus the SVG's RECESS disc where the dial aperture is -- the
  // 3D render holds the bore out, so both renders show the same fill there.
  const R = ((28.5 / 2 + 1.2) * 800 * 0.95) / 46;
  const under = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><rect width="800" height="800" fill="#f6f7f8"/><circle cx="400" cy="400" r="${R}" fill="#3c3c3a"/></svg>`,
  );
  const flat = await sharp(under).composite([{ input: render }]).png().toBuffer();
  await sharp(flat).toFile(render.replace(/\.png$/, "-flat.png"));
  const tiles = [
    { input: `${dir}/tab6-case.png`, left: 0, top: 0 },
    { input: flat, left: 810, top: 0 },
  ];
  if (vendor) {
    const v = await sharp(vendor).resize(800, 800, { fit: "contain", background: "#ffffff" }).png().toBuffer();
    tiles.push({ input: v, left: 1620, top: 0 });
  }
  await sharp({
    create: { width: vendor ? 2420 : 1610, height: 800, channels: 3, background: "#ffffff" },
  })
    .composite(tiles)
    .png()
    .toFile(sheet);
  console.log("wrote", sheet);
}
main();
