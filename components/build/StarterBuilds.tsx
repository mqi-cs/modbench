"use client";

import type { SlotKey } from "@/lib/compat";
import type { StarterBuild } from "@/data/fixtures/starter-builds";

// Spec: "An empty six-slot grid is intimidating for the audience you
// picked." At 3,451 parts that's more true, not less -- the first screen
// has to be a way in, not an inventory.
export function StarterBuilds({
  starters,
  onOpen,
}: {
  starters: (StarterBuild & { resolved: Partial<Record<SlotKey, string>> })[];
  onOpen: (parts: Partial<Record<SlotKey, string>>) => void;
}) {
  return (
    <section className="border-b border-rule bg-card px-6 py-6" aria-label="Starter builds">
      <h1 className="text-[17px] font-semibold tracking-tight">Start from a build that works</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-graphite">
        Each of these is a real, checked combination. Open one and change anything — the parts that stop fitting will say
        why, rather than quietly disappearing.
      </p>
      <ul className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
        {starters.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s.resolved)}
              className="flex h-full w-full flex-col border border-rule border-l-[3px] border-l-brass bg-paper p-4 text-left hover:bg-brass-tint/50"
            >
              <span className="text-[14px] font-semibold">{s.name}</span>
              <span className="mt-1.5 text-[12px] leading-snug text-graphite">{s.blurb}</span>
              <span className="num mt-3 text-[11px] text-graphite">
                {Object.keys(s.resolved).length} parts ready
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
