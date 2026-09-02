import { ImageResponse } from "next/og";
import { existsSync } from "node:fs";
import sharp from "sharp";
import { loadBuild } from "@/lib/builds";
import { buildView } from "@/lib/build-view";
import { describeBuild } from "@/lib/build-name";
import { formatGbp } from "@/lib/money";
import { drawCalls } from "@/lib/preview/composite";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Modbench build";

export const runtime = "nodejs";

/**
 * The share card: the Phase 4 render, the build's generated name, the
 * total, and the part count.
 *
 * The layers are flattened to a single PNG with sharp rather than being
 * stacked as separate images inside the card. Two reasons, both found by
 * trying the other way: Satori cannot decode WebP, which is the format
 * the prepared assets are stored in, and inlining six 800x800 layers as
 * data URIs put well over a megabyte of base64 through the renderer and
 * killed the response outright.
 */
async function compositePng(sources: string[]): Promise<string | null> {
  const present = sources.filter((src) => existsSync(`public${src}`));
  if (present.length === 0) return null;
  try {
    const png = await sharp({ create: { width: 800, height: 800, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(present.map((src) => ({ input: `public${src}` })))
      .png()
      .toBuffer();
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
  const rendered = await compositePng(drawCalls(view.layers).map((call) => call.src));

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
