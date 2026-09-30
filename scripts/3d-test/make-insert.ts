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
import { insertSvg } from "../render/print-art";

// Per build: INSERT_BG / INSERT_INK / INSERT_LUME colours, TAG suffix.
const TAG = process.env.TAG ? `-${process.env.TAG}` : "-skx";
const svg = insertSvg({ bg: process.env.INSERT_BG, ink: process.env.INSERT_INK, lume: process.env.INSERT_LUME });

sharp(Buffer.from(svg))
  .png()
  .toFile(`scripts/3d-test/out/insert${TAG}.png`)
  .then(() => console.log(`wrote insert${TAG}.png`));
