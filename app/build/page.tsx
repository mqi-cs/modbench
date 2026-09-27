import { loadCatalog } from "@/lib/catalog";
import { withSubmitted } from "@/lib/byo/store";
import { STARTER_BUILDS } from "@/data/fixtures/starter-builds";
import { Configurator } from "@/components/build/Configurator";
import type { SlotKey } from "@/lib/compat";

// Server component: reads the DB once and hands the client a plain
// payload. Measured at 188 KB gzipped for the full 3,451-part catalog --
// see the Phase 3 report; trimming the projection saved only 17 KB, so
// the whole thing ships as one payload and filtering stays synchronous.
export const dynamic = "force-dynamic";

export default async function BuildPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const catalog = loadCatalog();
  // Bring-your-own parts ship only to the build that names them (WS4).
  catalog.parts = withSubmitted(catalog.parts, Object.values(await searchParams).flat().filter((v): v is string => typeof v === "string"));
  const byName = new Map(Object.values(catalog.parts).map((p) => [p.name, p.id]));

  const starters = STARTER_BUILDS.map((s) => {
    const resolved: Partial<Record<SlotKey, string>> = {};
    for (const [slot, name] of Object.entries(s.partNames) as [SlotKey, string][]) {
      const id = byName.get(name);
      if (id) resolved[slot] = id;
    }
    return { ...s, resolved };
  });

  return <Configurator catalog={catalog} starters={starters} />;
}
