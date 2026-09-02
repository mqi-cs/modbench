# Phase 5 — Sharing, Homepage, Style Pages

The growth surface. This is how PCPartPicker actually grew — people pasted build lists into forum threads.

**Prerequisite:** Phase 4 pass measure met.

## Short build links

The full query-string URL is too long to paste into a Reddit comment. Add a shortener.

```
// builds table
id         text pk         // 8-char nanoid, URL-safe
slots      jsonb           // { movement: partId, case: partId, ... }
createdAt  timestamptz
viewCount  integer
```

`POST /api/builds` takes the current slot state, validates it against the catalog, evaluates it, and returns `/b/<id>`. **Reject builds that evaluate to `blocked`** — never mint a permalink for a build that can't be made.

Builds are immutable and anonymous. Opening one in the configurator forks it into a fresh URL rather than mutating the original.

## Build page — `/b/[id]`

A read-only view. Preview image, parts list grouped by vendor, total, tool list, warnings, and one primary action: "Open in configurator."

Desktop-styled, consistent with the rest of the app. Responsive is deferred — noted as the first thing to revisit after launch, since shared links will overwhelmingly be opened on phones.

Server-rendered for SEO and link previews. Cache aggressively; builds never change.

## Share cards

Open Graph and Twitter meta on `/b/[id]`. The OG image is the Phase 4 canvas render.

`app/b/[id]/opengraph-image.tsx` using Next's `ImageResponse`: the preview render, the build name or a generated one, the total, and the part count. Generate on request and cache indefinitely.

Test in a real link preview — paste into Discord and Slack and confirm the card renders.

## Homepage — `/`

**Use your own rendered builds, not vendor photography.** Six curated builds rendered through the Phase 4 compositor, each linking to its configurator state. This is honest about what the tool does, doubles as a test of the preview layer, and avoids any question about using vendors' images as marketing.

Structure:
- Hero: the six rendered builds and a single clear statement of what the tool does. Not a feature list, not a testimonial section, not a pricing table — there's no pricing.
- One short explanation of the compatibility guarantee, since that's the reason to trust it.
- Entry points: start from scratch, start from a template, browse styles.

Follow the design plan from `00-PROJECT.md`. Resist the standard landing-page shape.

## Style pages — `/styles/[slug]`

Ten hand-made pages, each a curated build for a recognisable look, driven off `styleTags`. Suggested slugs: `vintage-diver`, `field-watch`, `white-dial-dress`, `gmt-traveller`, `black-sub-style`, `explorer-style`, `bronze-diver`, `skin-diver`, `california-dial`, `military-sterile`.

Each page: rendered preview, parts list, total, a paragraph on what defines the style, and "open in configurator."

**Describe styles generically. Do not use trademarked model or brand names as page titles, slugs, headings, or meta descriptions.** Write "white textured dial with a snowflake-style hand set," not the brand's model name. This is both a legal caution and better writing. Get proper advice before building any SEO strategy around brand names — this spec is not legal advice.

Define these in `data/fixtures/style-builds.ts` and assert in tests that all ten evaluate to `ok`.

## Constraints

- No accounts. Builds are anonymous, immutable, unlisted.
- No analytics beyond `viewCount`.
- Rate-limit `POST /api/builds` by IP — 20 per hour is generous.
- Style and starter builds are checked into the repo as fixtures, not hand-entered into the database.
- Every page has real `<title>` and `<meta description>`. No defaults left in.

## Pass measure

1. **A build can be saved, shared, opened in a fresh browser, and forked** into an editable configurator state.
2. **Blocked builds cannot be saved.** Attempt one via the API directly; it must be rejected.
3. **OG cards render correctly** in at least two real platforms.
4. **All ten style pages** load, evaluate to `ok`, and open correctly in the configurator.
5. **Homepage renders six builds** with no vendor photography anywhere on the page.
6. **Lighthouse ≥90** on performance and accessibility for `/`, `/b/[id]`, and one style page.
7. No trademarked model names in any page title, slug, heading, or meta description. Grep for a list of them to confirm.
8. Build pages server-render fully with JavaScript disabled — the parts list and total must be in the HTML.

---

## Result

Built and verified. Two deviations, both recorded rather than quietly absorbed.

### Pass measures

