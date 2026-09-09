// Case, crown, chapter ring and bezel insert for the illustrated preview.
// All four call the same edge-facet primitive at the same width under the
// same light, which is what makes the assembly read as one object rather
// than as a collage.

import { C, CROWN_ANGLE, MM, mm } from "./geometry";
import { CircleFacet, FACET_PX, RectFacet, facetPair, shift } from "./facets";
import { RECESS, STEEL, bodyColour, inkOn } from "./palette";

const LUG_REACH_MM = MM.caseDiameter / 2 + 1.75;

/**
 * A ring of radial ticks as one path.
 *
 * `skipEvery` drops the positions a longer tick already occupies, and
 * `skipZero` leaves twelve o'clock clear for the pip.
 */
function ticks(
  at: (r: number, deg: number) => [number, number],
  from: number,
  to: number,
  count: number,
  skipEvery = 0,
  skipZero = false,
): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    if (skipEvery && i % skipEvery === 0) continue;
    if (skipZero && i === 0) continue;
    const deg = (360 / count) * i;
    const [x1, y1] = at(from, deg);
    const [x2, y2] = at(to, deg);
    out.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return out.join("");
}

/**
 * Case body, lugs and the seats the other parts drop into.
 *
 * Deliberately has no outline stroke. The dark half of each facet does
 * that job, which is why the case holds its silhouette against a light
 * page AND a dark one without either being tuned for.
 */
export function CaseBody() {
  const caseR = mm(MM.caseDiameter) / 2;
  const chamferR = caseR - mm(1.1);
  const seatR = mm(MM.insertOuter) / 2 + mm(0.6);
  const apertureR = mm(MM.dial) / 2 + mm(1.2);
  const lugThickness = mm(9);
  const lugReach = mm(LUG_REACH_MM);
  const gap = mm(MM.lugWidth) - lugThickness * 2;
  const lugF = facetPair(STEEL.mid), caseF = facetPair(STEEL.body);
  const chamF = facetPair(STEEL.light), seatF = facetPair(STEEL.dark);

  const lugs = (top: boolean) =>
    [-1, 1].map((side) => {
      const x = side === -1 ? C - gap / 2 - lugThickness : C + gap / 2;
      const y = top ? C - lugReach : C;
      return (
        <g key={`${top ? "t" : "b"}-${side}`}>
          <rect x={x} y={y} width={lugThickness} height={lugReach} rx={mm(1.5)} fill={STEEL.mid} />
          <RectFacet x={x} y={y} w={lugThickness} h={lugReach} bright={lugF.bright} dark={lugF.dark} />
        </g>
      );
    });

  return (
    <g>
      {lugs(true)}
      {lugs(false)}
      <circle cx={C} cy={C} r={caseR} fill={STEEL.body} />
      <CircleFacet r={caseR - FACET_PX / 2} bright={caseF.bright} dark={caseF.dark} />
      <circle cx={C} cy={C} r={chamferR} fill={STEEL.light} />
      <CircleFacet r={chamferR - FACET_PX / 2} bright={chamF.bright} dark={chamF.dark} />
      {/* A bore, so its lit arc is the far wall. */}
      <circle cx={C} cy={C} r={seatR} fill={STEEL.dark} />
      <CircleFacet r={seatR - FACET_PX / 2} bright={seatF.bright} dark={seatF.dark} inner />
      <circle cx={C} cy={C} r={apertureR} fill={RECESS} />
      <CircleFacet r={apertureR - FACET_PX / 2} bright={shift(RECESS, "light", 0.3)} dark={shift(RECESS, "dark", 0.4)} inner />
    </g>
  );
}

/**
 * Crown, seen from directly above: a block standing off the case flank.
 *
 * 7.0mm across is a vendor-stated diameter. How far it protrudes is not
 * stated by any vendor and was bracketed from photographs at unknown
 * angles, so it is an estimate — the only one in this art.
 */
export function Crown({ shape, tags }: { shape: string; tags: readonly string[] }) {
  const width = mm(7.0);
  const out = mm(shape === "crown-chunky" ? 4.2 : shape === "crown-onion" ? 4.0 : 3.5);
  const caseR = mm(MM.caseDiameter) / 2;
  const x0 = caseR - mm(0.5);
  const body = tags.includes("gold-tone") ? "#b58c34" : tags.includes("black") ? "#3a3c40" : STEEL.mid;
  const f = facetPair(body);
  const teeth = shape === "crown-coin" ? 14 : shape === "crown-knurled" ? 9 : shape === "crown-chunky" ? 7 : 0;

  return (
    <g transform={`rotate(${CROWN_ANGLE - 90} ${C} ${C})`}>
      <g transform={`translate(${C} ${C})`}>
        {shape === "crown-onion" ? (
          <ellipse cx={x0 + out * 0.55} cy={0} rx={out * 0.62} ry={width / 2} fill={body} />
        ) : (
          <rect x={x0} y={-width / 2} width={out} height={width} rx={mm(shape === "crown-bolt" ? 1.4 : 0.35)} fill={body} />
        )}
        {Array.from({ length: teeth }, (_, i) => {
          const y = -width / 2 + (width * (i + 0.5)) / teeth;
          return <rect key={i} x={x0 + mm(0.3)} y={y - mm(0.11)} width={out - mm(1.1)} height={mm(0.22)} fill={shift(body, "dark", 0.28)} />;
        })}
        {shape === "crown-bolt" && <rect x={x0 + out * 0.3} y={-mm(0.35)} width={out * 0.55} height={mm(0.7)} fill={shift(body, "dark", 0.35)} />}
        <RectFacet x={x0} y={-width / 2} w={out} h={width} bright={f.bright} dark={f.dark} width={FACET_PX * 0.7} />
      </g>
    </g>
  );
}

