import { CANVAS } from "@/lib/preview/layers";
import { drawCalls, placeholders, type PreviewLayer } from "@/lib/preview/composite";

/**
 * The Phase 4 preview as stacked images rather than a canvas.
 *
 * Server-rendered on purpose. specs/06-phase-5-sharing.md pass measure 8
 * requires build pages to render fully with JavaScript disabled, and a
 * canvas is blank without it -- the layers are already pre-composited to
 * a common 800x800 frame, so absolutely-positioned <img> elements stack
 * to exactly the same picture with no script at all.
 */
export function StaticPreview({
  layers,
  alt,
  className = "",
  caption = true,
}: {
  layers: PreviewLayer[];
  alt: string;
  className?: string;
  /**
   * Set false in a grid, where one caption covers every card. Repeating
   * "diagram, not a photo" six times down a page turns it into wallpaper,
   * and a disclaimer nobody reads is not doing the job the honesty
   * requirement asks of it -- the grid carries one instead.
   */
  caption?: boolean;
}) {
  const calls = drawCalls(layers);
  const missing = placeholders(layers);

  return (
    <figure className={`m-0 ${className}`}>
      <div className="relative mx-auto aspect-square w-full overflow-hidden" role="img" aria-label={alt}>
        {calls.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-graphite">No preview yet.</div>
        ) : (
          calls.map((call, i) => (
            <img
              key={call.src}
              src={call.src}
              alt=""
              width={CANVAS}
              height={CANVAS}
              // Only the bottom layer is eager: the rest are stacked on
              // top of it and cost nothing visually until it paints.
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="absolute inset-0 h-full w-full"
            />
          ))
        )}
      </div>
      {(caption || missing.length > 0) && (
      <figcaption className="mt-3 text-[12px] leading-relaxed text-graphite">
        {caption && (
          <>
            <span className="font-medium text-ink">Diagram, not a photo.</span> Shapes and colours are approximate,
            parts are drawn flat and to nominal size, and real finishes vary.
          </>
        )}
        {missing.length > 0 && (
          <>
            {" "}
            <span className="text-amber">Not drawn:</span>{" "}
            {missing.map((l) => l.label).join(", ")} — no usable vendor photograph. Still in the build, still priced.
          </>
        )}
      </figcaption>
      )}
    </figure>
  );
}
