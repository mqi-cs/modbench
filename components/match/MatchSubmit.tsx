"use client";

import { useCallback, useState } from "react";
import type { SubmissionResult } from "@/lib/dedup/service";

const BLANK = ["", ""];

/**
 * Paste two or more vendor links for what you believe is one part.
 *
 * The screen is deliberately blunt about what a submission is. Every path
 * out of it says "candidate", never "merged", because a merge deletes a
 * parts row and asserts two listings are one object -- if someone comes
 * away thinking they just changed the catalog, the feature has lied to
 * them.
 */
export function MatchSubmit() {
  const [urls, setUrls] = useState<string[]>(BLANK);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const filled = urls.map((u) => u.trim()).filter(Boolean);
      if (filled.length < 2) {
        setError("Two links at least — that's the claim.");
        return;
      }
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch("/api/match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ urls: filled, note: note.trim() || null }),
        });
        const data = await response.json();
        if (!response.ok && response.status !== 200) {
          setError(data.error ?? "Something went wrong.");
          setResult(null);
        } else {
          setResult(data as SubmissionResult);
        }
      } catch {
        setError("Couldn't reach the server. Nothing was recorded.");
      } finally {
        setStatus("idle");
      }
    },
    [urls, note],
  );

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        {urls.map((url, i) => (
          <div key={i}>
            <label htmlFor={`url-${i}`} className="block text-[13px] font-medium">
              Product link {i + 1}
            </label>
            <input
              id={`url-${i}`}
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrls(urls.map((u, j) => (j === i ? e.target.value : u)))}
              placeholder="https://vendor.com/products/…"
              className="mt-1 w-full border border-rule bg-card px-3 py-2 text-[14px]"
            />
          </div>
        ))}

        {urls.length < 6 && (
          <button type="button" onClick={() => setUrls([...urls, ""])} className="text-[13px] text-graphite underline">
            Add another link
          </button>
        )}

        <div>
          <label htmlFor="note" className="block text-[13px] font-medium">
            How do you know? <span className="font-normal text-graphite">Optional, but it's what a reviewer reads first.</span>
          </label>
          <textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Same part number on the back, bought both, identical packaging…"
            className="mt-1 w-full border border-rule bg-card px-3 py-2 text-[14px]"
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="border border-rule-strong bg-card px-4 py-2 text-[14px] font-medium hover:border-ink disabled:opacity-50"
        >
          {status === "loading" ? "Checking…" : "Submit as a candidate"}
        </button>
      </form>

      {error && <p className="text-[14px] text-danger">{error}</p>}
      {result && <Outcome result={result} />}
    </div>
  );
}

function Outcome({ result }: { result: SubmissionResult }) {
  const unresolved = result.resolved.filter((r) => !r.part);
  return (
    <div className="space-y-5 border-t border-rule pt-5">
      {result.candidateId ? (
        <div className="border border-rule bg-card p-4">
          <p className="text-[14px] font-medium">Recorded as candidate {result.candidateId}.</p>
          <p className="mt-1 text-[13px] text-graphite">
            Nothing in the catalog has changed. A person reads this before anything is merged — merging deletes a part
            and says two listings are one object, so it isn&apos;t done automatically.
          </p>
        </div>
      ) : (
        result.rejected && (
          <div className="border border-rule bg-card p-4">
            <p className="text-[14px] font-medium">Not recorded.</p>
            <p className="mt-1 text-[13px] text-graphite">{result.rejected}</p>
          </div>
        )
      )}

      {unresolved.length > 0 && (
        <div>
          <h2 className="text-[14px] font-semibold">Links that didn&apos;t resolve</h2>
          <ul className="mt-2 space-y-2">
            {unresolved.map((r) => (
              <li key={r.submitted} className="text-[13px]">
                <span className="break-all font-mono text-[12px]">{r.submitted}</span>
                <span className="block text-graphite">{r.problem}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(result.phashDistance !== null || result.colour) && (
        <div>
          <h2 className="text-[14px] font-semibold">What we can check automatically</h2>
          <ul className="mt-2 space-y-1 text-[13px] text-graphite">
            {result.phashDistance !== null && (
              <li>
                Images agree to <span className="num tabular-nums">{result.phashDistance}</span>/256 after
                normalisation{result.phashDistance <= 40 ? " — close enough to be worth a look." : " — further apart than most confirmed matches."}
              </li>
            )}
            {result.colour === "differ" && (
              <li>
                Colour tags disagree. That usually means the same model in a different finish, which is two parts, not
                one.
              </li>
            )}
            {result.colour === "unknown" && <li>One side has no colour tag, so finish is unchecked.</li>}
            {result.colour === "agree" && <li>Colour tags agree.</li>}
          </ul>
        </div>
      )}

      {result.suggestions.length > 0 && (
        <div>
          <h2 className="text-[14px] font-semibold">Others that might be the same thing</h2>
          <p className="mt-1 text-[13px] text-graphite">
            Add any of these to your claim by pasting their link above. Each shows why it&apos;s here.
          </p>
          <ul className="mt-3 space-y-3">
            {result.suggestions.map((s) => (
              <li key={s.part.id} className="border border-rule bg-card p-3">
                <p className="text-[14px]">{s.part.name}</p>
                <p className="text-[12px] text-graphite">{s.part.vendorKey}</p>
                <ul className="mt-1 list-disc pl-4 text-[12px] text-graphite">
                  {s.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
