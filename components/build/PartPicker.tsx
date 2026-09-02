"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import type { SlotKey } from "@/lib/compat";
import { formatGbp, formatNative } from "@/lib/money";
import { ASSEMBLY_ORDER, type PickerItem } from "./types";
import { isNavKey, nextIndex } from "./keyboard";

// In-picker filtering. Not in the original spec, which assumed a catalog
// of a few hundred parts -- at 3,451 a single category can run to 681
// items, and scrolling that is not a usable way to choose. All filtering
// is synchronous over an in-memory array; no request, no spinner.
export function PartPicker({
  slot,
  items,
  selectedId,
  onSelect,
  onEscape,
}: {
  slot: SlotKey;
  items: PickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onEscape: () => void;
}) {
  const [query, setQuery] = useState("");
  const [maxGbp, setMaxGbp] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [hideBlocked, setHideBlocked] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const deferredQuery = useDeferredValue(query);

  const meta = ASSEMBLY_ORDER.find((s) => s.slot === slot)!;

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (inStockOnly && !i.inStock) return false;
      if (maxGbp !== null && i.priceMinorBase > maxGbp * 100) return false;
      // Off by default and clearly labelled: hiding incompatible parts is
      // exactly what the competitor does, and it teaches nothing. It's
      // offered only as an explicit opt-in once someone knows why a part
      // is blocked.
      if (hideBlocked && i.state === "blocked") return false;
      return true;
    });
  }, [items, deferredQuery, inStockOnly, maxGbp, hideBlocked]);

  const blockedCount = items.filter((i) => i.state === "blocked").length;

  function onKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onEscape();
      return;
    }
    if (!isNavKey(e.key)) return;
    e.preventDefault();

    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-part]") ?? []);
    if (buttons.length === 0) return;
    const current = buttons.findIndex((b) => b === document.activeElement);

    // Column count measured from the rendered grid rather than assumed:
    // the track is auto-fill, so it changes with viewport width. Items in
    // the first row share the smallest offsetTop.
    const firstTop = buttons[0]!.offsetTop;
    let columns = buttons.findIndex((b) => b.offsetTop > firstTop);
    if (columns <= 0) columns = buttons.length; // single row

    const target = nextIndex(e.key, current, buttons.length, columns);
    if (target !== null) buttons[target]?.focus();
  }

  return (
    <section className="flex min-h-0 flex-col bg-paper" aria-label={`${meta.label} options`}>
      <div className="border-b border-rule bg-card px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold">{meta.label}</h2>
          <p className="num text-[12px] text-graphite">
            {filtered.length.toLocaleString("en-GB")}
            {filtered.length !== items.length ? ` of ${items.length.toLocaleString("en-GB")}` : ""}
          </p>
        </div>
        <p className="mt-1 text-[12px] text-graphite">{meta.hint}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${meta.label.toLowerCase()}`}
            className="num h-8 w-56 rounded-sm border border-rule bg-card px-2 text-[12px] placeholder:text-graphite/70"
          />
          <label className="flex items-center gap-1.5 text-[12px] text-graphite">
            <span>Under</span>
            <input
              type="number"
              min={0}
              value={maxGbp ?? ""}
              onChange={(e) => setMaxGbp(e.target.value === "" ? null : Number(e.target.value))}
              placeholder="£ any"
              className="num h-8 w-20 rounded-sm border border-rule bg-card px-2 text-[12px]"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-graphite">
            <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
            In stock
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-graphite" title="Blocked parts are shown by default so you can see why they don't fit.">
            <input type="checkbox" checked={hideBlocked} onChange={(e) => setHideBlocked(e.target.checked)} />
            Hide {blockedCount} blocked
          </label>
        </div>
      </div>

      <ul
        ref={listRef}
        onKeyDown={onKeyDown}
        className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(260px,1fr))] content-start gap-px overflow-y-auto bg-rule"
      >
        {filtered.map((item) => (
          <PartCard key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
        ))}
        {filtered.length === 0 && (
          <li className="col-span-full bg-card p-8 text-[13px] text-graphite">
            Nothing matches those filters. Widen the price or clear the search to see the full {meta.label.toLowerCase()} list.
          </li>
        )}
      </ul>
    </section>
  );
}

// Vendor product photos are full-resolution -- some are 9 MB PNGs, which
// is unusable with ~30 cards on screen. Shopify's CDN (all four vendors
// are on Shopify) resizes on request via ?width=, taking that same image
// to ~240 KB. Applied at render time so the stored URL stays the vendor's
// canonical one; a non-Shopify host is passed through untouched.
function thumb(url: string, width = 320): string {
  if (!url.includes("cdn.shopify.com")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}width=${width}`;
}

