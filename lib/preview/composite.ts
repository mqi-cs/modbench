// Turns a build into an ordered list of draw calls.
//
// Pure, per specs/05-phase-4-preview.md: "Keep composite.ts pure and
// testable: it takes a resolved layer list and a canvas context. Asset
// loading and caching live in the component." Nothing here loads an
// image, touches the DOM, or reads the clock -- which is what lets pass
// measure 5 (layer order) and pass measure 3 (missing assets degrade
// gracefully) be tested as arithmetic rather than by looking at pixels.

import { CANVAS, LAYER_ORDER, LAYER_SLOT, type LayerKey } from "./layers";

export type LayerStatus = "drawn" | "placeholder" | "empty";

export interface PreviewLayer {
  key: LayerKey;
  /** Asset URL, or null when nothing can be drawn for this layer. */
  src: string | null;
  status: LayerStatus;
  /** Part id backing this layer, for the placeholder label. */
  partId: string | null;
  /** Shown next to the canvas when status is "placeholder". */
  label: string | null;
}

export interface PreviewInput {
  /** Selected part id per build slot. */
  parts: Partial<Record<string, string>>;
  /** Part ids with a prepared asset. */
  previewable: ReadonlySet<string>;
  /** Display names, for placeholder labels. */
  names: Readonly<Record<string, string>>;
  /** Case platform, deciding which drawn case art to use. */
  platform: string;
  /** True once the build has a case, so the drawn body and bezel apply. */
  hasCase: boolean;
}

export function assetUrl(category: string, partId: string): string {
  return `/assets/${category}/${partId}.webp`;
}

/** Build slot -> the asset directory prepare-assets.ts wrote it to. */
const SLOT_CATEGORY: Record<string, string> = {
  dial: "dial",
  hands: "hands",
  bezelInsert: "bezel_insert",
  chapterRing: "chapter_ring",
};

/**
 * Resolves the build into layers, back to front.
 *
 * A part with no prepared asset yields a `placeholder` layer rather than
 * being dropped. The spec is explicit about why: "never silently omit a
 * layer -- a preview that quietly drops the hands is worse than no
 * preview". A silently missing hands layer would read as "this build has
 * no hands", which is a statement about the build; a labelled placeholder
 * reads as "we have no picture of these hands", which is a statement about
 * us, and only the second one is true.
 */
export function resolveLayers(input: PreviewInput): PreviewLayer[] {
  return LAYER_ORDER.map((key): PreviewLayer => {
    if (key === "glare") {
      return { key, src: input.hasCase ? "/assets/platform/glare.webp" : null, status: input.hasCase ? "drawn" : "empty", partId: null, label: null };
    }
    // Case body and bezel ring are drawn art keyed on the platform, not
    // photographs of the selected part -- so any case at all produces
    // both, and neither can ever be a placeholder.
    if (key === "case" || key === "bezel") {
      const src = input.hasCase ? `/assets/platform/${input.platform}-${key}.webp` : null;
      return { key, src, status: src ? "drawn" : "empty", partId: input.parts[key] ?? null, label: null };
    }

    const slot = LAYER_SLOT[key];
    const partId = slot ? input.parts[slot] : undefined;
    if (!partId) return { key, src: null, status: "empty", partId: null, label: null };

    const category = SLOT_CATEGORY[slot!];
    if (category && input.previewable.has(partId)) {
      return { key, src: assetUrl(category, partId), status: "drawn", partId, label: null };
    }
    return { key, src: null, status: "placeholder", partId, label: input.names[partId] ?? partId };
  });
}

export interface DrawCall {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draw calls for the layers that have an asset.
 *
 * Every prepared asset is already CANVAS-sized and centred on the point it
 * rotates or sits about, so each one draws at the origin at full size.
 * That is a deliberate property of the preparation step: putting the
 * placement maths offline means a slot change is a handful of drawImage
 * calls, which is what keeps the redraw inside the 100ms budget.
 */
export function drawCalls(layers: PreviewLayer[]): DrawCall[] {
  return layers
    .filter((l): l is PreviewLayer & { src: string } => l.status === "drawn" && l.src !== null)
    .map((l) => ({ src: l.src, x: 0, y: 0, width: CANVAS, height: CANVAS }));
}

/** Layers the caller should caption as not previewable. */
export function placeholders(layers: PreviewLayer[]): PreviewLayer[] {
  return layers.filter((l) => l.status === "placeholder");
}

/**
 * Paints the resolved layers onto a context using an already-loaded image
 * for each source.
 *
 * Takes a lookup rather than loading anything itself, so the draw order is
 * testable with stubs and the component keeps ownership of the cache. A
 * source that has not finished decoding is skipped, not waited for --
 * that is what makes the preview progressive as slots fill.
 */
export function paint(
  ctx: {
    clearRect(x: number, y: number, w: number, h: number): void;
    drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void;
  },
  layers: PreviewLayer[],
  images: (src: string) => CanvasImageSource | undefined,
): number {
  ctx.clearRect(0, 0, CANVAS, CANVAS);
  let painted = 0;
  for (const call of drawCalls(layers)) {
    const image = images(call.src);
    if (!image) continue;
    ctx.drawImage(image, call.x, call.y, call.width, call.height);
    painted++;
  }
  return painted;
}
