import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { STYLE_BUILDS } from "@/data/fixtures/style-builds";
import { loadCatalog } from "@/lib/catalog";
import { buildView, resolveByName } from "@/lib/build-view";
import { BuildReadout } from "@/components/BuildReadout";

// Fixtures in the repo, so every style page is known at build time.
export function generateStaticParams() {
  return STYLE_BUILDS.map((s) => ({ slug: s.slug }));
}

export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const style = STYLE_BUILDS.find((s) => s.slug === slug);
  if (!style) return { title: "Style not found — Modbench" };
  return {
    title: `${style.title} — Modbench`,
    description: style.summary,
    openGraph: { title: style.title, description: style.summary, type: "article", url: `/styles/${slug}` },
    twitter: { card: "summary_large_image", title: style.title, description: style.summary },
  };
}

export default async function StylePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const style = STYLE_BUILDS.find((s) => s.slug === slug);
  if (!style) notFound();

  const catalog = loadCatalog();
  const { parts, unresolved } = resolveByName(catalog, style.partNames);
  const view = buildView(parts, unresolved);

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1100px] items-baseline gap-4 px-6 py-3">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">Modbench</Link>
          <Link href="/styles" className="text-[13px] text-graphite hover:text-ink">Styles</Link>
        </div>
      </header>

      <main className="py-8">
        <BuildReadout view={view} title={style.title} blurb={style.summary} />

        <section className="mx-auto mt-px max-w-[1100px] bg-card p-6">
          <h2 className="text-[13px] font-semibold">What defines this look</h2>
          <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-graphite">{style.description}</p>
          {unresolved.length > 0 && (
            <p className="mt-4 text-[13px] text-amber">
              {unresolved.length} part{unresolved.length === 1 ? "" : "s"} in this build{" "}
              {unresolved.length === 1 ? "is" : "are"} no longer in the catalog, so{" "}
              {unresolved.length === 1 ? "it has" : "they have"} been left out of the total.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
