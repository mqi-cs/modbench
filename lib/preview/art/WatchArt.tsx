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

import { CANVAS, C, MM, mm } from "./geometry";
import { CaseBody, BezelAndInsert, ChapterRing, Crown } from "./parts";
import { HandSet } from "./hands";
import type { ResolvedWatch } from "../composite";

/**
 * Drawn back to front. This order is the physical assembly order and is
 * asserted by a test: an insert must never sit behind the case, and hands
 * must never sit behind the dial.
 */
export function WatchArt({ watch, title }: { watch: ResolvedWatch; title: string }) {
  const { hasCase, dialHref, crown, chapterRing, hands, bezelInsert } = watch;

  return (
    <svg
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      className="h-full w-full"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      {hasCase && <CaseBody />}
      {hasCase && crown && <Crown shape={crown.shape} tags={crown.tags} />}
      {dialHref && (
        <image href={dialHref} x={0} y={0} width={CANVAS} height={CANVAS} preserveAspectRatio="xMidYMid meet" />
      )}
      {!dialHref && watch.dialPlaceholder && (
        <circle cx={C} cy={C} r={mm(MM.dial) / 2} fill="#2b2d31" />
      )}
      {chapterRing && <ChapterRing shape={chapterRing.shape} tags={chapterRing.tags} />}
      {hands && <HandSet shape={hands.shape} tags={hands.tags} />}
      {hasCase && bezelInsert && <BezelAndInsert shape={bezelInsert.shape} tags={bezelInsert.tags} />}
    </svg>
  );
}
