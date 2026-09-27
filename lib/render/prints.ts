// Which print each printed layer uses for a build (WS2c). Pure.
//
// Dial: the vendor's own photo, where one is prepared (public/assets/dial,
// framed at 28.5mm across the renderer's 48.4mm dial UV span). Insert,
// chapter ring and date wheel: generic generated prints (public/render/prints)
// chosen by colour -- no catalog photo of those is usable (inserts are shot
// lume-lit, rings at three-quarters; scripts/3d-test/REPORT.md), so each is
// flagged `generated` and the scene labels it.

import type { Print } from "./scene";

const tagsOf = (a: Record<string, unknown> | undefined) => (Array.isArray(a?.styleTags) ? (a!.styleTags as string[]) : []);

export function printsFor(
  parts: Partial<Record<string, string>>,
  attributes: (id: string) => Record<string, unknown> | undefined,
  hasDialPhoto: (id: string) => boolean,
): Partial<Record<"dial" | "date" | "ring" | "insert", Print>> {
  const out: Partial<Record<"dial" | "date" | "ring" | "insert", Print>> = {};
  if (parts.dial && hasDialPhoto(parts.dial)) {
    out.dial = { src: `/assets/dial/${parts.dial}.webp`, generated: false };
    out.date = { src: "/render/prints/date-skx.webp", generated: true };
  }
  if (parts.bezelInsert) {
    const t = tagsOf(attributes(parts.bezelInsert));
    const c = t.includes("blue") ? "blue" : t.includes("gold-tone") || t.includes("rose-gold") ? "gold" : t.includes("silver-tone") ? "steel" : "black";
    out.insert = { src: `/render/prints/insert-ins-${c}.webp`, generated: true };
  }
  if (parts.chapterRing) {
    const t = tagsOf(attributes(parts.chapterRing));
    const c = t.includes("gold-tone") || t.includes("rose-gold") ? "gold" : t.includes("cream") ? "cream" : "white";
    out.ring = { src: `/render/prints/ring-ring-${c}.webp`, generated: true };
  }
  return out;
}
