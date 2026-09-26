"use client";

import type { AssemblyPlan } from "@/lib/assembly";
import { formatGbp } from "@/lib/money";

// The assembly plan as a beginner's checklist. The plan is plain data
// (lib/assembly.ts), so a shop's work order can render the same object.
export function AssemblyChecklist({ plan }: { plan: AssemblyPlan }) {
  return (
    <section className="bg-card px-5 py-4" aria-label="Assembly checklist">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold">How to put it together</h2>
        <span className="num text-[11px] text-graphite" title={plan.difficultyReasons.join(", ")}>
          difficulty {plan.difficulty}/5
        </span>
      </div>
      <ol className="mt-2 space-y-2">
        {plan.steps.map((s, i) => (
          <li key={s.id} className={`border-l-[3px] pl-2.5 ${s.irreversible ? "border-l-ruby" : "border-l-rule"}`}>
            <label className="flex items-start gap-2 text-[12px] leading-snug">
              <input type="checkbox" className="mt-0.5" />
              <span>
                <span className="num text-graphite">{i + 1}.</span> {s.title}
                {s.irreversible && <span className="ml-1.5 text-[11px] font-semibold text-ruby">Can&rsquo;t be undone</span>}
                <span className="mt-0.5 block text-[11px] text-graphite">{s.detail}</span>
                {s.tools.length > 0 && <span className="num mt-0.5 block text-[10px] text-graphite">{s.tools.join(", ").replace(/-/g, " ")}</span>}
              </span>
            </label>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11px] text-graphite">
        Tools, if you have none: <span className="num">£{plan.toolCostGbp.min}–£{plan.toolCostGbp.max}</span>
        {plan.totalMinor && (
          <>
            {" "}
            · whole build with tools:{" "}
            <span className="num">
              {plan.totalMinor.low === plan.totalMinor.high ? formatGbp(plan.totalMinor.low) : `${formatGbp(plan.totalMinor.low)}–${formatGbp(plan.totalMinor.high)}`}
            </span>
          </>
        )}
      </p>
    </section>
  );
}
