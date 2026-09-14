// Hand silhouettes for the illustrated preview.
//
// Proportions are the ones measured off a vendor photograph during the
// shading investigation: boss, shaft and lobe widths were measured at 40
// stations along each hand and cross-checked against the vendor's stated
// lengths, which agreed to within 2%.
//
// Pivot-to-tip length is now the vendor's own where one is stated -- 14.2%
// of hand sets print an "H / M / S" triple in their listing -- and the
// modal stated triple otherwise. The 9.0mm hour reach this file used to
// carry was an assumption; 45 of the 62 sets that state a length say 8.5.
//
// Each silhouette is a different outline over the same skeleton, so a
// sword hand and a dauphine hand sit on the same pivot at the same reach
// and only their edges differ.

import { C, mm, type WatchMm } from "./geometry";
import { FACET_PX, litSideOf } from "./facets";
import { STEEL, metalColour } from "./palette";

/** Measured: widths and feature positions, in millimetres. */
const D = {
  hour: { boss: 2.58, shaft: 1.49, lobe: 3.09, lobeAt: 5.9, tail: 1.13 },
  minute: { boss: 2.13, shaft: 1.55, tail: 1.03 },
  second: { shaft: 0.28, disc: 1.39, discAt: 7.7, tail: 3.4, tailDisc: 0.93 },
} as const;

export type HandRole = "hour" | "minute" | "second";

interface HandProps {
  shape: string;
  role: HandRole;
  angle: number;
  metal: string;
  lume: string;
  /** Pivot-to-tip reach for this hand, in canvas pixels. */
  reach: number;
}

/** Narrow chamfer down each long edge, bright toward the light. */
function Bevel({ w, top, bottom, angle, metal }: { w: number; top: number; bottom: number; angle: number; metal: string }) {
  const strip = Math.min(FACET_PX, w * 0.42);
  const lit = litSideOf(angle) > 0;
  return (
    <>
      <rect x={lit ? w / 2 - strip : -w / 2} y={top} width={strip} height={bottom - top} fill={shiftHex(metal, 1)} />
      <rect x={lit ? -w / 2 : w / 2 - strip} y={top} width={strip * 0.72} height={bottom - top} fill={shiftHex(metal, -1)} />
    </>
  );
}

function shiftHex(hex: string, dir: 1 | -1): string {
  const n = parseInt(hex.slice(1), 16);
  const t = dir === 1 ? 0.45 : 0.32;
  const target = dir === 1 ? 255 : 0;
  const ch = (sh: number) => Math.round((((n >> sh) & 255) * (1 - t) + target * t));
  return "#" + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, "0")).join("");
}

/**
 * The outline for one silhouette, in local coordinates where the pivot is
 * the origin and the tip is at negative y.
 */
function outline(shape: string, reach: number, w: number, tail: number): string {
  const t = tail;
  switch (shape) {
    case "hand-dauphine":
      // Two long facets meeting at a point; widest a third of the way out.
      return `0,${-reach} ${w * 0.75},${-reach * 0.62} ${w / 2},${t} ${-w / 2},${t} ${-w * 0.75},${-reach * 0.62}`;
    case "hand-syringe":
      // Parallel tube that steps in near the tip.
      return `0,${-reach} ${w * 0.34},${-reach * 0.9} ${w * 0.34},${-reach * 0.5} ${w / 2},${-reach * 0.44} ${w / 2},${t} ${-w / 2},${t} ${-w / 2},${-reach * 0.44} ${-w * 0.34},${-reach * 0.5} ${-w * 0.34},${-reach * 0.9}`;
    case "hand-arrow":
      // Broad arrowhead on a narrow shaft.
      return `0,${-reach} ${w * 1.15},${-reach * 0.7} ${w * 0.42},${-reach * 0.7} ${w * 0.42},${t} ${-w * 0.42},${t} ${-w * 0.42},${-reach * 0.7} ${-w * 1.15},${-reach * 0.7}`;
    case "hand-cathedral":
      // Stepped shoulders, widest in the middle third.
      return `0,${-reach} ${w * 0.42},${-reach * 0.86} ${w * 0.8},${-reach * 0.72} ${w * 0.8},${-reach * 0.34} ${w * 0.45},${-reach * 0.24} ${w * 0.45},${t} ${-w * 0.45},${t} ${-w * 0.45},${-reach * 0.24} ${-w * 0.8},${-reach * 0.34} ${-w * 0.8},${-reach * 0.72} ${-w * 0.42},${-reach * 0.86}`;
    case "hand-pencil":
    case "hand-baton":
      // Straight sided, blunt or lightly chamfered tip.
      return `${w * 0.42},${-reach} ${w / 2},${-reach * 0.94} ${w / 2},${t} ${-w / 2},${t} ${-w / 2},${-reach * 0.94} ${-w * 0.42},${-reach}`;
    case "hand-faceted":
      // Snowflake: a broad square-shouldered head on a slim shaft.
      return `0,${-reach} ${w * 0.9},${-reach * 0.78} ${w * 0.9},${-reach * 0.5} ${w * 0.4},${-reach * 0.42} ${w * 0.4},${t} ${-w * 0.4},${t} ${-w * 0.4},${-reach * 0.42} ${-w * 0.9},${-reach * 0.5} ${-w * 0.9},${-reach * 0.78}`;
    case "hand-three-lobe":
    case "hand-sword":
    default:
      // Lance, not a blade: widest around the middle and narrowing toward
      // BOTH the tip and the boss. Drawn with straight flanks before, it
      // tapered only at the tip and read as a plank with a point on it --
      // the clearest silhouette error left after the shading work.
      return [
        `0,${-reach}`,
        `${w * 0.5},${-reach * 0.74}`,
        `${w * 0.62},${-reach * 0.44}`,
        `${w * 0.32},${t}`,
        `${-w * 0.32},${t}`,
        `${-w * 0.62},${-reach * 0.44}`,
        `${-w * 0.5},${-reach * 0.74}`,
      ].join(" ");
  }
}

