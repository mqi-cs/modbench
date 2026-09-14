import type { Metadata } from "next";
import Link from "next/link";
import { MatchSubmit } from "@/components/match/MatchSubmit";

export const metadata: Metadata = {
  title: "Tell us two listings are the same part — Modbench",
  description:
    "Vendors sell the same physical part under different names. If you know two listings are one part, paste both links and we'll queue it for review.",
};

export default function SubmitMatchPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1100px] items-baseline gap-4 px-6 py-3">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            Modbench
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[680px] px-6 py-10">
        <h1 className="text-[22px] font-semibold tracking-tight">Same part, different listing?</h1>
        <p className="mt-3 text-[14px] text-graphite">
          Four vendors sell a lot of the same physical parts under their own names, and we currently treat every
          vendor&apos;s copy as a separate part. That is why you rarely see a price comparison. Matching them by
          description gets it wrong often enough that we don&apos;t do it automatically — but if you already know two
          listings are the same part, you know something we can&apos;t work out.
        </p>
        <p className="mt-3 text-[14px] text-graphite">
          Paste the links. It goes into a review queue, not the catalog.
        </p>

        <div className="mt-8">
          <MatchSubmit />
        </div>
      </main>
    </div>
  );
}
