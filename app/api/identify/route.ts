import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/builds";
import { attributesToTags, checkImage, readImage, hasApiKey } from "@/lib/llm";
import { suggestFromIntent } from "@/lib/suggest-service";
import { EMPTY_INTENT } from "@/lib/intent";

export const runtime = "nodejs";

// specs/07-phase-6-nl-image-input.md: "Never persist uploaded images.
// Process in memory, discard immediately, state this in the UI."
//
// There is no filesystem write anywhere on this path and nothing is
// logged: the bytes are read into a buffer, magic-checked, sent to the
// model, and go out of scope when the handler returns. The route
// deliberately does not log the request body either, since a logged
// base64 payload is a persisted image by another name.

function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return `identify:${forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"}`;
}

export async function POST(request: Request) {
  if (!checkRateLimit(callerKey(request), Date.now(), 20)) {
    return NextResponse.json({ error: "Too many image searches in an hour. Try again later." }, { status: 429 });
  }

  let bytes: Uint8Array;
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Attach an image as the `image` field." }, { status: 400 });
    }
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "Couldn't read the upload." }, { status: 400 });
  }

  const check = checkImage(bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  if (!hasApiKey()) {
    return NextResponse.json(
      {
        error: "Image search isn't available — the vision model isn't configured.",
        // Never a dead end: the ordinary configurator is always reachable.
        fallbackHref: "/build",
      },
      { status: 503 },
    );
  }

  const attributes = await readImage(bytes, check.mime!);
  if (!attributes) {
    return NextResponse.json({ error: "Couldn't read that image in time. Try again, or start from the configurator.", fallbackHref: "/build" }, { status: 504 });
  }

  const tags = attributesToTags(attributes);
  return NextResponse.json({
    attributes,
    tags,
    // Low-confidence fields are excluded from the query until confirmed,
    // so the result reflects only what the model was sure of.
    suggestions: suggestFromIntent({ ...EMPTY_INTENT, styleTags: tags }),
    imageRetained: false,
  });
}
