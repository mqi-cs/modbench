// Case, crown, chapter ring and bezel insert for the illustrated preview.
// All four call the same edge-facet primitive at the same width under the
// same light, which is what makes the assembly read as one object rather
// than as a collage.

import { C, CROWN_ANGLE, at, mm, type WatchMm } from "./geometry";
import { CircleFacet, FACET_PX, PathFacet, RectFacet, facetPair, shift } from "./facets";
import { RECESS, STEEL, bodyColour, inkOn, metalColour } from "./palette";
import { StepShadow } from "./depth";

/** Lug thickness at the root and at the tip. Read off vendor case photos. */
const LUG_ROOT_MM = 6.5;
const LUG_TIP_MM = 4.4;
/** Radius of the fillet where a lug's inner face meets the body. */
const FILLET_MM = 1.6;
/**
 * Crown-guard shoulder: how far it stands proud, and where it sits
 * relative to the lower-right lug root. Measured back from the lug rather
 * than fixed in degrees, because the lug root angle moves with lug width.
 */
const GUARD_MM = 1.5;
const GUARD_LEAD = 22;

/**
 * A ring of radial ticks as one path.
 *
 * `skipEvery` drops the positions a longer tick already occupies, and
 * `skipZero` leaves twelve o'clock clear for the pip.
 */
