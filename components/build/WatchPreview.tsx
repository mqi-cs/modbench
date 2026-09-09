// The preview, as used by every surface that shows a build.
//
// Server-renderable by design: no "use client", no canvas, no effects.
// The build page has to render its picture with JavaScript disabled
// (specs/06-phase-5-sharing.md pass measure 8), and the cheapest way to
// guarantee that is for the picture to be plain SVG in the HTML.

import { resolveWatch, type ResolveInput } from "@/lib/preview/composite";
import { WatchArt } from "@/lib/preview/art/WatchArt";

export function WatchPreview({
  input,
  title,
  caption = true,
  className = "",
}: {
  input: ResolveInput;
  title: string;
  /**
   * Set false in a grid, where one caption covers every card. Repeating
   * "diagram, not a photo" under every tile turns it into wallpaper, and
   * a disclaimer nobody reads is not doing its job.
   */
  caption?: boolean;
  className?: string;
}) {
  const watch = resolveWatch(input);
  const empty = !watch.hasCase && !watch.dialHref && !watch.hands && !watch.chapterRing && !watch.bezelInsert;

  return (
    <figure className={`m-0 ${className}`}>
      <div className="relative mx-auto aspect-square w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-[13px] text-graphite">
            Pick a case to start the preview.
          </div>
        ) : (
          <WatchArt watch={watch} title={title} />
        )}
      </div>
      {caption && (
        <figcaption className="mt-3 text-[12px] leading-relaxed text-graphite">
          <span className="font-medium text-ink">Diagram, not a photo.</span> Parts are drawn to nominal size from
          their stated dimensions; the dial is the vendor&rsquo;s own photograph. Real finishes vary.
          {watch.dialPlaceholder && watch.dialName && (
            <>
              {" "}
              <span className="text-amber">Dial not shown:</span> no usable vendor photograph of {watch.dialName}. It
              is still in your build and still priced.
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
