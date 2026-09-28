import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/builds";
import { resolveListing, saveSubmittedPart } from "@/lib/byo/store";

export const runtime = "nodejs";

// Resolving can call a marketplace API, so it shares one budget with saving.
const RATE_LIMIT_PER_HOUR = 30;

const Resolve = z.object({ action: z.literal("resolve"), url: z.string().max(2000), title: z.string().max(500).optional() });

function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `byo:${ip}`;
}

/**
 * WS4 bring-your-own link. `{action: "resolve", url, title?}` returns a
 * draft to confirm; anything else is a confirmed part to store
 * (lib/byo/store.ts validates it).
 */
export async function POST(request: Request) {
  if (!checkRateLimit(callerKey(request), Date.now(), RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json({ error: `That's more than ${RATE_LIMIT_PER_HOUR} links in an hour. Try again later.` }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const resolve = Resolve.safeParse(body);
  if (resolve.success) {
    const r = await resolveListing(resolve.data.url, resolve.data.title);
    return NextResponse.json(r, { status: "error" in r ? 400 : 200 });
  }
  const saved = await saveSubmittedPart(body);
  return NextResponse.json(saved, { status: saved.ok ? 201 : 400 });
}
