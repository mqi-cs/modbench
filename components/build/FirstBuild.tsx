"use client";

import { useEffect, useMemo, useState } from "react";
import type { Build, CatalogSlice, SlotKey } from "@/lib/compat";
import { FIRST_BUILD_STEPS, FIRST_BUILD_STYLES, firstBuildOptions, type FirstBuildStyle } from "@/lib/first-build";
import { formatGbp } from "@/lib/money";

// First-build mode (WS3): about five choices, each list already checked by
// the engine against everything chosen so far, so nothing offered here can
// produce an error. The movement is filled in for the user.
export function FirstBuild({
  build,
  catalog,
  onChoose,
}: {
  build: Build;
  catalog: CatalogSlice;
  onChoose: (slot: SlotKey, partId: string) => void;
}) {
  const [style, setStyle] = useState<FirstBuildStyle | null>(null);
  const next = FIRST_BUILD_STEPS.find((s) => !build.parts[s.slot]);
  const options = useMemo(
    () => (style && next ? firstBuildOptions(next.slot, build, catalog, style) : []),
    [style, next, build, catalog],
  );

  // The movement is chosen for the user: the top option, as soon as it's reached.
  useEffect(() => {
    if (style && next?.auto && options[0]) onChoose(next.slot, options[0].partId);
  }, [style, next, options, onChoose]);

  const stepNo = next ? FIRST_BUILD_STEPS.filter((s) => !s.auto).findIndex((s) => s.slot === next.slot) + 2 : null;

  return (
    <section className="border-b border-rule bg-card px-6 py-6" aria-label="First build">
      <h2 className="text-[17px] font-semibold tracking-tight">Never built a watch? Start here</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-graphite">
        Five choices, and every option shown already fits what you&rsquo;ve picked. We choose the movement for you.
      </p>

      {!style ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-[12px] text-graphite">1. Pick a style:</span>
          {FIRST_BUILD_STYLES.map((s) => (
            <button key={s.id} type="button" onClick={() => setStyle(s)} className="border border-rule bg-paper px-3 py-1.5 text-[13px] hover:bg-brass-tint/50">
              {s.label}
            </button>
          ))}
        </div>
      ) : next && !next.auto ? (
        <div className="mt-4">
          <p className="text-[12px] text-graphite">
            {stepNo}. Choose the {next.label.toLowerCase()} <span className="opacity-70">({style.label.toLowerCase()})</span>
          </p>
          {options.length === 0 ? (
            <p className="mt-2 text-[12px] text-amber">Nothing in stock fits what you&rsquo;ve chosen so far. Change an earlier choice in the list below.</p>
          ) : (
            <ul className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
              {options.map((o) => (
                <li key={o.partId}>
                  <button
                    type="button"
                    onClick={() => onChoose(next.slot, o.partId)}
                    className="flex h-full w-full flex-col border border-rule bg-paper p-3 text-left hover:bg-brass-tint/50"
                  >
                    <span className="text-[13px] leading-snug">{o.name}</span>
                    <span className="num mt-1 text-[11px] text-graphite">
                      {formatGbp(o.priceMinorBase)}
                      {o.matchedBracelet ? " · made for this case" : ""}
                      {o.warnings > 0 ? ` · ${o.warnings} to check` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : !next ? (
        <p className="mt-4 text-[13px]">
          That&rsquo;s a complete watch. The assembly checklist is below the summary; anything you change from here is checked the same way.
        </p>
      ) : null}
    </section>
  );
}
