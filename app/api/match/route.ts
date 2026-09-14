import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/builds";
import { submitMatch } from "@/lib/dedup/service";

export const runtime = "nodejs";

const MAX_URLS = 6;
const RATE_LIMIT_PER_HOUR = 12;

const Body = z.object({
  urls: z.array(z.string().min(1).max(500)).min(2).max(MAX_URLS),
  note: z.string().max(500).nullish(),
});

function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `match:${ip}`;
}

/**
 * Records a claim that several vendor listings are the same physical part.
 *
 * Returns 201 with a candidate id when the claim was recorded, and 200
 * with a reason when it was not -- "these are the same part already" or
 * "those are two different categories" is an answer, not an error, and the
 * submitter still wants the suggestions that came back with it.
 */
export async function POST(request: Request) {
  if (!checkRateLimit(callerKey(request), Date.now(), RATE_LIMIT_PER_HOUR)) {
    return NextResponse.json(
      { error: `That's more than ${RATE_LIMIT_PER_HOUR} submissions in an hour. Try again later.` },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: `Send between 2 and ${MAX_URLS} product links.` }, { status: 400 });
  }

  const result = submitMatch(parsed.data.urls, parsed.data.note ?? null);
  return NextResponse.json(result, { status: result.candidateId ? 201 : 200 });
}
