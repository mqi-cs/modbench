# Feed Reconnaissance — Phase 0, Task 3

Fetched by hand on 2026-08-30. Each vendor confirmed to be a live Shopify storefront (standard `/products.json` shape: `id, title, handle, body_html, published_at, created_at, updated_at, vendor, product_type, tags, variants, images, options`).

## namokimods.com

- **Endpoint exists, returns JSON:** Yes.
- **Product count:** 250 returned at `?limit=250` (hit the page cap — true catalog size is larger; Phase 1 ingestion must paginate with `&page=n`).
- **Useful fields:** `product_type` is the strongest signal seen across all four vendors — it's already close to a family key: "SKX007 Cases", "SKX013 Cases", "Seiko VK Dials", "Seiko VK Hands", "Chapter Rings", "NMK Cases", "Casebacks". `tags` reinforces with movement codes (NH35, NH36, VK63) and part-type words (dial, hands, case).
- **Specs location:** Mostly in `product_type`/`tags` convention, not prose. `body_html` not inspected in depth yet — follow up in Phase 1 extraction.
- **robots.txt:** No disallow on `/products/` or `/products.json`. Explicit `Allow: /products/`. Disallows only transactional paths (cart/checkout/account). Sitemap at `https://www.namokimods.com/sitemap.xml`. No crawl-delay specified (we rate-limit to 1 req/2s regardless per project policy).

## luciusatelier.com

- **Endpoint exists, returns JSON:** Yes.
- **Product count:** 250 returned at `?limit=250` (hit the page cap; an earlier automated summarisation pass under-read this as ~6 — corrected against the raw fetch). True catalog size is larger; Phase 1 must paginate.
- **Useful fields:** Standard Shopify fields present. Family signal not yet assessed in depth (small sample) — check `product_type`/`tags` density during Phase 1 ingestion.
- **Specs location:** Not yet assessed (small sample fetched).
- **robots.txt:** No disallow on `/products/` or `/products.json`. Disallows admin, cart, checkout, account (except login), `/services`, `/sf_*`, and crawl-trap collection/sort/filter/language params. Sitemap at `https://luciusatelier.com/sitemap.xml`. No crawl-delay specified.
- **Note:** This robots.txt also contains a block of text addressed to AI shopping agents ("do not complete checkout/payment automatically... use UCP/MCP endpoints or the Shopify agent skill with explicit buyer approval"). Not a standard robots.txt directive — flagged for awareness, not acted on, since we never transact.

## dlwwatches.com

- **Endpoint exists, returns JSON:** Yes.
- **Product count:** 250 returned at `?limit=250` (hit the page cap; Phase 1 must paginate).
- **Useful fields:** `tags` are the strong signal here ("SKX007 & SRPD", "316L Steel", "Deep Sea", "Slim Bezel", finishes). `product_type` is sparse/inconsistent ("Bezels", empty for a "YARD SALE" clearance section). Movement codes (NH36) and part terms show up in titles/tags rather than `product_type`.
- **Specs location:** Not yet assessed in `body_html` — follow up in Phase 1.
- **robots.txt:** No disallow on `/products/`. Standard `Allow: /` baseline with transactional paths excluded. Sitemap at `https://www.dlwwatches.com/sitemap.xml`. No crawl-delay specified.

## watchandstyle.net

- **Endpoint exists, returns JSON:** Yes.
- **Product count:** 250 returned at `?limit=250` on direct fetch (an earlier automated summarisation pass under-read this as ~10 — corrected against the raw fetch; hit the page cap, Phase 1 must paginate).
- **Useful fields:** `tags` are systematic and useful ("Bracelet", "Female Endlink", "GMT Insert", "Lumed Insert", "Sapphire Insert"). `product_type` mixes model/line names with spec terms unevenly (e.g. `"SRPL \"Shogurai\" Hexad"`) — needs normalisation, less trustworthy standalone than namoki's.
- **Specs location:** Not yet assessed in `body_html`.
- **robots.txt:** No disallow on `/products/` or `/products.json`. Sitemap at `https://watchandstyle.net/sitemap.xml`. No crawl-delay specified. Also references "UCP/MCP endpoints" for agent checkout (same agent-facing note as luciusatelier — likely a shared robots.txt template across a theme/app, not vendor-specific).

## Summary against Phase 0 pass measure (Task 3 item)

| Vendor | `/products.json` usable? |
|---|---|
| namokimods.com | Yes |
| luciusatelier.com | Yes |
| dlwwatches.com | Yes |
| watchandstyle.net | Yes |

**4 of 4 vendors expose a usable feed** — clears the "at least 3 of 4" bar. `product_type` and `tags` both carry real signal, strongest at namokimods.com, weakest/most inconsistent at watchandstyle.net. None of the four disallow `/products.json` or `/products/` in robots.txt. All four are safe to rate-limit at 1 req/2s in Phase 1 per project policy, since none publish their own crawl-delay.
