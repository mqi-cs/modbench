"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Compositor } from "@/lib/render/compositor";
import { resolveScene, type RenderIndex } from "@/lib/render/scene";
import { printsFor } from "@/lib/render/prints";

const DIR = "/render/layers";

// The rendered 3D preview (WS2c): geometry rendered once per shape, prints
// applied here. Falls back to the SVG diagram -- with the reason -- when the
// build can't be drawn this way (case shape not modelled, no dial photo,
// renders missing, no WebGL2).
export function Preview3D({
  parts,
  attributes,
  hasDialPhoto,
  fallback,
}: {
  parts: Partial<Record<string, string>>;
  attributes: (id: string) => Record<string, unknown> | undefined;
  hasDialPhoto: (id: string) => boolean;
  fallback: ReactNode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const comp = useRef<Compositor | null>(null);
  const [index, setIndex] = useState<RenderIndex | null>(null);
  const [view, setView] = useState<"hero" | "top">("hero");
  const [failed, setFailed] = useState<string | null>(null);
  const [swapMs, setSwapMs] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${DIR}/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`render index: ${r.status}`))))
      .then(setIndex)
      .catch((e: Error) => setFailed(e.message));
  }, []);

  const scene = useMemo(
    () =>
      index
        ? resolveScene({ index, view, parts, prints: printsFor(parts, attributes, hasDialPhoto), caseAttributes: parts.case ? attributes(parts.case) : undefined })
        : null,
    [index, view, parts, attributes, hasDialPhoto],
  );

  useEffect(() => {
    if (!scene?.ok || !canvas.current) return;
    let live = true;
    (async () => {
      try {
        if (!comp.current) {
          comp.current = new Compositor(canvas.current!);
          await comp.current.loadLut("/render/agx-lut.png");
          // Dev only: lets the render checks read back exactly what was drawn.
          if (process.env.NODE_ENV !== "production") (window as unknown as { __modbenchPreview?: Compositor }).__modbenchPreview = comp.current;
        }
        const t0 = performance.now();
        await comp.current.setLayers(scene.layers, DIR);
        if (!live) return;
        comp.current.draw();
        setSwapMs(Math.round(performance.now() - t0));
      } catch (e) {
        setFailed((e as Error).message);
      }
    })();
    return () => {
      live = false;
    };
  }, [scene]);

  const reason = failed ?? (scene && !scene.ok ? scene.reason : null);
  if (!index && !failed) return <>{fallback}</>;
  if (reason) {
    return (
      <div>
        {fallback}
        <p className="px-5 pb-3 text-[11px] text-graphite">Diagram shown: rendered preview unavailable ({reason}).</p>
      </div>
    );
  }
  return (
    <figure className="bg-card p-5" aria-label="Rendered preview of the build">
      <div className="mb-2 flex gap-1">
        {(["hero", "top"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`border px-2 py-0.5 text-[11px] ${view === v ? "border-ink" : "border-rule text-graphite"}`}
          >
            {v === "hero" ? "Three-quarter" : "From above"}
          </button>
        ))}
      </div>
      <canvas ref={canvas} className="aspect-square w-full" data-swap-ms={swapMs ?? undefined} />
      <figcaption className="mt-2 space-y-0.5 text-[11px] text-graphite">
        <p className="font-medium text-ink">A rendered illustration, not a photograph of this build.</p>
        {scene?.ok && scene.labels.map((l) => <p key={l}>{l}</p>)}
      </figcaption>
    </figure>
  );
}