function ticks(from: number, to: number, count: number, skipEvery = 0, skipZero = false): string {
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
 * The case outline as ONE closed path: body, four integrated lugs and the
 * crown-guard shoulder, with no seams anywhere.
 *
 * The previous case was a circle with four rectangles laid over it and it
 * read exactly like that. Against the vendors' own case photographs four
 * things were wrong: the lugs are not separate pieces, they taper from
 * root to tip, they reach only about 1.75mm past the case flank (an SKX is
 * a stubby case, not a long-lugged one -- the old art gave them a 9mm slab
 * running to the centre), and a crown guard breaks the right-hand outline
 * between three and four o'clock.
 *
 * Built clockwise from twelve. Each lug interrupts the body arc at the
 * angle where its own face leaves the circle and rejoins at the other,
 * so the whole thing is one silhouette that PathFacet lights as one
 * surface -- which is what stops the lugs reading as stuck-on tabs.
 */
export function caseOutline(m: WatchMm): string {
  const R = mm(m.caseDiameter) / 2;
  const innerX = mm(m.lugWidth) / 2;
  const reach = mm(m.lugToLug) / 2;
  const outerX = innerX + mm(LUG_ROOT_MM);
  const tipX = innerX + mm(LUG_TIP_MM);
  const tipR = mm(LUG_TIP_MM) / 2;
  const tipCy = reach - tipR;

  const onCircle = (x: number) => Math.sqrt(Math.max(R * R - x * x, 1));
  const innerY = onCircle(innerX);
  const rootY = onCircle(Math.min(outerX, R * 0.995));

  const P = (x: number, y: number) => `${(C + x).toFixed(1)} ${(C + y).toFixed(1)}`;
  const arcTo = (x: number, y: number) => `A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${P(x, y)}`;
  const tipTo = (x: number, y: number) => `A ${tipR.toFixed(1)} ${tipR.toFixed(1)} 0 0 1 ${P(x, y)}`;

  /**
   * The flared outer face of a lug, tip to root.
   *
   * A straight line here is what made the lugs read as bars butted
   * against a circle: the eye reads the corner where the line meets the
   * body as a join. Bowing it outward lets the face leave the body
   * almost tangentially, and the lug becomes part of the same mass.
   */
  const flank = (sx: number, sy: number, fromTip: boolean) => {
    const [x2, y2] = fromTip ? [sx * outerX, sy * rootY] : [sx * tipX, sy * tipCy];
    // Control point: the chord midpoint nudged out along its own radius.
    // Pushing it out by a FRACTION of the lug width instead put it 3mm
    // clear of the case circle and grew a lump on the flank.
    const mx = (sx * (tipX + outerX)) / 2;
    const my = (sy * (tipCy + rootY)) / 2;
    const len = Math.hypot(mx, my) || 1;
    const push = mm(0.9);
    return `Q ${P(mx + (mx / len) * push, my + (my / len) * push)} ${P(x2, y2)}`;
  };

  // Control point for the guard bulge: the angular midpoint, pushed out.
  const ctrl = (a: number, b: number) => {
    const [x, y] = at(R + mm(GUARD_MM) * 0.75, (a + b) / 2);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const guardAt = (deg: number, extra: number) => {
    const [x, y] = at(R + extra, deg);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const rootAngle = 180 - (Math.asin(Math.min(outerX / R, 0.995)) * 180) / Math.PI;
  // The guard exists to protect the crown, so it peaks AT the crown --
  // pinning it a fixed number of degrees back from the lug instead put
  // the shoulder at half past three and left the crown emerging from the
  // lug itself.
  const guardPeak = Math.min(CROWN_ANGLE, rootAngle - 4);
  const guardFrom = guardPeak - GUARD_LEAD;

  const fillet = mm(FILLET_MM);
  const innerAngle = (Math.asin(Math.min(innerX / R, 0.99)) * 180) / Math.PI;
  /**
   * Rounds the inside corner where a lug meets the body.
   *
   * Left sharp, that corner reads as the seam of a part that was stuck
   * on. Every case photograph has a fillet here.
   */
  const rootFillet = (sx: number, sy: number) => {
    const back = (fillet / R) * (180 / Math.PI);
    const [ax, ay] = at(R, sy < 0 ? (sx > 0 ? innerAngle - back : 360 - innerAngle + back) : sx > 0 ? 180 - innerAngle + back : 180 + innerAngle - back);
    return { a: `${ax.toFixed(1)} ${ay.toFixed(1)}`, k: P(sx * innerX, sy * innerY), b: P(sx * innerX, sy * (innerY + fillet)) };
  };

  return [
    `M ${P(0, -R)}`,
    // Twelve round to the top-right lug, entered on its inner face.
    (() => { const f = rootFillet(1, -1); return `A ${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${f.a} Q ${f.k} ${f.b}`; })(),
    `L ${P(innerX, -tipCy)}`,
    tipTo(tipX, -tipCy),
    flank(1, -1, true),
    // Down the right flank to where the crown guard starts.
    arcTo(...guardPt(R, guardFrom)),
    // Guard: out to the shoulder, then straight into the lower-right lug
    // root. The two genuinely merge on this case, so there is no notch.
    `Q ${ctrl(guardFrom, guardPeak)} ${guardAt(guardPeak, mm(GUARD_MM))}`,
    `Q ${ctrl(guardPeak, rootAngle)} ${P(outerX, rootY)}`,
    // Lower-right lug, entered on its outer face.
    flank(1, 1, false),
    tipTo(innerX, tipCy),
    `L ${P(innerX, innerY)}`,
    arcTo(-innerX, innerY),
    // Lower-left lug, inner face first.
    `L ${P(-innerX, tipCy)}`,
    tipTo(-tipX, tipCy),
    flank(-1, 1, true),
    arcTo(-outerX, -rootY),
    // Top-left lug, outer face first.
    flank(-1, -1, false),
    tipTo(-innerX, -tipCy),
    `L ${P(-innerX, -innerY)}`,
    arcTo(0, -R),
    "Z",
  ].join(" ");
}

function guardPt(R: number, deg: number): [number, number] {
  const [x, y] = at(R, deg);
  return [x - C, y - C];
}

/**
 * Case body: the silhouette, then the surfaces stepping down into it.
 *
 * Deliberately has no outline stroke. The dark half of each facet does
 * that job, which is why the case holds its silhouette against a light
 * page AND a dark one without either being tuned for.
 */
export function CaseBody({ m }: { m: WatchMm }) {
  const caseR = mm(m.caseDiameter) / 2;
  const chamferR = caseR - mm(1.0);
  const seatR = mm(m.insertOuter) / 2 + mm(0.6);
  const apertureR = mm(m.dialAperture) / 2 + mm(1.2);
  const outline = caseOutline(m);
  const caseF = facetPair(STEEL.body);
  const chamF = facetPair(STEEL.light);
  const seatF = facetPair(STEEL.dark);

  return (
    <g>
      <path d={outline} fill={STEEL.body} />
      <PathFacet d={outline} bright={caseF.bright} dark={caseF.dark} />
      {/* The chamfer is a rim, not a disc. Filled edge to edge it covered
          the case top, and the lugs then read as bars floating behind a
          lighter circle rather than as part of the same piece of steel. */}
      <circle cx={C} cy={C} r={chamferR} fill="none" stroke={STEEL.light} strokeWidth={mm(1.4)} />
      <CircleFacet r={chamferR - FACET_PX / 2} bright={chamF.bright} dark={chamF.dark} />
      {/* A bore, so its lit arc is the far wall. */}
      <circle cx={C} cy={C} r={seatR} fill={STEEL.dark} />
      <CircleFacet r={seatR - FACET_PX / 2} bright={seatF.bright} dark={seatF.dark} inner />
      <StepShadow r={seatR} width={mm(0.9)} opacity={0.3} />
      <circle cx={C} cy={C} r={apertureR} fill={RECESS} />
      <CircleFacet r={apertureR - FACET_PX / 2} bright={shift(RECESS, "light", 0.3)} dark={shift(RECESS, "dark", 0.4)} inner />
    </g>
  );
}

/**
 * Crown, seen from directly above: a block standing off the case flank.
 *
 * Diameter is the vendor's own where one is stated (9.6% of crowns say
 * "Crown diameter: 7mm" or 8mm outright) and 7.0mm otherwise. How far it
 * protrudes is not stated by any vendor and was bracketed from
 * photographs at unknown angles, so it stays an estimate.
 */
export function Crown({ shape, tags, m }: { shape: string; tags: readonly string[]; m: WatchMm }) {
  const width = mm(m.crown);
  const out = mm(shape === "crown-chunky" ? 3.4 : shape === "crown-onion" ? 3.2 : 2.8);
  const caseR = mm(m.caseDiameter) / 2;
  // Starts well inside the guard shoulder, so the crown reads as emerging
  // from the case rather than balanced on its edge on a stalk.
  const x0 = caseR - mm(2.4);
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
 * Chapter ring: the band between the insert bore and the dial.
 *
 * Its inner edge OVERLAPS the dial rather than sitting flush with it --
 * 27.7mm bore against a 28.5mm dial on the parts that state both, which
 * is 0.4mm of overhang per side. Drawing it flush left a hairline seam
 * exactly where the eye goes first.
 */
export function ChapterRing({ shape, tags, m }: { shape: string; tags: readonly string[]; m: WatchMm }) {
  const angled = shape === "ring-angled";
  const outer = mm(m.ringOuter) / 2;
  const inner = mm(m.ringInner) / 2;
  const body = bodyColour(tags, STEEL.mid);
  const marks = inkOn(body);
  const f = facetPair(body, 0.5);

  return (
    <g>
      <path
        d={`M ${C} ${C - outer} A ${outer} ${outer} 0 1 0 ${C} ${C + outer} A ${outer} ${outer} 0 1 0 ${C} ${C - outer} Z
            M ${C} ${C - inner} A ${inner} ${inner} 0 1 1 ${C} ${C + inner} A ${inner} ${inner} 0 1 1 ${C} ${C - inner} Z`}
        fillRule="evenodd"
        fill={body}
      />
      <path d={ticks(inner + mm(0.26), outer - mm(0.85), 60, 5)} stroke={marks} strokeWidth={1.4} opacity={0.66} />
      <path d={ticks(inner + mm(0.26), outer - mm(0.26), 12)} stroke={marks} strokeWidth={2.4} opacity={0.92} />
      <CircleFacet r={outer - FACET_PX / 2} bright={f.bright} dark={f.dark} />
      <CircleFacet r={inner + FACET_PX / 2} bright={shift(body, "light", angled ? 0.38 : 0.28)} dark={shift(body, "dark", 0.45)} inner />
    </g>
  );
}

/** Bezel ring and its insert. The annulus is sized; the printing is the shape. */
export function BezelAndInsert({ shape, tags, m }: { shape: string; tags: readonly string[]; m: WatchMm }) {
  // Inside the case rim, not flush with it. Drawn edge to edge the bezel
  // covered every pixel of case top surface, which left the lugs attached
  // to nothing visible.
  const outerR = mm(m.caseDiameter) / 2 - mm(1.1);
  const io = mm(m.insertOuter) / 2;
  const ii = mm(m.insertInner) / 2;
  const body = bodyColour(tags, "#22242a");
  const ink = inkOn(body);
  const ringF = facetPair(STEEL.body);
  const insF = facetPair(body, 0.55);

  // A 24-hour scale reads twice round, a count-up dive scale once, and a
  // plain insert carries nothing but the pip.
  const majors = shape === "insert-gmt" ? 24 : shape === "insert-plain" ? 0 : 12;
  const minors = shape === "insert-plain" ? 0 : 60;

  return (
    <g>
      {/* One path, not sixty <line> elements. Identical output, and it
          keeps a page of ten previews to a few hundred DOM nodes rather
          than a few thousand -- which is worth six Lighthouse points. */}
      <path d={ticks(outerR - mm(1), outerR, 60)} stroke={shift(STEEL.body, "dark", 0.35)} strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
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
        <path d={ticks(ii + mm(0.5), io - mm(1.3), minors, majors ? 60 / majors : 0)} stroke={ink} strokeWidth={1.3} opacity={0.55} />
      )}
      {majors > 0 && (
        <path d={ticks(ii + mm(0.6), io - mm(0.9), majors, 0, true)} stroke={ink} strokeWidth={3.2} strokeLinecap="round" />
      )}
      <CircleFacet r={io - FACET_PX / 2} bright={insF.bright} dark={insF.dark} />
      <CircleFacet r={ii + FACET_PX / 2} bright={insF.bright} dark={insF.dark} inner />
      {/* The insert stands above the chapter ring, so it throws a shadow
          down into its own bore. Drawn here rather than with the ring
          because the insert is painted last. */}
      <StepShadow r={ii} width={mm(0.85)} opacity={0.26} />
      <circle cx={C} cy={C - ii - (io - ii) * 0.62} r={mm(1.0)} fill={ink} />
    </g>
  );
}

/**
 * Strap or bracelet, seen from directly above.
 *
 * WHY THIS IS DRAWN AT ALL
 *
 * From this angle a strap is two stubs disappearing behind the lugs, and
 * that is genuinely thin -- assemble.watch shows exactly that and no more.
 * It is drawn anyway for three reasons. The strap is a priced slot, and a
 * build page that charges for a part it never shows is inconsistent with
 * every other slot. It is the second largest block of colour on a build
 * after the dial, and colour is the thing a buyer is actually choosing.
 * And without it the lugs point at nothing, which is what made them read
 * as free-floating tabs in the first place.
 *
 * Strap and bracelet DO differ at this angle, which is why they are
 * separate silhouettes rather than one recoloured stub: a bracelet fills
 * the lug gap in steel and breaks into links across its width, a band sits
 * a little inside the gap with stitching down its length, and a NATO
 * passes under the case as one continuous strip. Drawn first, so the case
 * covers the end that tucks under it.
 */
export function Strap({ shape, tags, m, reach }: { shape: string; tags: readonly string[]; m: WatchMm; reach: number }) {
  const gap = mm(m.lugWidth);
  const from = mm(m.caseDiameter) / 2 - mm(2.5);
  const bracelet = shape === "strap-bracelet";
  const nato = shape === "strap-nato";
  const body = bracelet ? metalColour(tags) : bodyColour(tags, "#3b3733");
  const f = facetPair(body, bracelet ? 0.4 : 0.26);
  const w = nato ? gap : bracelet ? gap : gap - mm(1.2);
  const ink = shift(body, "light", 0.3);

  const arm = (sign: number) => {
    const y0 = sign < 0 ? -reach : from;
    const h = reach - from;
    return (
      <g key={sign}>
        <rect x={C - w / 2} y={C + y0} width={w} height={h} rx={bracelet ? mm(0.4) : mm(1.1)} fill={body} />
        <RectFacet x={C - w / 2} y={C + y0} w={w} h={h} bright={f.bright} dark={f.dark} width={FACET_PX * 0.8} />
        {bracelet
          ? // Link seams run ACROSS a bracelet, and the centre link is
            // narrower than the outers -- the two things that read as
            // "bracelet" rather than "band" at this size.
            [0.3, 0.62, 0.94].map((t) => (
              <rect key={t} x={C - w / 2} y={C + y0 + h * t} width={w} height={mm(0.34)} fill={shift(body, "dark", 0.34)} />
            ))
          : // Stitching runs ALONG a band, inset from both edges.
            !nato && [-1, 1].map((s) => (
              <rect key={s} x={C + s * (w / 2 - mm(1.1)) - mm(0.2)} y={C + y0} width={mm(0.4)} height={h} fill={ink} opacity={0.55} />
            ))}
        {bracelet && (
          <rect x={C - w * 0.17} y={C + y0} width={w * 0.34} height={h} fill={shift(body, "light", 0.08)} />
        )}
      </g>
    );
  };

  return (
    <g>
      {arm(-1)}
      {arm(1)}
      {/* The strip passing under the case is invisible from above, so what
          actually distinguishes a NATO at this angle is its keepers: two
          bands sitting ON the lower arm, which nothing else has. */}
      {nato &&
        [0.42, 0.62].map((t) => (
          <g key={t}>
            <rect x={C - w / 2 - mm(0.35)} y={C + from + (reach - from) * t} width={w + mm(0.7)} height={mm(2.0)} rx={mm(0.3)} fill={shift(body, "light", 0.12)} />
            <RectFacet x={C - w / 2 - mm(0.35)} y={C + from + (reach - from) * t} w={w + mm(0.7)} h={mm(2.0)} bright={f.bright} dark={f.dark} width={FACET_PX * 0.55} />
          </g>
        ))}
    </g>
  );
}
