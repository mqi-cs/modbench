import Link from "next/link";
import { formatGbp, formatNative } from "@/lib/money";
import { ASSEMBLY_ORDER } from "@/components/build/types";
import type { BuildView } from "@/lib/build-view";
import { configuratorHref } from "@/lib/build-view";
import { WatchPreview } from "./build/WatchPreview";

const SLOT_LABEL = Object.fromEntries(ASSEMBLY_ORDER.map((s) => [s.slot, s.label]));

/**
 * The read-only view of a build, shared by /b/[id] and /styles/[slug].
 *
 * Entirely server-rendered: no "use client", no canvas, no fetch. Pass
 * measure 8 requires the parts list and total to be in the HTML with
 * JavaScript disabled, and the cheapest way to guarantee that is for
 * there to be no client component in the tree at all.
 */
export function BuildReadout({ view, title, blurb }: { view: BuildView; title: string; blurb?: string }) {
  const { totals, result, preview, catalog, build } = view;
  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warning");

  return (
    <div className="mx-auto grid max-w-[1100px] gap-px bg-rule md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="bg-card p-6">
        <WatchPreview input={preview} title={`Diagram of ${title}`} />
      </section>

      <section className="bg-card p-6">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {blurb && <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-graphite">{blurb}</p>}

        <p className="num mt-5 text-[28px] font-semibold tabular-nums">
          {formatGbp(totals.grandTotalMinorLow)}
          {totals.grandTotalMinorHigh !== totals.grandTotalMinorLow && (
            <span className="text-graphite"> – {formatGbp(totals.grandTotalMinorHigh)}</span>
          )}
        </p>
        <p className="text-[12px] text-graphite">
          {totals.groups.length === 1 ? "One vendor" : `${totals.groups.length} vendors`}, parts{" "}
          {formatGbp(totals.partsSubtotalMinorBase)} + shipping {formatGbp(totals.shippingTotalMinor)}
          {totals.toolsMinorHigh > 0 && <> + tools {formatGbp(totals.toolsMinorLow)}–{formatGbp(totals.toolsMinorHigh)}</>}
          {catalog.fxAsOf && <> · non-GBP prices converted at rates from {catalog.fxAsOf}</>}
        </p>

        <Link
          href={configuratorHref(build.parts)}
          className="mt-5 inline-block border border-ink bg-ink px-4 py-2 text-[14px] font-medium text-paper hover:bg-graphite"
        >
          Open in configurator
        </Link>
        <p className="mt-2 text-[12px] text-graphite">
          Opens as a fresh, editable build. This page never changes.
        </p>

        {errors.length > 0 && (
          <div className="mt-6 border border-ruby/40 bg-ruby-tint p-4">
            <h2 className="text-[13px] font-semibold text-ruby">Won&rsquo;t go together</h2>
            <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink">
              {errors.map((f, i) => <li key={i}>{f.message}</li>)}
            </ul>
          </div>
        )}

        {/* Vendor grouping is the headline feature of the totals: the
            number that surprises people is shipping, and it is charged
            per vendor. */}
        {totals.groups.map((group) => (
          <div key={group.vendorKey} className="mt-6">
            <h2 className="flex items-baseline justify-between border-b border-rule pb-1 text-[13px] font-semibold">
              <span>{group.vendorName}</span>
              <span className="num tabular-nums font-normal text-graphite">
                {formatGbp(group.subtotalMinorBase)} + {formatGbp(group.shippingFlatMinor)} shipping
              </span>
            </h2>
            <ul className="divide-y divide-rule">
              {group.items.map((item) => (
                <li key={item.partId} className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="text-graphite">{SLOT_LABEL[item.slot] ?? item.slot}</span>{" "}
                    <a href={item.listing.sourceUrl} rel="nofollow noopener" target="_blank" className="underline decoration-rule-strong underline-offset-2 hover:decoration-ink">
                      {catalog.parts[item.partId]?.name ?? item.partId}
                    </a>
                    {!item.listing.inStock && <span className="ml-2 text-[11px] text-amber">out of stock</span>}
                  </span>
                  <span className="num shrink-0 tabular-nums">
                    {formatGbp(item.listing.priceMinorBase)}
                    {item.listing.currency !== "GBP" && (
                      <span className="ml-1 text-[11px] text-graphite">
                        ({formatNative(item.listing.priceMinor, item.listing.currency)})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {result.requiredTools.length > 0 && (
          <div className="mt-6">
            <h2 className="border-b border-rule pb-1 text-[13px] font-semibold">Tools you&rsquo;ll need</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-graphite">
              {result.requiredTools.map((t) => t.replace(/-/g, " ")).join(", ")}.
            </p>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mt-6">
            <h2 className="border-b border-rule pb-1 text-[13px] font-semibold">Worth knowing</h2>
            <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-graphite">
              {warnings.map((f, i) => <li key={i}>{f.message}</li>)}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
