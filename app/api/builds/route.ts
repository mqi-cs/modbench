import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";
import { checkRateLimit, saveBuild, RATE_LIMIT_PER_HOUR } from "@/lib/builds";
import type { CatalogSlice } from "@/lib/compat";

export const runtime = "nodejs";

/**
 * Caller identity for rate limiting.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded
 * header is used when present -- taking the FIRST entry, which is the
 * client, since anything after it is appended by hops we control less.
 * The header is spoofable by a direct caller, which is why the limit is
 * a courtesy control and the real protection is that this endpoint writes
 * one small row and nothing else.
 */
function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `builds:${ip}`;
}

function slice(): CatalogSlice {
  const catalog = loadCatalog();
  const listings = catalog.listings.map((l) => ({
    partId: l.partId,
    vendorKey: l.vendorKey,
    priceMinorBase: l.priceMinorBase,
    shippingFlatMinor: catalog.vendors.find((v) => v.key === l.vendorKey)?.shippingMinorBase ?? 0,
    inStock: l.inStock,
  }));
  const listingsByPart: Record<string, typeof listings> = {};
  for (const l of listings) (listingsByPart[l.partId] ??= []).push(l);
  return { parts: catalog.parts, familyExceptions: catalog.familyExceptions, listings, listingsByPart };
}

export async function POST(request: Request) {
  if (!checkRateLimit(callerKey(request))) {
    return NextResponse.json(
      { error: `That's more than ${RATE_LIMIT_PER_HOUR} saved builds in an hour. Try again later.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const result = saveBuild(body, slice());
  if (!result.ok) {
    return NextResponse.json({ error: result.error, findings: result.findings }, { status: result.status });
  }
  return NextResponse.json({ id: result.id, url: `/b/${result.id}` }, { status: 201 });
}
