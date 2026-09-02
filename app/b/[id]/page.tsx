import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { loadBuild, recordView } from "@/lib/builds";
import { buildView } from "@/lib/build-view";
import { BuildReadout } from "@/components/BuildReadout";
import { formatGbp } from "@/lib/money";
import { describeBuild } from "@/lib/build-name";

// Builds are immutable, so the page can be cached indefinitely. The view
// counter is the only mutable thing here and it is deliberately not worth
// a revalidation.
export const dynamic = "force-static";
export const revalidate = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const saved = loadBuild(id);
  if (!saved) return { title: "Build not found — Modbench" };
  const view = buildView(saved.slots);
  const name = describeBuild(view);
  const total = formatGbp(view.totals.grandTotalMinorLow);
  const description = `${name} — ${Object.keys(saved.slots).length} parts from ${view.totals.groups.length} ${view.totals.groups.length === 1 ? "vendor" : "vendors"}, ${total} including shipping. Checked for fitment before you order.`;
  return {
    title: `${name} — Modbench`,
    description,
    openGraph: { title: name, description, type: "article", url: `/b/${id}` },
    twitter: { card: "summary_large_image", title: name, description },
  };
}

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const saved = loadBuild(id);
  if (!saved) notFound();
  recordView(id);

  const view = buildView(saved.slots);
  const name = describeBuild(view);

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1100px] items-baseline gap-4 px-6 py-3">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">Modbench</Link>
          <span className="text-[13px] text-graphite">Shared build</span>
          <span className="num ml-auto text-[12px] text-graphite">/b/{id}</span>
        </div>
      </header>
      <main className="py-8">
        <BuildReadout view={view} title={name} />
      </main>
    </div>
  );
}
