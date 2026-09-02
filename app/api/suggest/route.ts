import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/builds";
import { suggestFromText, suggestFromIntent } from "@/lib/suggest-service";
import { normaliseIntent } from "@/lib/intent";

export const runtime = "nodejs";

const BodySchema = z.object({
  query: z.string().max(500).optional(),
  // Sent back when the user edits the chips: skip the model entirely and
  // query on exactly what they confirmed.
  intent: z.unknown().optional(),
});

function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return `suggest:${forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"}`;
}

export async function POST(request: Request) {
  if (!checkRateLimit(callerKey(request), Date.now(), 60)) {
    return NextResponse.json({ error: "Too many searches in an hour. Try again later." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Body must be JSON with a `query` string or an `intent` object." }, { status: 400 });
  }
  const { query, intent } = body as z.infer<typeof BodySchema>;

  if (intent !== undefined) {
    const { intent: normalised } = normaliseIntent(intent);
    return NextResponse.json(suggestFromIntent(normalised));
  }
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Say what you're looking for." }, { status: 400 });
  }
  return NextResponse.json(await suggestFromText(query));
}
