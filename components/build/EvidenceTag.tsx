import type { EvidenceTier } from "@/lib/compat";

// WS1 step 6: every finding says how strong the evidence behind it is.
// Plain markup, no client code, so the no-JS shared-build page can use it.
const LABEL: Record<EvidenceTier, { text: string; title: string }> = {
  verified: {
    text: "Verified",
    title: "From the seller's own published specifications, and this check is backed by a real mismatched build quoted from the seller.",
  },
  checked: {
    text: "Checked",
    title: "From the seller's own published specifications; the check itself hasn't yet been confirmed by a real mismatched build.",
  },
  unconfirmed: {
    text: "Unconfirmed",
    title: "Rests on information the seller didn't publish for this exact part: inferred from its product line, a marketplace listing, or your own entry.",
  },
};

export function EvidenceTag({ tier }: { tier?: EvidenceTier }) {
  if (!tier) return null;
  const { text, title } = LABEL[tier];
  return (
    <span title={title} className="ml-1.5 inline-block rounded-sm border border-rule px-1 py-px align-middle text-[10px] font-medium uppercase tracking-wide text-graphite">
      {text}
    </span>
  );
}
