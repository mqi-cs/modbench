"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { formatGbp } from "@/lib/money";
import type { SuggestionResult } from "@/lib/suggest-service";

/**
 * Natural-language and image entry.
 *
 * specs/07-phase-6-nl-image-input.md: "Show the parsed constraints back as
 * editable chips. The user must be able to see and correct what was
 * understood before results appear." So the chips are not a summary of the
 * results -- removing one re-queries on exactly what is left, which means
 * the user can always tell the difference between "the catalog has
 * nothing like that" and "it misread you".
 */
export function Discover() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const post = useCallback(async (body: unknown) => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setResult(data as SuggestionResult);
      setStatus("idle");
    } catch {
      // Never a dead end: the configurator link stays on screen.
      setError("Couldn't reach the search. The configurator still works.");
      setStatus("error");
    }
  }, []);

  const removeChip = useCallback(
    (tag: string) => {
      if (!result) return;
      const intent = { ...result.intent, styleTags: result.intent.styleTags.filter((t) => t !== tag) };
      void post({ intent });
    },
    [result, post],
  );

  const onImage = useCallback(
    async (file: File) => {
      setStatus("loading");
      setError(null);
      setImageNote(null);
      const form = new FormData();
      form.append("image", file);
      try {
        const response = await fetch("/api/identify", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "Couldn't read that image.");
          setStatus("error");
          return;
        }
        setResult(data.suggestions as SuggestionResult);
        setImageNote("Read from your photo. The image was processed in memory and not stored.");
        setStatus("idle");
      } catch {
        setError("Couldn't read that image. The configurator still works.");
        setStatus("error");
      }
    },
    [],
  );

  return (
    <section className="border border-rule bg-card p-5" aria-label="Describe what you want">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) void post({ query });
        }}
      >
        <label htmlFor="nl-query" className="block text-[13px] font-semibold">
          Describe what you&rsquo;re after
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id="nl-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="something like a white textured dial diver under £400"
            maxLength={500}
            className="min-w-0 flex-1 border border-rule-strong bg-paper px-3 py-2 text-[14px] outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={status === "loading" || query.trim().length === 0}
            className="border border-ink bg-ink px-4 py-2 text-[14px] font-medium text-paper disabled:opacity-40"
          >
            {status === "loading" ? "Looking…" : "Find builds"}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={status === "loading"}
            className="border border-rule-strong bg-card px-4 py-2 text-[14px] font-medium hover:border-ink disabled:opacity-40"
          >
            Use a photo
          </button>
          {/* Visually hidden but still a real, labelled control: it is
              opened by the button above, and an unlabelled file input is
              an accessibility failure even when it is off-screen. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload a photo of a watch to search by"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImage(file);
              e.target.value = "";
            }}
          />
        </div>
        <p className="mt-2 text-[12px] text-graphite">
          Photos are read in memory and never stored. Whatever comes back is checked for fitment the same way the
          configurator checks it — nothing that can&rsquo;t be built is shown.
        </p>
      </form>

      {error && (
        <p className="mt-4 border border-amber/40 bg-amber-tint p-3 text-[13px] text-amber" role="status">
          {error}{" "}
          <Link href="/build" className="underline">
            Open the configurator instead
          </Link>
          .
        </p>
      )}

      {result && (
        <div className="mt-5" aria-live="polite">
          {result.notice && <p className="mb-3 text-[12px] text-graphite">{result.notice}</p>}
          {imageNote && <p className="mb-3 text-[12px] text-graphite">{imageNote}</p>}

          {result.chips.length > 0 && (
            <div className="mb-3">
              <p className="text-[12px] text-graphite">What we understood — remove anything that&rsquo;s wrong:</p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {result.chips.map((chip) => (
                  <li key={chip.tag}>
                    <button
                      type="button"
                      onClick={() => removeChip(chip.tag)}
                      className="border border-rule-strong px-2 py-0.5 text-[12px] hover:border-ink"
                      aria-label={`Remove ${chip.label}`}
                    >
                      {chip.label} <span aria-hidden="true">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.droppedTags.length > 0 && (
            <p className="mb-3 text-[12px] text-graphite">
              Ignored, because {result.droppedTags.length === 1 ? "it isn't" : "they aren't"} something the catalog is
              tagged for: {result.droppedTags.join(", ")}.
            </p>
          )}

          {result.candidates.length === 0 ? (
            <p className="text-[13px] text-graphite">
              Nothing in the catalog matches all of that at once.{" "}
              <Link href="/build" className="underline">
                Start from the configurator
              </Link>{" "}
              and narrow it down by hand.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-3">
              {result.candidates.map((candidate) => (
                <li key={Object.values(candidate.parts).join("|")} className="border border-rule p-3">
                  <p className="num text-[15px] font-semibold tabular-nums">{formatGbp(candidate.totalMinorBase)}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-graphite">{candidate.explanation}</p>
                  <ul className="mt-2 space-y-0.5 text-[12px] text-graphite">
                    {candidate.chosen.map((part) => (
                      <li key={part.partId} className="truncate">
                        {part.name}
                      </li>
                    ))}
                  </ul>
                  <Link href={candidate.href} className="mt-3 inline-block text-[13px] font-medium underline">
                    Open in configurator
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