function PartCard({ item, selected, onSelect }: { item: PickerItem; selected: boolean; onSelect: (id: string) => void }) {
  const blocked = item.state === "blocked";
  const warn = item.state === "warning";

  // Three severities, three treatments -- distinct in shape (border weight
  // + hatch) as well as colour, so state survives a glance and colour
  // blindness. Blocked reads inert, not merely dimmed.
  const stateClass = blocked
    ? "border-l-[3px] border-l-ruby hatched"
    : warn
      ? "border-l-[3px] border-l-amber border-dashed"
      : "border-l-[3px] border-l-transparent";

  return (
    // The vendor link sits alongside the select button, not inside it: an
    // anchor nested in a button is invalid HTML and the two are genuinely
    // separate actions -- choose this part vs go read its listing.
    <li className={`relative flex min-w-0 flex-col border border-rule bg-card ${stateClass} ${selected ? "outline-2 outline-brass" : ""}`}>
      <button
        type="button"
        data-part
        onClick={() => !blocked && onSelect(item.id)}
        aria-disabled={blocked}
        aria-describedby={item.reason ? `reason-${item.id}` : undefined}
        title={item.reason ?? undefined}
        className={`flex h-full w-full flex-col gap-2 p-3 text-left ${blocked ? "cursor-not-allowed" : "hover:bg-brass-tint/40"}`}
      >
        {item.imageUrl ? (
          <img
            src={thumb(item.imageUrl)}
            alt=""
            loading="lazy"
            className={`h-28 w-full bg-paper object-contain ${blocked ? "opacity-45 grayscale" : ""}`}
          />
        ) : (
          <span aria-hidden className="flex h-28 w-full items-center justify-center bg-paper text-[11px] text-graphite/60">
            no image
          </span>
        )}
        <span className={`text-[13px] leading-snug font-medium ${blocked ? "text-graphite" : ""}`}>{item.name}</span>

        <span className="mt-auto flex items-baseline justify-between gap-2">
          <span className="text-[11px] text-graphite">{item.vendorKey}</span>
          <span className="num text-right text-[13px] font-medium">
            {formatGbp(item.priceMinorBase)}
            <span className="ml-1.5 text-[11px] font-normal text-graphite">
              {formatNative(item.priceMinor, item.currency)}
            </span>
          </span>
        </span>

        <span className="flex items-center gap-2 text-[11px]">
          {!item.inStock && <span className="text-graphite">Out of stock</span>}
          {blocked && <span className="font-medium text-ruby">Won&rsquo;t fit</span>}
          {warn && <span className="font-medium text-amber">Needs a check</span>}
        </span>

        {/* Every blocked part shows its reason -- no unexplained disabled
            states (pass measure 4). Visible on the card, not only on hover,
            because that is the education feature. */}
        {item.reason && (
          <span id={`reason-${item.id}`} className={`text-[11px] leading-snug ${blocked ? "text-ruby" : "text-amber"}`}>
            {item.reason}
          </span>
        )}
      </button>

      {/* "Every part card links out to its vendor page in a new tab. This
          is a research tool as much as a configurator." (spec) */}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="border-t border-rule px-3 py-1.5 text-[11px] text-graphite hover:bg-paper hover:text-ink"
      >
        View at {item.vendorKey}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  );
}