/**
 * Chapter ring: the band between the dial edge and the insert bore.
 *
 * `ring-angled` shows more of its inner wall, so it is drawn a touch
 * wider with a stronger inner facet; `ring-plain` sits flatter.
 */
export function ChapterRing({ shape, tags }: { shape: string; tags: readonly string[] }) {
  const angled = shape === "ring-angled";
  const outer = mm(MM.chapterRing) / 2 + (angled ? mm(0.25) : 0);
  const inner = mm(MM.dial) / 2;
  const body = bodyColour(tags, STEEL.mid);
  const marks = inkOn(body);
  const f = facetPair(body, 0.5);
  const at = (r: number, deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };

  return (
    <g>
      <path
        d={`M ${C} ${C - outer} A ${outer} ${outer} 0 1 0 ${C} ${C + outer} A ${outer} ${outer} 0 1 0 ${C} ${C - outer} Z
            M ${C} ${C - inner} A ${inner} ${inner} 0 1 1 ${C} ${C + inner} A ${inner} ${inner} 0 1 1 ${C} ${C - inner} Z`}
        fillRule="evenodd"
        fill={body}
      />
      <path d={ticks(at, inner + mm(0.26), outer - mm(0.85), 60, 5)} stroke={marks} strokeWidth={1.4} opacity={0.66} />
      <path d={ticks(at, inner + mm(0.26), outer - mm(0.26), 12)} stroke={marks} strokeWidth={2.4} opacity={0.92} />
      <CircleFacet r={outer - FACET_PX / 2} bright={f.bright} dark={f.dark} />
      <CircleFacet r={inner + FACET_PX / 2} bright={shift(body, "light", angled ? 0.38 : 0.28)} dark={shift(body, "dark", 0.45)} inner />
    </g>
  );
}

/** Bezel ring and its insert. The annulus is constant; the printing is the shape. */
export function BezelAndInsert({ shape, tags }: { shape: string; tags: readonly string[] }) {
  const outerR = mm(MM.caseDiameter) / 2;
  const io = mm(MM.insertOuter) / 2;
  const ii = mm(MM.insertInner) / 2;
  const body = bodyColour(tags, "#22242a");
  const ink = inkOn(body);
  const ringF = facetPair(STEEL.body);
  const insF = facetPair(body, 0.55);
  const at = (r: number, deg: number): [number, number] => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };

  // A 24-hour scale reads twice round, a count-up dive scale once, and a
  // plain insert carries nothing but the pip.
  const majors = shape === "insert-gmt" ? 24 : shape === "insert-plain" ? 0 : 12;
  const minors = shape === "insert-plain" ? 0 : 60;

  return (
    <g>
      {/* One path, not sixty <line> elements. Identical output, and it
          keeps a page of ten previews to a few hundred DOM nodes rather
          than a few thousand -- which is worth six Lighthouse points. */}
      <path d={ticks(at, outerR - mm(1), outerR, 60)} stroke={shift(STEEL.body, "dark", 0.35)} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
      <CircleFacet r={outerR - FACET_PX / 2} bright={ringF.bright} dark={ringF.dark} />

      <path
        d={`M ${C} ${C - io} A ${io} ${io} 0 1 0 ${C} ${C + io} A ${io} ${io} 0 1 0 ${C} ${C - io} Z
            M ${C} ${C - ii} A ${ii} ${ii} 0 1 1 ${C} ${C + ii} A ${ii} ${ii} 0 1 1 ${C} ${C - ii} Z`}
        fillRule="evenodd"
        fill={body}
      />
      {/* Two-tone inserts are printed half in a second colour; drawn as a
          half-annulus so a GMT bezel reads the way it does on the wrist. */}
      {tags.includes("two-tone-bezel") && (
        <path
          d={`M ${C} ${C - io} A ${io} ${io} 0 0 1 ${C} ${C + io} L ${C} ${C + ii} A ${ii} ${ii} 0 0 0 ${C} ${C - ii} Z`}
          fill={shift(body, "light", 0.26)}
        />
      )}
      {minors > 0 && (
        <path d={ticks(at, ii + mm(0.5), io - mm(1.3), minors, majors ? 60 / majors : 0)} stroke={ink} strokeWidth={1.3} opacity={0.55} />
      )}
      {majors > 0 && (
        <path d={ticks(at, ii + mm(0.6), io - mm(0.9), majors, 0, true)} stroke={ink} strokeWidth={3.2} strokeLinecap="round" />
      )}
      <CircleFacet r={io - FACET_PX / 2} bright={insF.bright} dark={insF.dark} />
      <CircleFacet r={ii + FACET_PX / 2} bright={insF.bright} dark={insF.dark} inner />
      <circle cx={C} cy={C - ii - (io - ii) * 0.62} r={mm(1.0)} fill={ink} />
    </g>
  );
}
