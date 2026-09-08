# Pre-proposal: public-seo-booking-preview

Status: **confirmed** (`accept_recommended`, session choice). `sdd-proposal` may launch.

Research: **unselected**. Runtime has no documentation/open-web evidence grants; selecting a research lane would fail-closed and block proposal. Parent offered research after explore; default remains unselected unless Santi selects it.

## Recommended product package (not yet confirmed)

| # | Question | Recommended answer | Why |
|---|---|---|---|
| 1 | Google index on `/booking/:slug` | `noindex, follow` (share-only) | Previews do not need Google index; indexing slugs is a de facto directory (marketplace non-goal). |
| 2 | Landing Instagram | `https://www.instagram.com/orvel.pro/` | Handle used by Santi in this session; replace dead `href="#"` with that URL. |
| 3 | `/lanzamiento` | Keep live, **exclude from sitemap**, self-canonical | Avoid 301 surprise on possible campaign URLs; do not advertise a second home. |
| 4 | Unknown slug | Generic Orvel head + `noindex`; SPA still loads | Do not leak “not found” as a distinct OG card. Closed accounts: if resolver returns a name, show that name (resolver does not expose closed). |
| 5 | `/booking/:slug/:professionalSlug` | Canonical + OG = business URL `/booking/{slug}` | One share card per local; no extra crawl surface. |
| 6 | OG image | One Orvel 1200×630 for marketing and booking | No public logo column. |
| 7 | Booking description | `{name}: reservá turno online.` + up to 3 public active service names, **no prices** | Already-public services only; no alias/CBU/phone. |
| 8 | `es-AR` | Landing Layout only | Dashboard `index.html` stays `lang="es"` this change (static title contract). |

## Slice shape (from exploration)

- Slice A: landing technical SEO
- Slice B: Edge HTMLRewriter of SPA head for `GET /booking/:slug`
- Delivery: `ask-on-risk` (do not invent chain or `size:exception` before tasks forecast)

## Awaiting

Exact token from Santi: `accept_recommended` or `customize`.
