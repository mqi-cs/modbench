// Generated insert and chapter-ring prints, as SVG. Shared by the one-off
// texture scripts (scripts/3d-test/make-insert.ts, make-textures.ts) and
// make-prints.ts, which draws the colour palette the preview picks from
// (lib/render/prints.ts). Generated, never the vendor's artwork: the preview
// labels every one.

const PX = 2048;

const polar = (c: number) => (r: number, deg: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};

/** Background, split into top and bottom halves when bg2 is given (a two-tone GMT bezel). */
const background = (bg: string, bg2?: string) =>
  `<rect width="${PX}" height="${PX}" fill="${bg}"/>` + (bg2 ? `<rect y="${PX / 2}" width="${PX}" height="${PX / 2}" fill="${bg2}"/>` : "");

/**
 * SKX-style 60-minute dive insert: a dot every minute, bars at the odd fives,
 * numerals at 10-50 with their tops pointing out (so 30 reads upside down, as
 * on the real part), a triangle with a lume pip at zero. Spans the insert's
 * stated outer diameter edge to edge.
 */
export function insertSvg({ bg = "#111214", bg2, ink = "#f2f1ea", lume = "#e9e6d2" }: { bg?: string; bg2?: string; ink?: string; lume?: string } = {}) {
  const OUTER_MM = 38.0; // stated by the vendor (CI0015, GI0643, ...)
  const INNER_MM = 31.8;
  const s = PX / OUTER_MM; // px per mm
  const c = PX / 2;
  const ro = (OUTER_MM / 2) * s;
  const ri = (INNER_MM / 2) * s;
  const band = ro - ri;
  const at = polar(c);
  const parts: string[] = [];
  for (let i = 1; i < 60; i++) {
    const deg = i * 6;
    if (i % 10 === 0) continue; // numerals
    if (i % 5 === 0) {
      const [x1, y1] = at(ri + band * 0.16, deg);
      const [x2, y2] = at(ri + band * 0.86, deg);
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${0.85 * s}" stroke-linecap="butt"/>`);
    } else {
      const [x, y] = at(ri + band * 0.55, deg);
      parts.push(`<circle cx="${x}" cy="${y}" r="${0.34 * s}" fill="${ink}"/>`);
    }
  }
  for (const n of [10, 20, 30, 40, 50]) {
    const deg = n * 6;
    const [x, y] = at(ri + band * 0.5, deg);
    parts.push(
      `<text x="${x}" y="${y}" transform="rotate(${deg} ${x} ${y})" fill="${ink}" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="${2.5 * s}" text-anchor="middle" dominant-baseline="central" letter-spacing="${0.05 * s}">${n}</text>`,
    );
  }
  // Zero: a downward triangle with a lume pip in a steel-edged cup.
  const top = c - ro + band * 0.08;
  const tip = c - ri - band * 0.08;
  const half = band * 0.46;
  parts.push(`<polygon points="${c - half},${top} ${c + half},${top} ${c},${tip}" fill="${ink}"/>`);
  parts.push(`<circle cx="${c}" cy="${top + (tip - top) * 0.38}" r="${0.62 * s}" fill="#9aa0a3"/>`);
  parts.push(`<circle cx="${c}" cy="${top + (tip - top) * 0.38}" r="${0.48 * s}" fill="${lume}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">
  ${background(bg, bg2)}
  ${parts.join("\n  ")}
</svg>`;
}

/** SKX-style angled chapter ring: minute bars, longer at the fives. Spans the ring's 30.5mm outer diameter. */
export function ringSvg({ bg = "#141516", bg2, ink = "#eeede6" }: { bg?: string; bg2?: string; ink?: string } = {}) {
  const OUTER = 30.5; // modal stated chapter ring (66 rings)
  const INNER = 27.7;
  const s = PX / OUTER;
  const c = PX / 2;
  const ro = (OUTER / 2) * s;
  const ri = (INNER / 2) * s;
  const at = polar(c);
  const marks: string[] = [];
  for (let i = 0; i < 60; i++) {
    const five = i % 5 === 0;
    const [x1, y1] = at(ri + (ro - ri) * 0.12, i * 6);
    const [x2, y2] = at(ri + (ro - ri) * (five ? 0.8 : 0.55), i * 6);
    marks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="${(five ? 0.32 : 0.16) * s}"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}">${background(bg, bg2)}${marks.join("")}</svg>`;
}
