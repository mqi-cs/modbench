// TEMPORARY -- 3D proof-of-concept comparison harness. Not wired into
// anything; delete scripts/3d-test/ when the question is answered.
//
// Rasterises the CURRENT production case art (CaseBody, "tab 6") on its
// own -- no bezel, insert, dial, hands or crown -- at the SKX007 dimension
// set, 800x800 on the page's paper colour, so the 3D render can be laid
// beside it at identical scale and crop.
//
//   npx tsx --tsconfig scripts/3d-test/tsconfig.json scripts/3d-test/render-tab6.tsx

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";

import { CaseBody } from "../../lib/preview/art/parts";
import { watchMm, CANVAS } from "../../lib/preview/art/geometry";
import { metalFamily } from "../../lib/preview/art/palette";

const PAPER = "#f6f7f8";
const m = watchMm({ case: { caseDiameter: 42.5, lugWidth: 22, aperture: 28.5 } });

const svg = renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${CANVAS} ${CANVAS}`} width={CANVAS} height={CANVAS}>
    <rect width={CANVAS} height={CANVAS} fill={PAPER} />
    <CaseBody m={m} metal={metalFamily(["brushed"])} />
  </svg>,
);

const out = join(process.cwd(), "scripts/3d-test/out");
writeFileSync(join(out, "tab6-case.svg"), svg);
sharp(Buffer.from(svg))
  .png()
  .toFile(join(out, "tab6-case.png"))
  .then(() => console.log("wrote out/tab6-case.png", JSON.stringify(m)));
