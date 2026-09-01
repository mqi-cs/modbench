"use client";

import type { Build, BuildResult, CatalogSlice, SlotKey } from "@/lib/compat";
import type { BuildTotals } from "@/lib/pricing";
import { formatGbp, formatNative, formatDate } from "@/lib/money";
import { ASSEMBLY_ORDER } from "./types";

export function BuildSummary({
  build,
  parts,
  fxAsOf,
  result,
  totals,
  includeTools,
  onToggleTools,
  onJumpToSlot,
}: {
  build: Build;
  parts: CatalogSlice["parts"];
  fxAsOf: string | null;
  result: BuildResult;
  totals: BuildTotals;
  includeTools: boolean;
  onToggleTools: () => void;
  onJumpToSlot: (slot: SlotKey) => void;
}) {
  const labelFor = (slot: SlotKey) => ASSEMBLY_ORDER.find((s) => s.slot === slot)?.label ?? slot;
  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warning");
  const infos = result.findings.filter((f) => f.severity === "info");
  const empty = Object.keys(build.parts).length === 0;

  return (
    <aside className="flex flex-col gap-px bg-rule" aria-label="Build summary">
      {/* Status band. Reserved height so the panel never shifts when
          findings change (spec: no layout shift). */}
      <div
        className={`bg-card px-5 py-3 ${
          result.status === "blocked" ? "border-l-[3px] border-l-ruby" : result.status === "ok-with-warnings" ? "border-l-[3px] border-l-amber" : ""
        }`}
      >
        <p className="text-[13px] font-semibold">
          {empty
            ? "No parts chosen yet"
            : result.status === "blocked"
              ? "This build won't go together"
              : result.status === "ok-with-warnings"
                ? "Works, with things to check"
                : "Everything checks out"}
        </p>
        <p className="mt-0.5 text-[12px] text-graphite">
          {empty
            ? "Start from a template above, or pick a movement."
            : `${errors.length} blocking, ${warnings.length} to check, ${infos.length} notes`}
        </p>
      </div>

      {/* VENDOR GROUPING — the strategic core (09-COMPETITIVE-CONTEXT.md),
          not one bullet of eight. A single-vendor tool structurally cannot
          show this. */}
      {totals.groups.length > 0 && (
        <div className="bg-card px-5 py-4">
          <h2 className="text-[13px] font-semibold">
            Order from {totals.groups.length} {totals.groups.length === 1 ? "vendor" : "vendors"}
          </h2>
          <div className="mt-3 space-y-3">
            {totals.groups.map((g) => (
              <div key={g.vendorKey}>
                <div className="flex items-baseline justify-between gap-2 border-b border-rule pb-1">
                  <span className="text-[12px] font-medium">{g.vendorName}</span>
                  <span className="num text-[12px]">{formatGbp(g.subtotalMinorBase)}</span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {g.items.map((i) => (
                    <li key={i.partId} className="flex items-baseline justify-between gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => onJumpToSlot(i.slot)}
                        className="min-w-0 truncate text-left text-graphite hover:text-ink hover:underline"
                        title={parts[i.partId]?.name}
                      >
                        {labelFor(i.slot)}
                      </button>
                      <span className="num shrink-0 text-graphite">
                        {formatGbp(i.listing.priceMinorBase)}
                        <span className="ml-1 opacity-70">{formatNative(i.listing.priceMinor, i.listing.currency)}</span>
                      </span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-2 text-[11px] text-graphite">
                    <span>Shipping</span>
                    <span className="num">{formatGbp(g.shippingFlatMinor)}</span>
                  </li>
                </ul>
              </div>
            ))}
          </div>

          {/* Concrete consolidation savings, in money, naming the swap. */}
          {totals.savings.length > 0 && (
            <div className="mt-4 border-l-[3px] border-l-brass bg-brass-tint px-3 py-2.5">
              <p className="text-[12px] font-semibold text-brass">Consolidation saving</p>
              {totals.savings.map((s) => (
                <p key={`${s.fromVendor}-${s.toVendor}`} className="mt-1 text-[12px] leading-snug">
                  You&rsquo;re paying <span className="num">{formatGbp(s.shippingSavedMinor)}</span> shipping to{" "}
                  {s.fromVendor} for {totals.groups.find((g) => g.vendorKey === s.fromVendor)?.items.length} part
                  {(totals.groups.find((g) => g.vendorKey === s.fromVendor)?.items.length ?? 0) === 1 ? "" : "s"}. The
                  same {(totals.groups.find((g) => g.vendorKey === s.fromVendor)?.items.length ?? 0) === 1 ? "part is" : "parts are"}{" "}
                  available from {s.toVendor}, who you&rsquo;re already ordering from,{" "}
                  {s.extraPartCostMinor === 0 ? (
                    <>at the same price</>
                  ) : s.extraPartCostMinor > 0 ? (
                    <>
                      for <span className="num">{formatGbp(s.extraPartCostMinor)}</span> more
                    </>
                  ) : (
                    <>
                      for <span className="num">{formatGbp(-s.extraPartCostMinor)}</span> less
                    </>
                  )}{" "}
                  — a net saving of <span className="num font-semibold">{formatGbp(s.netSavingMinor)}</span>.
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Totals */}
      {totals.groups.length > 0 && (
        <div className="bg-card px-5 py-4">
          <dl className="space-y-1.5 text-[12px]">
            <Row label="Parts" value={formatGbp(totals.partsSubtotalMinorBase)} />
            <Row label={`Shipping (${totals.groups.length})`} value={formatGbp(totals.shippingTotalMinor)} />
            <div className="flex items-baseline justify-between gap-2">
              <dt className="flex items-center gap-1.5 text-graphite">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={includeTools} onChange={onToggleTools} />
                  Tools
                </label>
                <span className="text-[11px] opacity-70">one-off</span>
              </dt>
              <dd className="num">
                {includeTools ? `${formatGbp(totals.toolsMinorLow)}–${formatGbp(totals.toolsMinorHigh)}` : "—"}
              </dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-rule pt-2">
              <dt className="text-[13px] font-semibold">Total</dt>
              <dd className="num text-[14px] font-semibold">
                {totals.grandTotalMinorLow === totals.grandTotalMinorHigh
                  ? formatGbp(totals.grandTotalMinorLow)
                  : `${formatGbp(totals.grandTotalMinorLow)}–${formatGbp(totals.grandTotalMinorHigh)}`}
              </dd>
            </div>
          </dl>
          {fxAsOf && (
            <p className="mt-2 text-[11px] text-graphite">
              GBP converted from vendor pricing at rates from {formatDate(fxAsOf)}. Vendors charge the native
              amount shown beside each part.
            </p>
          )}
        </div>
      )}

      {/* Warnings panel — always visible, never behind a click (spec). */}
      <div className="min-h-[180px] bg-card px-5 py-4">
        <h2 className="text-[13px] font-semibold">What to know</h2>
        {result.findings.length === 0 ? (
          <p className="mt-2 text-[12px] text-graphite">
            {empty ? "Findings appear here as you pick parts." : "Nothing flagged for this combination."}
          </p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {[...errors, ...warnings, ...infos].map((f, i) => (
              <li
                key={`${f.ruleKey}-${i}`}
                className={`border-l-[3px] pl-2.5 ${
                  f.severity === "error"
                    ? "border-l-ruby"
                    : f.severity === "warning"
                      ? "border-l-amber border-dashed"
                      : "border-l-rule-strong border-dotted"
                }`}
              >
                <p className="text-[12px] leading-snug">{f.message}</p>
                {f.fix && <p className="mt-1 text-[11px] text-graphite">{f.fix}</p>}
                {f.slots.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {f.slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => onJumpToSlot(s)}
                        className="rounded-sm border border-rule px-1.5 py-0.5 text-[10px] text-graphite hover:bg-paper hover:text-ink"
                      >
                        {labelFor(s)}
                      </button>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Required additions — parts the build is missing, distinct from
          parts that don't fit. */}
      {result.requiredAdditions.length > 0 && (
        <div className="bg-card px-5 py-4">
          <h2 className="text-[13px] font-semibold">Also needed</h2>
          <ul className="mt-2 space-y-1">
            {result.requiredAdditions.map((a, i) => (
              <li key={i} className="text-[12px] text-graphite">
                A <span className="num">{a.family}</span> — {a.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {includeTools && result.requiredTools.length > 0 && (
        <div className="bg-card px-5 py-4">
          <h2 className="text-[13px] font-semibold">Tools for this build</h2>
          <ul className="mt-2 flex flex-wrap gap-1">
            {result.requiredTools.map((t) => (
              <li key={t} className="num rounded-sm border border-rule px-1.5 py-0.5 text-[11px] text-graphite">
                {t.replace(/-/g, " ")}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-graphite">
            One-off — if you already own these, untick Tools above to take them out of the total.
          </p>
        </div>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-graphite">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
