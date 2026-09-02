// Draws the case body and bezel ring for each supported platform.
// specs/05-phase-4-preview.md: "Draw the two case bases yourself. Do not
// attempt to extract a case silhouette from vendor photos."
//
// Vendor case photography is the same mess as the rest -- fitted watches,
// wrist shots, angled hero shots -- and a silhouette pulled out of one
// would carry that vendor's dial, hands and bezel with it. Two flat
// drawings also set the visual register for the whole preview: deliberately
// diagrammatic, so the composite reads as a construction drawing rather
// than a photograph, which is what the phase's honesty requirement asks for.
//
//   pnpm draw-case-art

import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { CANVAS, PX_PER_MM, PLATFORM_GEOMETRY } from "../lib/preview/layers";

const OUT = "public/assets/platform";
const C = CANVAS / 2;

// Flat, unlit palette. No gradients and no highlights anywhere: a
// specular sheen is the single strongest cue that reads as "photograph",
// and this drawing has to read as "diagram" on sight.
const STEEL = "#b6bcc6";
const STEEL_DARK = "#8b929e";
const OUTLINE = "#5b616c";
const RECESS = "#3a3f48";

const mm = (v: number) => v * PX_PER_MM;

/**
 * Crown at four o'clock: the SKX's signature, and the reason crown
 * position is a compatibility rule at all. The crown rect is drawn at
 * three o'clock and rotated into place, so SVG sees this angle minus 90.
 */
const CROWN_ANGLE_FROM_TWELVE = 120;

function polarPoint(radius: number, degreesFromTwelve: number): [number, number] {
  const rad = ((degreesFromTwelve - 90) * Math.PI) / 180;
  return [C + radius * Math.cos(rad), C + radius * Math.sin(rad)];
}

/**
 * Case body: the plate the dial drops into, with lugs at twelve and six
 * and the crown at four o'clock -- the SKX's most recognisable feature and
 * the reason crown position is a compatibility rule in the first place.
 *
 * The dial aperture is drawn as a dark recess rather than left
 * transparent. An empty case should look like an empty case; a hole
 * straight through to the page reads as a rendering fault.
 */
function caseBodySvg(platform: string): string {
  const g = PLATFORM_GEOMETRY[platform]!;
  const caseR = mm(g.case) / 2;
  const apertureR = mm(g.dial) / 2;
  const lugWidth = mm(22); // SKX007 lug width, the same figure the strap rule keys off
  const lugReach = caseR + mm(1.75); // 46mm lug to lug

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <g stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round">
    <rect x="${C - lugWidth / 2}" y="${C - lugReach}" width="${lugWidth}" height="${lugReach * 2}" rx="${mm(2)}" fill="${STEEL_DARK}"/>
    <rect x="${C + caseR - mm(0.4)}" y="${C - mm(3.2)}" width="${mm(5.2)}" height="${mm(6.4)}" rx="${mm(1)}"
          fill="${STEEL_DARK}" transform="rotate(${CROWN_ANGLE_FROM_TWELVE - 90} ${C} ${C})"/>
    <rect x="${C + caseR - mm(2.5)}" y="${C - mm(5.4)}" width="${mm(3.4)}" height="${mm(10.8)}" rx="${mm(1.6)}"
          fill="${STEEL}" transform="rotate(${CROWN_ANGLE_FROM_TWELVE - 90} ${C} ${C})"/>
    <circle cx="${C}" cy="${C}" r="${caseR}" fill="${STEEL}"/>
    <circle cx="${C}" cy="${C}" r="${apertureR + mm(1.4)}" fill="${STEEL_DARK}" stroke-width="1.5"/>
    <circle cx="${C}" cy="${C}" r="${apertureR}" fill="${RECESS}" stroke-width="1.5"/>
  </g>
</svg>`;
}

/**
 * Bezel ring: the band that holds the insert, with the coin-edge grip
 * every diver bezel has. Drawn as an annulus so the insert layer sits
 * inside it and the case edge stays visible outside it.
 */
function bezelRingSvg(platform: string): string {
  const g = PLATFORM_GEOMETRY[platform]!;
  const outerR = mm(g.case) / 2;
  const innerR = mm(g.insert) / 2;
  const teeth: string[] = [];
  const toothCount = 60;
  for (let i = 0; i < toothCount; i++) {
    const angle = (360 / toothCount) * i;
    const [x1, y1] = polarPoint(outerR - mm(0.9), angle);
    const [x2, y2] = polarPoint(outerR, angle);
    teeth.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <path d="M ${C} ${C - outerR} A ${outerR} ${outerR} 0 1 0 ${C} ${C + outerR} A ${outerR} ${outerR} 0 1 0 ${C} ${C - outerR} Z
           M ${C} ${C - innerR} A ${innerR} ${innerR} 0 1 1 ${C} ${C + innerR} A ${innerR} ${innerR} 0 1 1 ${C} ${C - innerR} Z"
        fill="${STEEL}" fill-rule="evenodd" stroke="${OUTLINE}" stroke-width="2.5"/>
  <g stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round" opacity="0.75">${teeth.join("")}</g>
</svg>`;
}

/**
 * Crystal glare: one flat arc, no blur and no gradient.
 *
 * The spec asks for a single static highlight, and the honesty
 * requirement rules out anything that reads as a real reflection -- so
 * this is a plain translucent band, obviously drawn on, rather than the
 * soft elliptical bloom a render would produce.
 */
function glareSvg(): string {
  const r = mm(31.5) / 2;
  const [ax, ay] = polarPoint(r * 0.92, 300);
  const [bx, by] = polarPoint(r * 0.92, 340);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <path d="M ${ax.toFixed(1)} ${ay.toFixed(1)} A ${r} ${r} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)} L ${C} ${C} Z"
        fill="#ffffff" opacity="0.1"/>
</svg>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  for (const platform of Object.keys(PLATFORM_GEOMETRY)) {
    for (const [name, svg] of [["case", caseBodySvg(platform)], ["bezel", bezelRingSvg(platform)]] as [string, string][]) {
      const file = `${OUT}/${platform}-${name}.webp`;
      await sharp(Buffer.from(svg)).webp({ quality: 92, alphaQuality: 100 }).toFile(file);
      written.push(file);
    }
  }
  const glareFile = `${OUT}/glare.webp`;
  await sharp(Buffer.from(glareSvg())).webp({ quality: 92, alphaQuality: 100 }).toFile(glareFile);
  written.push(glareFile);
  console.log(`Wrote ${written.length} platform assets:\n  ${written.join("\n  ")}`);
}

main();
