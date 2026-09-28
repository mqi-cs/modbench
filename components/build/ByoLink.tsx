"use client";

import { useState } from "react";
import type { Build, SlotKey } from "@/lib/compat";
import { KEY_FIELDS, type Draft } from "@/lib/byo/extract";
import { ASSEMBLY_ORDER } from "./types";
import { paramsFromBuild } from "./url-state";

// WS4: add a part from an eBay or AliExpress link. Paste -> the server
// reads what it can (lib/byo/store.ts) -> the user checks every key size
// here -> the part is stored and the page reloads with it in the build, so
// the server merges it into the catalog like any other part.

const FIELD_LABEL: Record<string, string> = {
  caseDiameterMm: "Case diameter (mm)",
  diameterMm: "Dial diameter (mm)",
  outerDiameterMm: "Insert outer diameter (mm)",
  lugWidthMm: "Lug width (mm)",
  crownPosition: "Crown position (o'clock)",
  caliber: "Movement (e.g. NH35)",
  hasFeet: "Dial feet",
  hasDateWindow: "Date window",
  hasDayWindow: "Day window",
  hasDate: "Date",
  hasDay: "Day",
  profile: "Profile",
  material: "Material",
};
const BOOLEAN = new Set(["hasFeet", "hasDateWindow", "hasDayWindow", "hasDate", "hasDay"]);
const NUMBER = new Set(["caseDiameterMm", "diameterMm", "outerDiameterMm", "lugWidthMm"]);

type Resolved = { ref: { platform: string; canonicalUrl: string }; draft: Draft; fetched: boolean };

export function ByoLink({ build }: { build: Build }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [slot, setSlot] = useState<SlotKey | "">("");
  const [name, setName] = useState("");
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/byo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Something went wrong.");
      return res.ok ? json : null;
    } finally {
      setBusy(false);
    }
  }

  async function read(e: React.FormEvent) {
    e.preventDefault();
    const r = (await post({ action: "resolve", url, title: title || undefined })) as Resolved | null;
    if (!r) return;
    setResolved(r);
    setSlot(r.draft.slot ?? "");
    setName(r.draft.name);
    setAttrs(r.draft.attributes);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!slot) return setError("Choose which part this is.");
    const r = (await post({ url, slot, name, attributes: attrs, pastedTitle: title || undefined })) as { id: string; slot: SlotKey } | null;
    if (r) window.location.assign(`/build?${paramsFromBuild({ parts: { ...build.parts, [r.slot]: r.id } })}`);
  }

  function changeSlot(next: SlotKey | "") {
    setSlot(next);
    if (next && resolved) setAttrs(Object.fromEntries(KEY_FIELDS[next].map((f) => [f, resolved.draft.found[f] ?? null])));
  }

  const draft = resolved?.draft;
  const fields = slot ? KEY_FIELDS[slot] : [];

  return (
    <details className="border-b border-rule bg-card px-6 py-3 text-[13px]">
      <summary className="cursor-pointer font-semibold">Add a part from an eBay or AliExpress link</summary>

      <form onSubmit={read} className="mt-3 grid max-w-[720px] gap-2">
        <label className="grid gap-1">
          <span className="text-graphite">Listing link</span>
          <input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.ebay.co.uk/itm/…" className="border border-rule px-2 py-1" />
        </label>
        <label className="grid gap-1">
          <span className="text-graphite">Listing title (optional; paste it so we can read the sizes it states)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} className="border border-rule px-2 py-1" />
        </label>
        <button disabled={busy} className="justify-self-start border border-rule-strong px-3 py-1">Read listing</button>
      </form>

      {error && <p role="alert" className="mt-2 text-ruby">{error}</p>}

      {resolved && draft && (
        <form onSubmit={add} className="mt-4 grid max-w-[720px] gap-2 border-t border-rule pt-3">
          <p className="text-graphite">
            {resolved.fetched
              ? "Read from the listing. Check every value against the seller's page."
              : "We couldn't read this listing automatically, so fill in what the seller states."}{" "}
            Every check involving this part is unconfirmed: it rests on a seller&rsquo;s claim or your entry, not a parts
            maker&rsquo;s own spec, so it can warn but never confirm a fit.
          </p>
          {draft.outOfScope && <p className="text-amber">Not a case line we model: {draft.outOfScope}.</p>}

          <label className="grid gap-1">
            <span className={draft.unmatched.includes("slot") ? "text-amber" : "text-graphite"}>
              Which part is it?{draft.unmatched.includes("slot") && " (the listing didn't make this clear)"}
            </span>
            <select required value={slot} onChange={(e) => changeSlot(e.target.value as SlotKey | "")} className="border border-rule px-2 py-1">
              <option value="">Choose…</option>
              {ASSEMBLY_ORDER.map((s) => (
                <option key={s.slot} value={s.slot}>{s.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-graphite">Name</span>
            <input required minLength={3} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="border border-rule px-2 py-1" />
          </label>

          {fields.map((f) => {
            const value = attrs[f] ?? null;
            const set = (v: unknown) => setAttrs((a) => ({ ...a, [f]: v }));
            const note = draft.from[f] ? `from ${draft.from[f]}` : "not in the listing";
            return (
              <label key={f} className="grid gap-1">
                <span className={draft.from[f] ? "text-graphite" : "text-amber"}>
                  {FIELD_LABEL[f] ?? f} <span className="text-[11px] opacity-80">({note})</span>
                </span>
                {BOOLEAN.has(f) ? (
                  <select value={value === null ? "" : String(value)} onChange={(e) => set(e.target.value === "" ? null : e.target.value === "true")} className="border border-rule px-2 py-1">
                    <option value="">Not stated</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : f === "profile" ? (
                  <select value={(value as string) ?? ""} onChange={(e) => set(e.target.value || null)} className="border border-rule px-2 py-1">
                    <option value="">Not stated</option>
                    <option value="flat">Flat</option>
                    <option value="domed">Domed</option>
                    <option value="slope">Sloped</option>
                  </select>
                ) : (
                  <input
                    type={NUMBER.has(f) ? "number" : "text"}
                    step="0.1"
                    value={value === null ? "" : String(value)}
                    onChange={(e) => set(e.target.value === "" ? null : NUMBER.has(f) ? Number(e.target.value) : e.target.value)}
                    className="border border-rule px-2 py-1"
                  />
                )}
              </label>
            );
          })}

          <button disabled={busy || !slot} className="justify-self-start border border-rule-strong px-3 py-1">Add to build</button>
        </form>
      )}
    </details>
  );
}
