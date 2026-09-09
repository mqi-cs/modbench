import { ImageResponse } from "next/og";
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { resolveWatch } from "@/lib/preview/composite";
import { WatchArt } from "@/lib/preview/art/WatchArt";
import { loadBuild } from "@/lib/builds";
import { buildView } from "@/lib/build-view";
import { describeBuild } from "@/lib/build-name";
import { formatGbp } from "@/lib/money";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Modbench build";

export const runtime = "nodejs";

/**
 * Rasterises the preview SVG for the share card.
 *
 * Satori, behind ImageResponse, cannot render an <svg> subtree with the
 * fidelity the art needs, and it cannot decode WebP at all -- so the
 * whole watch is rendered to SVG markup here, handed to sharp, and
 * inlined as a single PNG. The dial photograph has to be embedded as a
 * data URI first, because librsvg resolves no relative or remote hrefs.
 */
async function renderWatchPng(preview: Parameters<typeof resolveWatch>[0]): Promise<string | null> {
  const watch = resolveWatch(preview);
  if (watch.dialHref) {
    const file = `public${watch.dialHref}`;
    if (existsSync(file)) {
      try {
        const png = await sharp(readFileSync(file)).png().toBuffer();
        watch.dialHref = `data:image/png;base64,${png.toString("base64")}`;
      } catch {
        watch.dialHref = null;
      }
    } else {
      watch.dialHref = null;
    }
  }
  try {
    // Imported at call time, not at module scope: Next refuses a static
    // import of react-dom/server from a component module, and this file
    // is one. It only ever runs on the server, where the dynamic form is
    // fine.
    const { renderToStaticMarkup } = await import("react-dom/server");
    const markup = renderToStaticMarkup(<WatchArt watch={watch} title="" />);
    const svg = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"');
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saved = loadBuild(id);

  if (!saved) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f7f8", color: "#15191e", fontSize: 44 }}>
          Build not found
        </div>
      ),
      size,
    );
  }

  const view = buildView(saved.slots);
  const name = describeBuild(view);
  const partCount = Object.keys(saved.slots).length;
  const vendors = view.totals.groups.length;
  const rendered = await renderWatchPng(view.preview);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f7f8", color: "#15191e", padding: 56, alignItems: "center", gap: 48 }}>
        <div style={{ width: 500, height: 500, display: "flex", flexShrink: 0 }}>
          {rendered && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={rendered} width={500} height={500} alt="" />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0, maxWidth: 540 }}>
          <div style={{ fontSize: 22, letterSpacing: 2, color: "#5b646e", display: "flex" }}>MODBENCH</div>
          {/* Satori has no text wrapping or ellipsis to fall back on, so a
              long generated name runs straight off the card. Size is
              stepped down by length and the string is clamped, which is
              cruder than a real layout pass but predictable. */}
          <div style={{ fontSize: name.length > 34 ? 34 : name.length > 24 ? 42 : 52, fontWeight: 600, lineHeight: 1.15, marginTop: 16, display: "flex", flexWrap: "wrap" }}>
            {name.length > 60 ? `${name.slice(0, 57)}...` : name}
          </div>
          <div style={{ fontSize: 64, fontWeight: 600, marginTop: 28, display: "flex" }}>
            {formatGbp(view.totals.grandTotalMinorLow)}
          </div>
          <div style={{ fontSize: 26, color: "#5b646e", marginTop: 10, display: "flex" }}>
            {partCount} parts · {vendors} {vendors === 1 ? "vendor" : "vendors"} · shipping included
          </div>
          <div style={{ fontSize: 22, color: "#5b646e", marginTop: 28, display: "flex" }}>
            Diagram, not a photo — real finishes vary
          </div>
        </div>
      </div>
    ),
    size,
  );
}
