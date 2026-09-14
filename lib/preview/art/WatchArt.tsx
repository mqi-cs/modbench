// The whole watch, as one SVG.
//
// Replaces the canvas the preview used to draw prepared photo layers on.
// SVG rather than canvas for three reasons that all turned out to matter:
// it server-renders, so a build page still shows a picture with
// JavaScript disabled; sharp can rasterise it directly for the share
// card; and the facet art is vector anyway, so there is nothing to
// pre-bake.
//
// The dial is the one exception and stays a photograph. That is a
// deliberate decision recorded in specs/05-phase-4-preview.md: dial
// photos are the strongest element the preview has, and faking sunburst
// or applied-index texture in flat facets is a much harder, lower-value
// problem than the silhouettes around it.

import { CANVAS, C, mm, watchMm } from "./geometry";
import { CaseBody, BezelAndInsert, ChapterRing, Crown, Strap } from "./parts";
import { HandSet } from "./hands";
import { RingShadow } from "./depth";
import type { ResolvedWatch } from "../composite";

/**
 * Drawn back to front. This order is the physical assembly order and is
 * asserted by a test: an insert must never sit behind the case, and hands
 * must never sit behind the dial.
 */
export function WatchArt({ watch, title }: { watch: ResolvedWatch; title: string }) {
  const { hasCase, dialHref, crown, chapterRing, hands, bezelInsert, strap } = watch;

  // One dimension set for the whole build, resolved once: each part's own
  // stated millimetres where a vendor stated them, the platform default
  // where none did.
  const m = watchMm({
    case: watch.caseMm,
    insert: bezelInsert?.mm,
    ring: chapterRing?.mm,
    crown: crown?.mm,
    hands: hands?.mm,
  });

  // Millimetres map to pixels through one fixed constant so prepared dial
  // photos always land at the right size. A case wider than the 46mm the
  // constant was set from would then run its lugs off the edge, so the
  // VIEWBOX opens up instead -- same pixel space, just more of it shown.
  const span = Math.max(CANVAS, mm(m.lugToLug) + mm(2.4));
  // The strap runs to the frame edge and is cropped there, rather than
  // the frame growing to contain it. Sizing the frame to the strap made
  // the watch shrink the moment one was chosen, which in a configurator
  // reads as a glitch -- every other slot leaves the scale alone.
  const strapReach = span / 2;
  const o = (CANVAS - span) / 2;

  return (
    <svg
      viewBox={`${o.toFixed(1)} ${o.toFixed(1)} ${span.toFixed(1)} ${span.toFixed(1)}`}
      className="h-full w-full"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      {strap && <Strap shape={strap.shape} tags={strap.tags} m={m} reach={strapReach} />}
      {hasCase && <CaseBody m={m} />}
      {hasCase && crown && <Crown shape={crown.shape} tags={crown.tags} m={m} />}
      {dialHref && (
        <image href={dialHref} x={0} y={0} width={CANVAS} height={CANVAS} preserveAspectRatio="xMidYMid meet" />
      )}
      {!dialHref && watch.dialPlaceholder && (
        <circle cx={C} cy={C} r={mm(m.dialAperture) / 2} fill="#2b2d31" />
      )}
      {chapterRing && <ChapterRing shape={chapterRing.shape} tags={chapterRing.tags} m={m} />}
      {chapterRing && <RingShadow m={m} />}
      {hands && <HandSet shape={hands.shape} tags={hands.tags} m={m} />}
      {hasCase && bezelInsert && <BezelAndInsert shape={bezelInsert.shape} tags={bezelInsert.tags} m={m} />}
    </svg>
  );
}
