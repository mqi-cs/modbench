"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Build, CatalogSlice, SlotKey } from "@/lib/compat";
import { evaluateBuild } from "@/lib/compat";
import { computeTotals } from "@/lib/pricing";
import { ASSEMBLY_ORDER, type Catalog, type PickerItem, type PartState } from "./types";
import { SlotRail } from "./SlotRail";
import { PartPicker } from "./PartPicker";
import { BuildSummary } from "./BuildSummary";
import { WatchPreview } from "./WatchPreview";
import { StarterBuilds } from "./StarterBuilds";
import type { StarterBuild } from "@/data/fixtures/starter-builds";
import { SLOT_PARAM, buildFromParams, droppedSlots, paramsFromBuild } from "./url-state";
import { decodePreviewable } from "@/lib/preview/previewable";
import { decodeArt } from "@/lib/preview/art-codec";

// Warnings that reflect a gap in the catalog rather than a problem with
// the specific combination in front of the user.
const CATALOG_WIDE_WARNINGS = new Set(["unverified-part", "date-window-alignment", "day-window-presence", "hand-stack-clearance"]);

export function Configurator({ catalog, starters }: { catalog: Catalog; starters: (StarterBuild & { resolved: Partial<Record<SlotKey, string>> })[] }) {
  const [build, setBuild] = useState<Build>({ parts: {} });
  const [activeSlot, setActiveSlot] = useState<SlotKey>("movement");
  const [includeTools, setIncludeTools] = useState(true);
  const [dropped, setDropped] = useState<SlotKey[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const pushBuild = useCallback((next: Build) => {
    setBuild(next);
    const qs = paramsFromBuild(next);
    window.history.pushState({}, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const select = useCallback(
    (slot: SlotKey, partId: string | null) => {
      const parts = { ...build.parts };
      if (partId === null) delete parts[slot];
      else parts[slot] = partId;
      pushBuild({ parts });
    },
    [build, pushBuild],
  );

  // Rebuild the engine's CatalogSlice (and its by-part index) once from
  // the single listings array the server sent. Cheap -- one pass over
  // ~3.4k rows on mount -- and it keeps the payload from carrying three
  // copies of the same data.
  // Display-only lookups for the preview. Derived once; lib/compat never
  // sees either of them.
  const previewable = useMemo(
    () => decodePreviewable(Object.keys(catalog.parts), catalog.previewable),
    [catalog.parts, catalog.previewable],
  );
  const artMeta = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(decodeArt(Object.keys(catalog.parts), catalog.art)).map(([id, a]) => [
          id,
          { name: catalog.parts[id]?.name ?? id, shape: a.shape, tags: a.tags },
        ]),
      ),
    [catalog.art, catalog.parts],
  );

  const slice = useMemo<CatalogSlice>(() => {
    const shippingByVendor = new Map(catalog.vendors.map((v) => [v.key, v.shippingMinorBase]));
    const sliceListings = catalog.listings.map((l) => ({
      partId: l.partId,
      vendorKey: l.vendorKey,
      priceMinorBase: l.priceMinorBase,
      shippingFlatMinor: shippingByVendor.get(l.vendorKey) ?? 0,
      inStock: l.inStock,
    }));
    const listingsByPart: Record<string, typeof sliceListings> = {};
    for (const l of sliceListings) (listingsByPart[l.partId] ??= []).push(l);
    return { parts: catalog.parts, familyExceptions: catalog.familyExceptions, listings: sliceListings, listingsByPart };
  }, [catalog]);

  // URL is the state store (00-PROJECT.md: no Zustand, no Redux) -- which
  // also makes every build shareable and the back button correct for free.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setDropped(droppedSlots(params, slice.parts));
    setBuild(buildFromParams(params, slice.parts));
    setHydrated(true);
    const onPop = () => setBuild(buildFromParams(new URLSearchParams(window.location.search), slice.parts));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [slice]);

  const result = useMemo(() => evaluateBuild(build, slice), [build, slice]);

  const totals = useMemo(
    () => computeTotals(build, catalog.listings, catalog.vendors, result.requiredTools, includeTools),
    [build, catalog, result.requiredTools, includeTools],
  );

  // The core interaction: for the active slot, evaluate every candidate
  // part AS IF it were selected, so a blocked part can show the real
  // reason it's blocked rather than just being greyed out. Synchronous by
  // construction -- no await anywhere in this path.
  const pickerItems = useMemo<PickerItem[]>(() => {
    const cheapest = new Map<string, (typeof catalog.listings)[number]>();
    for (const l of catalog.listings) {
      const cur = cheapest.get(l.partId);
      if (!cur || l.priceMinorBase < cur.priceMinorBase) cheapest.set(l.partId, l);
    }

    const items: PickerItem[] = [];
    for (const part of Object.values(slice.parts)) {
      if (part.slot !== activeSlot) continue;
      const listing = cheapest.get(part.id);
      if (!listing) continue;

      const trial: Build = { parts: { ...build.parts, [activeSlot]: part.id } };
      const trialResult = evaluateBuild(trial, slice);
      const relevant = trialResult.findings.filter((f) => f.slots.includes(activeSlot));
      const error = relevant.find((f) => f.severity === "error");
      // Only a warning about THIS pairing changes the card's state. The
      // catalog-wide "we don't have the data to check" warnings fire on
      // nearly every part (no vendor publishes dial date-aperture
      // positions; most parts are family-inferred), so letting them set
      // the card state painted the entire picker amber -- at which point
      // amber stops distinguishing anything and the three-severity design
      // collapses to two. They still appear in full in the findings panel,
      // where they're a statement about the catalog rather than a signal
      // about one part.
      const warn = relevant.find((f) => f.severity === "warning" && !CATALOG_WIDE_WARNINGS.has(f.ruleKey));
      const state: PartState = error ? "blocked" : warn ? "warning" : "compatible";

      items.push({
        id: part.id,
        name: part.name,
        vendorKey: listing.vendorKey,
        priceMinorBase: listing.priceMinorBase,
        priceMinor: listing.priceMinor,
        currency: listing.currency,
        inStock: listing.inStock,
        sourceUrl: listing.sourceUrl,
        imageUrl: catalog.images[part.id] ?? null,
        state,
        reason: error?.message ?? warn?.message ?? null,
      });
    }

    // Spec: compatible first, then compatible-with-warnings, then blocked;
    // price ascending within each band.
    const rank = { compatible: 0, warning: 1, blocked: 2 } as const;
    return items.sort((a, b) => rank[a.state] - rank[b.state] || a.priceMinorBase - b.priceMinorBase);
  }, [activeSlot, build, slice, catalog.listings, catalog.images]);

  const filledCount = Object.keys(build.parts).length;

  if (!hydrated) {
    return (
      <div className="p-10 text-graphite num text-sm" aria-live="polite">
        Loading catalog…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1600px] items-baseline gap-4 px-6 py-3">
          <span className="text-[15px] font-semibold tracking-tight">Modbench</span>
          <span className="text-[13px] text-graphite">
            Seiko mod compatibility across {catalog.vendors.length} vendors
          </span>
          <span className="num ml-auto text-[12px] text-graphite">
            {Object.keys(slice.parts).length.toLocaleString("en-GB")} parts
          </span>
        </div>
      </header>

      {dropped.length > 0 && (
        <div className="border-b border-amber/30 bg-amber-tint px-6 py-2 text-[13px] text-amber">
          {dropped.length === 1 ? "One slot in that link" : `${dropped.length} slots in that link`} pointed at a
          part that isn&rsquo;t in the catalog any more, so {dropped.length === 1 ? "it was" : "they were"} left empty.
        </div>
      )}

      {filledCount === 0 ? (
        <StarterBuilds starters={starters} onOpen={(parts) => pushBuild({ parts })} />
      ) : null}

      <main className="mx-auto grid max-w-[1600px] grid-cols-[280px_minmax(0,1fr)_360px] gap-px bg-rule">
        <SlotRail
          build={build}
          parts={slice.parts}
          activeSlot={activeSlot}
          onActivate={setActiveSlot}
          onClear={(slot) => select(slot, null)}
          findings={result.findings}
        />
        <PartPicker
          slot={activeSlot}
          items={pickerItems}
          selectedId={build.parts[activeSlot] ?? null}
          onSelect={(id) => select(activeSlot, id)}
          onEscape={() => {
            const el = document.querySelector<HTMLElement>("[data-rail-active]");
            el?.focus();
          }}
        />
        {/* Preview sits above the summary rather than in a fourth column:
            at 1600px a fourth column would squeeze the picker, and the
            drawing is what you look at while reading the total, so the two
            belong in the same field of view. */}
        <div className="flex flex-col gap-px bg-rule">
          <WatchPreview
            input={{
              parts: build.parts as Partial<Record<string, string>>,
              previewable,
              meta: artMeta,
            }}
            title="Diagram of the build so far"
            className="p-5"
          />
          <BuildSummary
            build={build}
            parts={slice.parts}
            fxAsOf={catalog.fxAsOf}
            result={result}
            totals={totals}
            includeTools={includeTools}
            onToggleTools={() => setIncludeTools((v) => !v)}
            onJumpToSlot={setActiveSlot}
          />
        </div>
      </main>
    </div>
  );
}

export { ASSEMBLY_ORDER };