1. **Save, share, open fresh, fork.** Met. `POST /api/builds` returns
   `/b/<id>`; the page server-renders; "Open in configurator" links to the
   ordinary query-string form carrying no build id, so editing forks.
   Tested including that slot keys map to the configurator's own parameter
   names — they differ (`bezelInsert` is `insert`), and a link built from
   the wrong names would open an empty configurator while looking valid.
2. **Blocked builds cannot be saved.** Met, and re-checked server-side
   rather than trusted from the client: the endpoint re-evaluates and
   returns 422 with the blocking reasons. The test finds a genuinely
   blocked pairing in the catalog rather than constructing one, so it
   fails if the engine stops blocking it.
3. **OG cards render on two real platforms.** **Outstanding — needs a
   person.** The card itself renders correctly (verified by fetching
   `/b/<id>/opengraph-image` and looking at it), and `metadataBase` is set
   so `og:url` and `og:image` are absolute, which is what Slack and
   Discord need. Pasting into those two is not something this session can
   do.
4. **Ten style pages load, evaluate, open correctly.** Met, with the
   amendment below.
5. **Homepage renders six builds, no vendor photography.** Met. Grepped:
   the rendered homepage contains 42 `/assets/` images and zero external
   image hosts.
6. **Lighthouse ≥90 performance and accessibility.** Met, after a real
   fix. First run: `/` 97/100, `/b/[id]` **79**/100, style page 98/100.
   The build page was losing 1.94s to the render-blocking Google Fonts
   stylesheet on a third-party origin. Moved to `next/font`, which
   self-hosts the faces at build time. Second run: **99, 97, 97**, all
   accessibility 100.
7. **No trademarked model names in titles, slugs, headings, meta.** Met,
   and enforced rather than reviewed. `lib/trademarks.ts` holds the
   vocabulary; `lib/build-name.ts` strips it out of generated `/b/[id]`
   titles before they reach a `<title>`; a test greps every style page's
   title, slug and summary, and every title the generator produces for
   all 474 dials in the catalog.
8. **Server-renders with JavaScript disabled.** Met by construction: the
   build page has no client component in its tree at all. `StaticPreview`
   stacks the pre-composited layers as absolutely-positioned `<img>`
   elements instead of using a canvas, which needs no script. Verified by
   grepping the raw HTML for the parts list and total.

### Amendments

**A. Style pages assert "not blocked", not `ok`.** The spec says to assert
all ten evaluate to `ok`. That is unreachable and the reason is already in
the catalog: four rules — `date-window-alignment`, `day-window-presence`,
`hand-stack-clearance`, `unverified-part` — fire on nearly every build,
because no vendor publishes dial date-window positions (D7) and most parts
are family-inferred. Any build with a dial and a date movement is
`ok-with-warnings` by construction.

The assertion used instead is stronger than a weakened `ok` would be: not
blocked, **and** every warning present is one of those four known
catalog-wide gaps. A warning specific to *these* parts fails the test. That
caught a real defect — one style paired a sloped bezel insert with a flat
crystal, which the engine blocks, and another paired an insert with no
stated profile against a crystal, which draws an unconfirmable-fitment
warning. Both fixtures were corrected rather than the test relaxed.

**B. The OG image composites to a single PNG with sharp.** Stacking the
prepared layers inside the card does not work: Satori cannot decode WebP,
which is the format Phase 4 stores assets in, and inlining six 800×800
layers as data URIs put over a megabyte of base64 through the renderer and
killed the response with an empty reply. Flattening to one PNG first fixes
both. Satori also has no text wrapping or ellipsis, so a long generated
name ran straight off the card — the size is stepped down by name length
and the string clamped.

### Notes

- Rate limiting lives in the database, not a module-level `Map`. A
  serverless deployment loses in-process state between requests, so an
  in-memory limiter would reset on every cold start and limit nothing.
- Build ids use an alphabet with no `0`/`O` or `1`/`l`/`I`, because a
  shared link gets read aloud and retyped from screenshots. Collisions are
  checked on insert rather than assumed away.
- `saveBuild` resolves part ids through `partById`, so an id of
  `__proto__` is rejected rather than resolving to something inherited —
  the same class as the Phase 3 URL bug, now on a path that takes input
  straight off the network.
