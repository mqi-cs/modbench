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
