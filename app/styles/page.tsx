import type { Metadata } from "next";
import Link from "next/link";
import { STYLE_BUILDS } from "@/data/fixtures/style-builds";
import { loadCatalog } from "@/lib/catalog";
import { buildView, resolveByName } from "@/lib/build-view";
import { StaticPreview } from "@/components/StaticPreview";
import { formatGbp } from "@/lib/money";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Build styles — Modbench",
  description:
    "Ten curated Seiko mod builds, one per recognisable look, each checked for fitment and priced across four vendors. Open any of them in the configurator and change what you like.",
};

export default function StylesIndex() {
  const catalog = loadCatalog();
  const styles = STYLE_BUILDS.map((style) => {
    const { parts, unresolved } = resolveByName(catalog, style.partNames);
    return { style, view: buildView(parts, unresolved) };
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1100px] items-baseline gap-4 px-6 py-3">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">Modbench</Link>
          <span className="text-[13px] text-graphite">Styles</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1100px] px-6 py-10">
        <h1 className="text-[26px] font-semibold tracking-tight">Ten looks, ten working builds</h1>
        <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-graphite">
          Every one is a real parts list that passes the compatibility checks, priced across the vendors that stock
          it. Open one and change whatever you like — nothing here is a fixed product.
        </p>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {styles.map(({ style, view }) => (
            <li key={style.slug} className="border border-rule bg-card p-4">
              <Link href={`/styles/${style.slug}`} className="block">
                <StaticPreview layers={view.layers} alt={`Flat diagram of the ${style.title} build`} />
                <h2 className="mt-3 text-[15px] font-semibold">{style.title}</h2>
                <p className="num mt-1 text-[13px] tabular-nums text-graphite">
                  {formatGbp(view.totals.grandTotalMinorLow)} · {view.totals.groups.length}{" "}
                  {view.totals.groups.length === 1 ? "vendor" : "vendors"}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-graphite">{style.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
