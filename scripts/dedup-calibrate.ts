// Calibration point for the D7 pHash retry.
//
// The Task 5 writeup rests on three manually-inspected pairs. Two of them
// have prepared assets and are re-checked by scripts/dedup-phash.ts. The
// third -- the SRP Turtle double-dome sapphire crystal that was manually
// merged in Task 4, and scored 140/256 on raw photographs because one shot
// is outdoor foliage and the other studio black -- does NOT, because
// crystals were never a preview category.
//
// It is the single most important point in the set: the known-SAME pair
// that raw hashing ranked worst. So it is normalised here on its own,
// through the same analyse() the asset pipeline uses, and hashed. This is
// the pipeline's subject-detection and crop, not a bespoke one -- the only
// liberty taken is asking it to treat a crystal as a disc, which it is.
//
//   pnpm dedup-calibrate

import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { analyse } from "./prepare-assets";
import { IMAGE_SIDE, hamming, phash } from "../lib/dedup/phash";

const PAIR = [
  { id: "jsIvjQs6Mpf9_Y-QVnxiu", name: "Sapphire Double Dome - SRP Turtle", vendor: "dlwwatches", url: "https://cdn.shopify.com/s/files/1/0552/3770/5899/products/f1dd0b1ae05de9d1d11f03484f5a07be_ba2ea8e7-81bb-4cfa-8657-5e47bf4d4352.jpg?v=1617167858" },
  { id: "szku13sW25U5KIisByMfp", name: "G0352 SRP Turtle Reissue Double Dome Sapphire Crystal", vendor: "watchandstyle", url: "https://cdn.shopify.com/s/files/1/0032/3390/6799/products/DSC03328.jpg?v=1611563560" },
];

const ANALYSIS_SIZE = 400;

async function normalisedHash(url: string, label: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: fetch ${res.status}`);
  const source = await sharp(Buffer.from(await res.arrayBuffer())).resize(800, 800, { fit: "inside" }).png().toBuffer();

  const result = await analyse(source, "dial");
  console.log(`  ${label}: analyse -> ${result.state} (${result.reason})`);
  if (!result.box) return { hash: null, raw: null as Buffer | null };

  const s = result.scale;
  const meta = await sharp(source).metadata();
  const left = Math.max(0, Math.round(result.box.left * s));
  const top = Math.max(0, Math.round(result.box.top * s));
  const width = Math.min((meta.width ?? 800) - left, Math.round(result.box.width * s));
  const height = Math.min((meta.height ?? 800) - top, Math.round(result.box.height * s));

  const square = await sharp(source)
    .extract({ left, top, width, height })
    .flatten({ background: "#ffffff" })
    .resize(IMAGE_SIDE, IMAGE_SIDE, { fit: "fill" })
    .png()
    .toBuffer();
  const grey = await sharp(square).greyscale().raw().toBuffer();
  return { hash: phash(new Uint8Array(grey)), raw: square };
}

async function main() {
  console.log("SRP Turtle double-dome sapphire crystal -- the Task 4 manual merge.");
  console.log("Raw-photo distance in Task 5: 140/256 (second worst in the dataset).\n");

  const out = [];
  for (const p of PAIR) out.push({ p, ...(await normalisedHash(p.url, `${p.vendor}`)) });

  if (!out[0]!.hash || !out[1]!.hash) {
    console.log("\nAt least one side could not be normalised; no calibration distance.");
    return;
  }
  const d = hamming(out[0]!.hash, out[1]!.hash);
  console.log(`\n  normalised distance: ${d}/256   (raw was 140/256)`);

  // Side-by-side, so the number is checkable by eye rather than trusted.
  const tiles = await Promise.all(out.map((o) => sharp(o.raw!).resize(240, 240, { fit: "fill" }).png().toBuffer()));
  const sheet = await sharp({ create: { width: 500, height: 240, channels: 3, background: "#ffffff" } })
    .composite([{ input: tiles[0]!, left: 0, top: 0 }, { input: tiles[1]!, left: 260, top: 0 }])
    .png()
    .toBuffer();
  writeFileSync(process.argv[2] ?? "calibration.png", sheet);
  console.log(`  wrote ${process.argv[2] ?? "calibration.png"}`);
}

main();
