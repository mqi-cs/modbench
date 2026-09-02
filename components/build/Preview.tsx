"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Build, SlotKey } from "@/lib/compat";
import { familyPlatform } from "@/lib/compat";
import { CANVAS, DEFAULT_PLATFORM, PLATFORM_GEOMETRY } from "@/lib/preview/layers";
import { drawCalls, paint, placeholders, resolveLayers, type PreviewLayer } from "@/lib/preview/composite";
import { decodePreviewable } from "@/lib/preview/previewable";
import type { Catalog } from "./types";

/**
 * Decoded-image cache, module scope.
 *
 * Shared across mounts and never evicted: the whole catalog's assets come
 * to 34MB, a session touches a few dozen of them, and the point of the
 * cache is that flipping back to a dial you already looked at redraws
 * from memory rather than from the network.
 */
const imageCache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

function load(src: string): Promise<void> {
  if (imageCache.has(src)) return Promise.resolve();
  const existing = pending.get(src);
  if (existing) return existing;
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      pending.delete(src);
      resolve();
    };
    // A missing or undecodable asset resolves too. The layer simply does
    // not paint, which is the same outcome as an unprepared part, and is
    // far better than a preview that never finishes drawing.
    img.onerror = () => {
      pending.delete(src);
      resolve();
    };
    img.src = src;
  });
  pending.set(src, p);
  return p;
}

export interface PreviewHandle {
  toBlob(): Promise<Blob | null>;
}

export function Preview({
  build,
  catalog,
  onExportReady,
}: {
  build: Build;
  catalog: Catalog;
  onExportReady?: (handle: PreviewHandle | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, setRedrawKey] = useState(0);

  const previewable = useMemo(
    () => decodePreviewable(Object.keys(catalog.parts), catalog.previewable),
    [catalog.parts, catalog.previewable],
  );
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, part] of Object.entries(catalog.parts)) out[id] = part.name;
    return out;
  }, [catalog.parts]);

  const platform = useMemo(() => {
    const caseId = build.parts.case;
    const family = caseId ? catalog.parts[caseId]?.family : undefined;
    const p = family ? familyPlatform(family) : null;
    // Only platforms with drawn case art can be used; anything else falls
    // back rather than requesting an asset that was never drawn.
    return p && p in PLATFORM_GEOMETRY ? p : DEFAULT_PLATFORM;
  }, [build.parts.case, catalog.parts]);

  const layers = useMemo<PreviewLayer[]>(
    () =>
      resolveLayers({
        parts: build.parts as Partial<Record<string, string>>,
        previewable,
        names,
        platform,
        hasCase: Boolean(build.parts.case),
      }),
    [build.parts, previewable, names, platform],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    paint(ctx, layers, (src) => imageCache.get(src));
  }, [layers]);

  useEffect(() => {
    redraw();
    // Progressive: paint what is already decoded, then repaint as each
    // remaining asset arrives, rather than holding a blank canvas until
    // the slowest layer loads.
    let cancelled = false;
    for (const call of drawCalls(layers)) {
      if (imageCache.has(call.src)) continue;
      void load(call.src).then(() => {
        if (!cancelled) setRedrawKey((k) => k + 1);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [layers, redraw]);

  useEffect(() => {
    if (!onExportReady) return;
    // Phase 5's share card renders from this. PNG, not WebP: the export is
    // a one-off download rather than 1,200 stored files, so the format
    // trade-off that drove the assets to WebP does not apply.
    onExportReady({
      toBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob(resolve, "image/png");
        }),
    });
    return () => onExportReady(null);
  }, [onExportReady]);

  const missing = placeholders(layers);
  const drawn = drawCalls(layers).length;
  const empty = !build.parts.case && drawn === 0;

  return (
    <section className="bg-card p-5" aria-label="Visual preview">
      <div className="relative mx-auto aspect-square w-full max-w-[320px]">
        <canvas
          ref={canvasRef}
          width={CANVAS}
          height={CANVAS}
          className="h-full w-full"
          role="img"
          aria-label={describe(layers, build)}
        />
        {empty && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[13px] text-graphite">
            Pick a case to start the preview.
          </p>
        )}
      </div>

      {/* The honesty requirement, and deliberately not tucked away: it sits
          directly under the drawing, in the same visual weight as the rest
          of the panel, because someone about to spend £300 must not read
          this as a photograph of what they will receive. */}
      <p className="mt-3 text-[12px] leading-relaxed text-graphite">
        <span className="font-medium text-ink">Diagram, not a photo.</span> Shapes and colours are approximate,
        parts are drawn flat and to nominal size, and real finishes, lume tone and printing vary from what you see
        here.
      </p>

      {missing.length > 0 && (
        <ul className="mt-2 space-y-1 text-[12px] text-graphite">
          {missing.map((layer) => (
            <li key={layer.key}>
              <span className="text-amber">Not drawn:</span> {layer.label} — no usable vendor photograph, so this
              layer is missing from the picture. It is still in your build and still priced.
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Alt text describing what is actually on the canvas.
 *
 * Names the layers that are missing as well as the ones drawn, for the
 * same reason the placeholder list exists: a screen-reader user should not
 * be told this is a picture of a complete watch when two layers could not
 * be drawn.
 */
function describe(layers: PreviewLayer[], build: Build): string {
  const filled = Object.keys(build.parts).length;
  if (filled === 0) return "Empty preview. No parts selected yet.";
  const drawn = layers.filter((l) => l.status === "drawn" && l.key !== "glare").length;
  const missing = layers.filter((l) => l.status === "placeholder");
  const base = `Flat diagram of the build so far, ${drawn} of ${drawn + missing.length} layers drawn.`;
  if (missing.length === 0) return base;
  return `${base} Not drawn: ${missing.map((l) => l.label).join(", ")}.`;
}

export type { SlotKey };
