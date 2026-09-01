"use client";

import type { Finding, SlotKey } from "@/lib/compat";
import type { CatalogSlice } from "@/lib/compat";
import { ASSEMBLY_ORDER } from "./types";

// The signature element (specs/DESIGN-PLAN.md): the assembly sequence
// rendered as a caliper graduation rather than a list of slots. Numbering
// is honest here because watch assembly genuinely IS a sequence -- the
// order carries information the reader needs.
export function SlotRail({
  build,
  parts,
  activeSlot,
  onActivate,
  onClear,
  findings,
}: {
  build: { parts: Partial<Record<SlotKey, string>> };
  parts: CatalogSlice["parts"];
  activeSlot: SlotKey;
  onActivate: (slot: SlotKey) => void;
  onClear: (slot: SlotKey) => void;
  findings: Finding[];
}) {
  const errorSlots = new Set(findings.filter((f) => f.severity === "error").flatMap((f) => f.slots));
  const warnSlots = new Set(findings.filter((f) => f.severity === "warning").flatMap((f) => f.slots));

  return (
    <nav aria-label="Assembly sequence" className="bg-card">
      <h2 className="border-b border-rule px-5 py-3 text-[13px] font-semibold">Assembly</h2>
      <ol className="rail-scale py-2">
        {ASSEMBLY_ORDER.map(({ slot, label, hint }, i) => {
          const partId = build.parts[slot];
          const part = partId ? parts[partId] : null;
          const isActive = slot === activeSlot;
          const hasError = errorSlots.has(slot);
          const hasWarn = !hasError && warnSlots.has(slot);

          // State is carried by tick SHAPE as well as colour, so it reads
          // without relying on colour alone (spec requirement).
          const tick = hasError
            ? "bg-ruby border-ruby"
            : part
              ? "bg-brass border-brass"
              : "bg-card border-rule-strong";

          return (
            <li key={slot} className="relative">
              <button
                type="button"
                onClick={() => onActivate(slot)}
                data-rail-active={isActive ? "" : undefined}
                aria-current={isActive ? "true" : undefined}
                className={`group flex w-full items-start gap-3 py-2 pr-4 pl-5 text-left transition-colors ${
                  isActive ? "bg-brass-tint" : "hover:bg-paper"
                }`}
              >
                <span className="num w-4 shrink-0 pt-[3px] text-[11px] text-graphite tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden
                  className={`mt-[6px] size-[9px] shrink-0 rounded-full border-2 ${tick}`}
                  style={{ marginLeft: "-13px" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`text-[13px] ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
                    {hasError && <span className="text-[11px] font-medium text-ruby">blocked</span>}
                    {hasWarn && <span className="text-[11px] font-medium text-amber">check</span>}
                  </span>
                  {part ? (
                    <span className="mt-0.5 block truncate text-[12px] text-graphite" title={part.name}>
                      {part.name}
                    </span>
                  ) : (
                    // Empty slots are an invitation, not a void (spec).
                    <span className="mt-0.5 block text-[12px] text-graphite/80">{hint}</span>
                  )}
                </span>
              </button>
              {part && (
                <button
                  type="button"
                  onClick={() => onClear(slot)}
                  className="absolute top-2 right-2 rounded px-1.5 py-0.5 text-[11px] text-graphite opacity-0 transition-opacity group-hover:opacity-100 hover:bg-paper hover:text-ink focus-visible:opacity-100"
                  aria-label={`Clear ${label}`}
                >
                  Clear
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
