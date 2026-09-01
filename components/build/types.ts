import type { SlotKey } from "@/lib/compat";
import type { CatalogPayload } from "@/lib/catalog";

// The assembly sequence, in the order a watch actually goes together.
// This ordering is load-bearing, not cosmetic: it's what justifies
// numbering the rail (see specs/DESIGN-PLAN.md) and it's the order a
// beginner should fill the slots in.
export const ASSEMBLY_ORDER: { slot: SlotKey; label: string; hint: string }[] = [
  { slot: "movement", label: "Movement", hint: "Sets what the watch can do — date, day-date, GMT — and what dial and hands will fit." },
  { slot: "dial", label: "Dial", hint: "The face. Its date and day cutouts have to match the movement underneath." },
  { slot: "hands", label: "Hands", hint: "Mount on the movement's pinions, so the movement decides which sets fit." },
  { slot: "case", label: "Case", hint: "Decides the size of nearly everything else: bezel, insert, crystal, crown, strap." },
  { slot: "chapterRing", label: "Chapter ring", hint: "Sits between dial and crystal. On some cases it's what holds the dial at the right height." },
  { slot: "bezel", label: "Bezel", hint: "The rotating ring that holds the insert." },
  { slot: "bezelInsert", label: "Bezel insert", hint: "The printed scale in the bezel. Has to match the crystal's profile as well as the case." },
  { slot: "crystal", label: "Crystal", hint: "Flat or double-domed. A domed crystal buys height for tall hand stacks." },
  { slot: "crown", label: "Crown", hint: "Threads into the case tube." },
  { slot: "strap", label: "Strap", hint: "A spring-bar strap fits on lug width alone; a bracelet is shaped to one case." },
];

export type PartState = "compatible" | "warning" | "blocked";

export interface PickerItem {
  id: string;
  name: string;
  vendorKey: string;
  priceMinorBase: number;
  priceMinor: number;
  currency: string;
  inStock: boolean;
  sourceUrl: string;
  imageUrl: string | null;
  state: PartState;
  reason: string | null;
}

export type Catalog = CatalogPayload;