export function Hand({ shape, role, angle, metal, lume, reach }: HandProps) {
  if (role === "second") {
    const d = D.second;
    const shaft = Math.max(1.6, mm(d.shaft));
    return (
      <g transform={`rotate(${angle} ${C} ${C}) translate(${C} ${C})`}>
        <rect x={-shaft / 2} y={-reach} width={shaft} height={reach + mm(d.tail)} fill={metal} />
        <circle cx={0} cy={-mm(d.discAt)} r={mm(d.disc) / 2} fill={metal} />
        <circle cx={0} cy={-mm(d.discAt)} r={mm(d.disc) / 2 - mm(0.16)} fill={lume} />
        <circle cx={0} cy={mm(d.tail)} r={mm(d.tailDisc) / 2} fill={metal} />
      </g>
    );
  }

  const d = role === "hour" ? D.hour : D.minute;
  const w = mm(d.shaft);
  const boss = mm(d.boss);
  const tail = mm(d.tail);
  const lumeW = w * 0.5;
  const lobe = role === "hour" && shape === "hand-three-lobe" ? mm(D.hour.lobe) : 0;
  const lobeAt = mm(D.hour.lobeAt);

  return (
    <g transform={`rotate(${angle} ${C} ${C}) translate(${C} ${C})`}>
      <polygon points={outline(shape, reach, w, tail)} fill={metal} />
      <Bevel w={w} top={-reach * 0.86} bottom={tail} angle={angle} metal={metal} />
      <rect x={-lumeW / 2} y={-reach * 0.78} width={lumeW} height={reach * 0.78 - boss * 0.3} fill={lume} />
      {lobe > 0 && (
        <>
          <circle cx={0} cy={-lobeAt} r={lobe / 2} fill={metal} />
          <circle cx={0} cy={-lobeAt} r={lobe / 2 - mm(0.22)} fill={lume} />
          {[90, 210, 330].map((a) => (
            <rect key={a} x={-mm(0.16)} y={-lobeAt} width={mm(0.32)} height={lobe / 2 - mm(0.22)} fill={metal} transform={`rotate(${a} 0 ${-lobeAt})`} />
          ))}
        </>
      )}
      <circle cx={0} cy={0} r={boss / 2} fill={metal} />
      <circle cx={0} cy={0} r={boss / 2 - mm(0.4)} fill={lume} />
    </g>
  );
}

/** A full hand set at ten past ten, the arrangement every brand photographs. */
export function HandSet({ shape, tags, m }: { shape: string; tags: readonly string[]; m: WatchMm }) {
  const metal = metalColour(tags);
  const lume = tags.includes("aged-lume") ? "#cdbc94" : tags.includes("black") ? STEEL.lume : "#e6e4d6";
  return (
    <g>
      <Hand shape={shape} role="hour" angle={305} metal={metal} lume={lume} reach={mm(m.hourHand)} />
      <Hand shape={shape} role="minute" angle={62} metal={metal} lume={lume} reach={mm(m.minuteHand)} />
      <Hand shape={shape} role="second" angle={180} metal={metal} lume={lume} reach={mm(m.secondHand)} />
      <circle cx={C} cy={C} r={mm(1.0)} fill={metal} />
    </g>
  );
}
