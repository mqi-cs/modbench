import type { Metadata } from "next";
import Link from "next/link";
import { STYLE_BUILDS } from "@/data/fixtures/style-builds";
import { STARTER_BUILDS } from "@/data/fixtures/starter-builds";
import { loadCatalog } from "@/lib/catalog";
import { buildView, configuratorHref, resolveByName } from "@/lib/build-view";
import { StaticPreview } from "@/components/StaticPreview";
import { Discover } from "@/components/Discover";
import { formatGbp } from "@/lib/money";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Modbench — check Seiko mod parts fit before you order",
  description:
    "Pick a movement, case, dial, hands and bezel across four vendors and see what actually goes together, with the real total including shipping. Incompatible parts stay visible, with the reason.",
};

// Six builds, rendered through the Phase 4 compositor.
// specs/06-phase-5-sharing.md: "Use your own rendered builds, not vendor
// photography." Nothing on this page is a supplier's photograph -- the
// pictures are the same diagrams the configurator draws, which is honest
// about what the tool does and doubles as a check that the preview layer
// still works.
const HERO_SLUGS = ["black-dive-classic", "field-watch", "gmt-traveller", "white-dial-dress", "vintage-diver", "matte-green-utility"];

export default function Home() {
  const catalog = loadCatalog();
  const partCount = Object.keys(catalog.parts).length;
  const vendorCount = catalog.vendors.length;

  const hero = HERO_SLUGS.map((slug) => {
    const style = STYLE_BUILDS.find((s) => s.slug === slug)!;
    const { parts, unresolved } = resolveByName(catalog, style.partNames);
    return { style, view: buildView(parts, unresolved) };
  });

  const firstStarter = STARTER_BUILDS[0]!;
  const starterHref = configuratorHref(resolveByName(catalog, firstStarter.partNames).parts);

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1100px] items-baseline gap-4 px-6 py-3">
          <span className="text-[15px] font-semibold tracking-tight">Modbench</span>
          <Link href="/styles" className="ml-auto text-[13px] text-graphite hover:text-ink">Styles</Link>
          <Link href="/build" className="text-[13px] text-graphite hover:text-ink">Configurator</Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1100px] px-6 pt-14 pb-10">
          <h1 className="max-w-[20ch] text-[38px] font-semibold leading-[1.1] tracking-tight">
            Find out whether the parts fit before you spend £300 finding out.
          </h1>
          <p className="mt-4 max-w-prose text-[16px] leading-relaxed text-graphite">
            Modbench checks Seiko mod parts against each other across {vendorCount} vendors — {partCount.toLocaleString("en-GB")}{" "}
            of them — and shows the real total, including per-vendor shipping and the tools you&rsquo;ll need. Parts that
            won&rsquo;t work stay on screen with the reason, because &ldquo;this dial is greyed out&rdquo; teaches you nothing.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/build" className="border border-ink bg-ink px-4 py-2 text-[14px] font-medium text-paper hover:bg-graphite">
              Start from scratch
            </Link>
            <Link href={starterHref} className="border border-rule-strong bg-card px-4 py-2 text-[14px] font-medium hover:border-ink">
              Start from a template
            </Link>
            <Link href="/styles" className="border border-rule-strong bg-card px-4 py-2 text-[14px] font-medium hover:border-ink">
              Browse styles
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-[1100px] px-6 pb-10">
          <Discover />
        </section>

        <section className="mx-auto max-w-[1100px] px-6 pb-14" aria-label="Example builds">
          {/* One caption for the whole grid. Repeated per card it becomes
              wallpaper, and the honesty requirement needs it read. */}
          <p className="mb-4 text-[12px] text-graphite">
            <span className="font-medium text-ink">These are diagrams, not photographs.</span> Every picture on this
            page is drawn from the parts in the build — shapes and colours are approximate and real finishes vary.
          </p>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {hero.map(({ style, view }) => (
              <li key={style.slug} className="border border-rule bg-card p-4">
                <Link href={`/styles/${style.slug}`} className="block">
                  <StaticPreview layers={view.layers} alt={`Flat diagram of the ${style.title} build`} caption={false} />
                  <h2 className="mt-3 text-[15px] font-semibold">{style.title}</h2>
                  <p className="num mt-1 text-[13px] tabular-nums text-graphite">
                    {formatGbp(view.totals.grandTotalMinorLow)} · {view.totals.groups.length}{" "}
                    {view.totals.groups.length === 1 ? "vendor" : "vendors"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t border-rule bg-card">
          <div className="mx-auto max-w-[1100px] px-6 py-12">
            <h2 className="text-[20px] font-semibold tracking-tight">What the compatibility check actually promises</h2>
            <div className="mt-4 grid max-w-4xl gap-6 md:grid-cols-2">
              <p className="text-[14px] leading-relaxed text-graphite">
                One rule matters more than the rest: <span className="text-ink">nothing is marked compatible unless it is</span>.
                Where a vendor hasn&rsquo;t published the measurement a check needs — and for some things, none of them
                have — you get a warning saying so, never a silent pass. That means you will occasionally be warned
                about a pairing that turns out fine. That trade is deliberate.
              </p>
              <p className="text-[14px] leading-relaxed text-graphite">
                Every rule is written from vendor fitment notes and caliber documentation, and each one tells you the
                verdict and the reason separately, so you can judge it yourself. Prices are converted to sterling once,
                at ingest, at a recorded rate — the number you see is the number the vendor charges, not a live
                estimate.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule px-6 py-8 text-center text-[12px] text-graphite">
        Previews are diagrams, not photographs. Modbench is not affiliated with Seiko or with any parts vendor.
      </footer>
    </div>
  );
}
