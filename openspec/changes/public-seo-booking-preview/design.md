# Design: public-seo-booking-preview

## Technical Approach

Two independently reasoned slices under one change. Slice A makes marketing HTML self-describing on `https://orvel.pro`. Slice B makes non-JS `GET /booking/:slug` return the Angular SPA shell with a **response-time** head that names the business. Public booking UX stays the existing PWA. Dashboard source `index.html` stays `lang="es"` with static `<title>Orvel</title>`.

Hosting fact that this design does not reopen: production is a custom Vercel Build Output (`root vercel.json` `framework: null` → `scripts/build-vercel.mjs`). Landing is Astro `output: 'server'` via `@astrojs/vercel` (default `middlewareMode: 'classic'`). After the landing build, `patchVercelOutputConfig()` injects `/dashboard(?:/.*)?` and `/booking(?:/.*)?` rewrites to `/dashboard/index.html` **after** `handle: filesystem`. `/booking/*` therefore never hits Astro page handlers or `apps/landing/src/middleware.ts` today.

Slice A is Layout + static marketing files + heading/robots fixes, plus a **hosting-safety** patch so a new landing `404.astro` cannot steal `/booking` from the SPA rewrite.

Slice B is Approach 1: a dedicated Vercel Edge function emitted into `.vercel/output` that fetches the static SPA shell, allowlists public preview fields, mutates only head metadata, and returns that HTML. It is **not** Astro SSR and **not** Angular SSR.

Delivery remains `ask-on-risk`. Packed A+B is forecast **above 400 changed lines**. Do not invent `chain_strategy` or `size:exception` here. Tasks must pause for a human delivery decision before packing.

## Architecture Decisions

### Decision: Marketing canonical origin is production, path is the request

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Hardcoded `https://orvel.pro/` for every page | Current bug; `/plan` advertises home | Rejected |
| `Astro.url.origin` + pathname | QA (`qa.orvel.pro`) and preview deploys would emit non-ICP canonicals; spec locks marketing origin | Rejected for canonical/`og:url` |
| Constant origin `https://orvel.pro` + `Astro.url.pathname` (query stripped, trailing slash only on `/`) | Matches spec; QA HTML still self-paths under the production origin | **Chosen** |

`lang="es-AR"` and `og:locale=es_AR` live only on landing Layout. Dashboard shell language is out of scope.

### Decision: Static robots + static sitemap, not `@astrojs/sitemap`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `@astrojs/sitemap` | Easy to ingest `/lanzamiento`, `/billing`, or future SSR routes | Rejected |
| `src/pages/sitemap.xml.ts` SSR | Extra function for a three-URL set | Rejected |
| Checked-in `apps/landing/public/robots.txt` + `apps/landing/public/sitemap.xml` | Marketing URL set is product-locked; filesystem-served; easy contract tests | **Chosen** |

Sitemap URLs: `https://orvel.pro/`, `https://orvel.pro/plan`, `https://orvel.pro/terminos-y-condiciones`. `/lanzamiento` stays live and self-canonical, absent from the sitemap. `robots.txt` disallows `/billing`, `/auth`, `/dashboard`, `/booking/manage` and points `Sitemap:` at the marketing sitemap. Tenant slugs are never listed.

### Decision: Layout robots prop; JSON-LD is home-only

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Hardcoded `index, follow` in Layout | Current billing leak | Rejected |
| Optional `robots` prop (default `index, follow`); `/billing/subscription` passes `noindex, nofollow` | Small API; leftover auth Layout pages can pass the same if they appear | **Chosen** |
| JSON-LD in Layout for every page | Non-home pages inherit homepage identity | Rejected |
| `jsonLd` slot/prop filled only by `index.astro` | Organization + SoftwareApplication on `/` only | **Chosen** |

Current leftover auth routes (`src/pages/auth*.astro`) 302 into the dashboard and do not use Layout. No extra auth Layout work unless a Layout-backed auth page is introduced.

### Decision: One H1 by demoting competing headings, not rewriting page copy

`/lanzamiento`: keep `Hero.astro` as the single `h1`; demote `CTA.astro` from `h1` to `h2`. `/plan`: promote `Roadmap.astro` title from `h2` to `h1` (today the page has no `h1`). Home already has one `h1` in `PrelaunchHero.astro`; do not touch it in this change.

### Decision: Checked-in 1200×630 PNG, not a runtime generator

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Keep `logo.png` (800×400) as `og:image` | Crops badly in WhatsApp | Rejected |
| SVG or live canvas/Satori card per request | Runtime generator; Edge CPU; not in scope | Rejected |
| Per-tenant logo | No `logo_url` column in schema | Rejected |
| One checked-in raster at `apps/landing/public/og-share.png` (1200×630 PNG) | Same file for marketing and booking; served from origin root after Astro copies `public/` to `.vercel/output/static/` | **Chosen** |

`logo.png` may remain as a brand/favicon/JSON-LD `logo` asset. It MUST NOT be referenced by `og:image` or `twitter:image`. Include `og:image:width=1200` and `og:image:height=630`. Absolute image URL: `https://orvel.pro/og-share.png`.

### Decision: Do not use `apps/landing/src/middleware.ts` for booking head

`@astrojs/vercel` default is `middlewareMode: 'classic'`. Classic Astro middleware runs inside the Node `_render` function for Astro routes. `patchVercelOutputConfig` sends `/booking/*` to static `/dashboard/index.html`, so the signup 302 middleware **never sees booking**.

Enabling `middlewareMode: 'edge'` is also rejected for this change: Astro’s emitted `_middleware` is a **route dest** that `fetch`es `/_render` (Astro SSR), not a Vercel `middlewarePath` wrapper around the SPA shell. Using it for `/booking` would either miss the PWA or accidentally send crawlers into Astro.

Keep `src/middleware.ts` as the signup credentials 302 only.

### Decision: Dedicated Edge dest that fetches the SPA shell (Approach 1 on Vercel)

Cloudflare-style “middleware `next()` then HTMLRewriter on the downstream body” is not a reliable Vercel primitive: Vercel Middleware can redirect, rewrite the **request**, set headers, or **short-circuit with a new Response**. It does not stream-transform the SPA rewrite body.

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Astro SSR `pages/booking/[slug].astro` | Second page body; dashboard asset coupling; rewrite forever fights Astro | Rejected (exploration approach 2) |
| Enable Astro `middlewareMode: 'edge'` and fold booking into `src/middleware.ts` | Dest is `/_render`, not the SPA | Rejected |
| Named Edge function dest that **is** the HTML (exploration approach 3 as a second product surface) | Extra function without reusing the shell | Rejected as a second booking app |
| Edge function dest for tenant booking GET; internally `fetch` **same-origin** `/dashboard/index.html`; mutate head; return shell | Matches Approach 1 intent (head on existing SPA); avoids recursion by never fetching `/booking/...` internally | **Chosen** |
| Build-time prerender of all slugs | Marketplace shape; stale names | Rejected |
| Angular Universal | Locked non-goal | Rejected |

Emit `.vercel/output/functions/booking-share.func/` from `scripts/build-vercel.mjs` (Edge runtime, `HTMLRewriter`-class tag mutation implemented as a pure string upsert against the locked dashboard head). Insert a **specific** route dest **before** the catch-all `/booking(?:/.*)?` → `/dashboard/index.html` rewrite.

Route src (conceptual): `^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$` for GET (and HEAD). `/booking/manage` and `/booking` with no slug keep the existing SPA rewrite. Query `token` is an additional exclude inside the function so manage-token URLs never become tenant cards and tokens never appear in canonical/OG/description.

### Decision: Hosting order is a testable pure function; 404 safety is slice A

Adding `404.astro` makes `@astrojs/vercel` append a `/.*` dest with `status: 404`. If that catch-all sits before the SPA rewrite, slice A would 404 the public turnero.

Extract route-patching from the unexported `patchVercelOutputConfig()` in `scripts/build-vercel.mjs` into `scripts/vercel-output-config.mjs` so Vitest can feed a fixture `config.json` without `pnpm run build:vercel`.

Invariant after patch (both slices):

1. `handle: filesystem` remains the static phase.
2. Tenant booking share dest (slice B) appears **before** `{ src: '/booking(?:/.*)?', dest: '/dashboard/index.html' }`.
3. Dashboard + booking SPA rewrites appear **after** filesystem and **before** any `/.*` 404 dest.
4. `/booking/manage` is not dest’d to `booking-share`.

Slice A ships (3) even without the share function, so A is independently shippable. Slice B adds (2) and (4).

### Decision: Anon allowlist mapper; never dump the RPC JSON

`resolve_business_by_slug` returns deposit alias/CBU and owner/support phone. Crawler HTML may contain only: business `name`, slug, canonical `https://orvel.pro/booking/{slug}`, up to three **public active service names**, fallback OG asset, robots `noindex, follow`.

Services: existing RLS `"Public view active services"`; query `select('name')` only, `is_active` true, `limit 3`. Do not `select *`. Do not use service-role or landing API routes that use service-role. Do not widen table reads.

Unknown slug or RPC/network failure: generic Orvel title + `noindex`; still return the SPA shell (never 404 the PWA). If the resolver returns a `name` (including closed accounts), use that name. Nested `/booking/{slug}/{professionalSlug}` canonical and `og:url` are `/booking/{slug}` only.

Slug parse/validate: reuse `normalizePublicBookingSlug` / `isValidPublicBookingSlug` from `packages/booking` (pure functions). Invalid slug → generic head + SPA.

### Decision: Rewrite all GETs, not crawler UAs

User-agent sniffing (WhatsApp/facebookexternalhit) rots and leaves `curl`/Slack/Telegram on `Orvel`. Rewriting metadata for every GET is allowed: spec permits only head tags to differ; scripts, `<app-root>`, PWA tags stay. Humans still boot the same Angular app. Reject UA allowlists.

### Decision: Local proxy is out of v1

`scripts/local-dev-proxy.mjs` will keep sending `/booking` to Angular dev. Share-head is production/QA (`build:vercel`) behavior. Do not extend the proxy unless a later crawler test cannot be expressed as a unit/contract test.

## Data Flow (booking head)

```
GET /booking/{slug}[/{professionalSlug}]
        │
        ├─ path is /booking/manage or query has token?
        │     └─ skip share dest → existing SPA rewrite → dashboard/index.html
        │
        ├─ Edge booking-share.func
        │     1. Parse slug; if invalid → generic Orvel head
        │     2. fetch same-origin /dashboard/index.html  (NOT /booking/…)
        │     3. anon supabase.rpc('resolve_business_by_slug', { business_slug })
        │     4. if name: anon from('services').select('name').eq('business_id', id)
        │        .eq('is_active', true).limit(3)
        │     5. map allowlist { name, slug, serviceNames[≤3] }
        │        — drop alias, cbu, phone, email, tokens, prices, raw JSON
        │     6. upsert <title>, description, canonical, og:*, twitter:*, robots
        │        — do not touch scripts, app-root, manifest, apple-touch-icon
        │     7. Cache-Control: public, s-maxage=60, stale-while-revalidate=300
        │
        └─ browser JS: unchanged Angular public booking PWA
```

Title when resolved: `{name} · Reservá turno | Orvel`.  
Description when resolved: `{name}: reservá turno online.` plus optional `, {s1}, {s2}, {s3}`. No prices.  
Robots when resolved: `noindex, follow`. Unknown: generic Orvel title + `noindex`, not a distinct “not found” card.

Privacy rule: the mapper returns a new object; the rewriter receives only that object. Tests must feed a full RPC dump containing `depositAlias` / `depositCbu` / `supportPhone` and assert those strings are absent from HTML.

## File-Level Changes

### Slice A — landing technical SEO (+ SPA 404 hosting safety)

| File | Action | Description |
|------|--------|-------------|
| `apps/landing/src/layouts/Layout.astro` | Modify | `lang="es-AR"`; per-path canonical/`og:url` on `https://orvel.pro`; `og:locale`; robots prop; `og-share.png`; JSON-LD slot |
| `apps/landing/src/lib/public-origin.ts` | Add | `https://orvel.pro` + path canonical helper (query stripped) |
| `apps/landing/src/pages/index.astro` | Modify | Pass Organization + SoftwareApplication JSON-LD only |
| `apps/landing/src/pages/billing/subscription.astro` | Modify | `robots="noindex, nofollow"` |
| `apps/landing/src/pages/lanzamiento.astro` | Keep | Inherits self-canonical; no 301 |
| `apps/landing/src/components/organisms/CTA.astro` | Modify | Demote competing `h1` → `h2` |
| `apps/landing/src/components/organisms/Roadmap.astro` | Modify | Promote page title `h2` → `h1` |
| `apps/landing/src/components/organisms/Footer.astro` | Modify | Instagram `https://www.instagram.com/orvel.pro/` |
| `apps/landing/src/pages/404.astro` | Add | Layout-backed custom 404, `noindex, nofollow` |
| `apps/landing/public/robots.txt` | Add | Disallow private surfaces; Sitemap line |
| `apps/landing/public/sitemap.xml` | Add | Three marketing URLs only |
| `apps/landing/public/og-share.png` | Add | Checked-in 1200×630 PNG |
| `apps/landing/src/tests/landing-public-seo.contract.spec.ts` | Add | Source/asset contracts for A |
| `scripts/vercel-output-config.mjs` | Add | Extracted route patch (filesystem → SPA rewrites → 404 catch-all) |
| `scripts/build-vercel.mjs` | Modify | Call extracted patch |
| `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` | Add | Fixture: SPA rewrite before `/.*` 404; **slice B will extend this file** with middleware-before-rewrite |
| `apps/dashboard/src/index.html` | Keep | `lang="es"`, `<title>Orvel</title>` |
| `apps/landing/src/pages/terminos-y-condiciones.astro` | Keep | Inherit Layout canonical |

### Slice B — booking share head

| File | Action | Description |
|------|--------|-------------|
| `apps/landing/src/lib/booking-share-head.ts` | Add | Allowlist mapper, title/description/robots builders |
| `apps/landing/src/lib/booking-share-rewriter.ts` | Add | Pure HTML upsert of title/description/canonical/og/twitter/robots |
| `apps/landing/src/lib/booking-share-match.ts` | Add | Tenant path match; exclude manage + query token |
| `apps/landing/src/edge/booking-share.ts` | Add | Edge entry: fetch shell, anon RPC + services, rewrite, cache |
| `scripts/build-vercel.mjs` | Modify | Copy/bundle Edge function into `.vercel/output/functions/booking-share.func/` |
| `scripts/vercel-output-config.mjs` | Modify | Insert booking-share dest **before** `/booking` SPA rewrite |
| `apps/landing/src/tests/booking-share-head.contract.spec.ts` | Add | Privacy, unknown slug, nested canonical, manage exclude, shell tags survive |
| `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` | Modify | Assert generated routes run booking-share **before** `/booking` SPA rewrite |
| `apps/landing/src/middleware.ts` | Keep | Signup 302 only |
| `scripts/local-dev-proxy.mjs` | Keep | No v1 share-head |
| `packages/booking/src/public-booking-slug.ts` | Keep/reuse | Validation only |
| `packages/booking/src/domain/public-booking-url.ts` | Keep | PWA origin helper unchanged; crawler canonical is always `https://orvel.pro` |

Avoid: Angular SSR, `packages/shared/` extraction, dashboard feature rewrite, sitemap of slugs, service-role in Edge.

## Interfaces / Contracts

```ts
const MARKETING_ORIGIN = 'https://orvel.pro';
const OG_SHARE_PATH = '/og-share.png'; // 1200×630, not logo.png

type BookingShareHead = {
  title: string;
  description: string;
  canonicalUrl: string; // https://orvel.pro/booking/{slug}
  robots: 'noindex, follow' | 'noindex';
  imageUrl: `${typeof MARKETING_ORIGIN}${typeof OG_SHARE_PATH}`;
};

// Mapper input is the RPC JSON; output MUST NOT be a JSON dump of the RPC.
function toBookingShareHead(input: {
  slug: string;
  resolved: unknown; // may contain alias/cbu/phone — must be ignored
  serviceNames: string[]; // already name-only, max 3, no prices
}): BookingShareHead;

function rewriteBookingShareHead(html: string, head: BookingShareHead): string;
function isTenantBookingSharePath(pathname: string, search: string): boolean;
```

Edge env: `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY` only (already used by landing public catalog). Never `SUPABASE_SERVICE_ROLE_KEY`.

## Test Contracts (strict TDD)

Red-green on contract specs before implementation of the matching production code.

### Slice A — landing Vitest

`apps/landing/src/tests/landing-public-seo.contract.spec.ts` (and tiny focused specs if a file grows):

- Layout source: no hardcoded canonical/`og:url` `https://orvel.pro/` as the only URL; uses pathname + production origin; `lang="es-AR"`; `og:locale` `es_AR`; robots prop; `og-share.png`; not `logo.png` as og/twitter image.
- Dashboard `index.html` still `lang="es"` and static title `Orvel`.
- `robots.txt`: disallow `/billing`, `/auth`, `/dashboard`, `/booking/manage`.
- `sitemap.xml`: includes `/`, `/plan`, `/terminos-y-condiciones`; excludes `/lanzamiento`, `/booking/`, `/billing`, `/auth`, `/dashboard`.
- `/lanzamiento` and `/plan` each have exactly one `h1` in the composed organisms.
- Footer Instagram href is the confirmed profile URL, not `#`.
- `index.astro` includes Organization and SoftwareApplication JSON-LD; `/plan` Layout usage does not pass homepage JSON-LD.
- `billing/subscription.astro` passes `noindex, nofollow`.
- `404.astro` exists and is Layout-backed.
- `og-share.png` IHDR is 1200×630; file is PNG.

`apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` (A): fixture config with a `/.*` 404 dest; after patch, `/booking(?:/.*)?` → `/dashboard/index.html` is before that 404 dest and after `handle: filesystem`.

### Slice B — rewriter + generated Vercel order

`booking-share-head.contract.spec.ts` **before** Edge wiring:

- Resolved name `Nails Nora` → title `Nails Nora · Reservá turno | Orvel`; canonical/`og:url` `https://orvel.pro/booking/nails-nora`; robots `noindex, follow`.
- Description starts with `Nails Nora: reservá turno online.`; at most three service names; no prices.
- Fixture RPC dump with `depositAlias`, `depositCbu`, `supportPhone`, emails, tokens: those strings **absent** from HTML; raw JSON dump absent.
- Unknown / missing name: generic Orvel title, `noindex`, SPA markers (`<app-root>`, manifest, scripts) still present; not a 404 document.
- Nested `/booking/nails-nora/ana` → canonical/`og:url` without `/ana`.
- `/booking/manage` and `?token=` → `isTenantBookingSharePath` false; rewriter not applied as tenant card.
- Rewriter does not strip scripts, `<app-root>`, or PWA tags; does not edit checked-in `index.html` on disk.
- `og:image` / `twitter:image` are `og-share.png`, not `logo.png`.

`vercel-booking-spa-route-order.contract.spec.ts` (B, same file extended) **before** rewriter product logic in the Edge entry:

- Given a fixture that already includes Astro routes + `handle: filesystem`, the patched config has the booking-share dest (or `middlewarePath`) matching tenant `/booking/:slug` at a **lower index** than `{ src: '/booking(?:/.*)?', dest: '/dashboard/index.html' }`.
- `/booking/manage` still reaches the SPA rewrite, not booking-share.

Do not require a full `build:vercel` for these tests. Optional later smoke may read a generated `.vercel/output/config.json` if present; it is not the red-green gate.

## Slice A vs Slice B Boundaries

| | Slice A | Slice B |
|---|---------|---------|
| Goal | Marketing crawl/share as the page being viewed | Booking share card names the business |
| Booking HTML head | Unchanged (`Orvel` shell) | Response-time rewrite |
| `404.astro` / robots / sitemap / Layout / H1 / Instagram / OG PNG | Yes | Reuses OG PNG only |
| `build-vercel` | SPA rewrite before 404 catch-all | Booking-share dest before `/booking` SPA rewrite |
| Astro middleware | Untouched | Untouched |
| Supabase | None | Anon RPC + `services.name` |
| Independently shippable? | Yes, if 404 order patch is included | Depends on A’s OG asset path; not on sitemap/H1 |
| Local proxy | Untouched | Untouched |

Do not start B rewriter work until the route-order contract for B is red then green.

## Rollout

1. Feature branch → PR to `dev` only. Do not pack A+B without a human `ask-on-risk` decision (forecast below).
2. Slice A: confirm marketing canonicals on `qa.orvel.pro` HTML (canonical host remains `https://orvel.pro`); confirm `/booking/{slug}` still loads the PWA after 404.astro.
3. Slice B: `curl -s` a resolved QA slug and assert title/OG/robots; `curl` `/booking/manage` and an unknown slug; confirm Angular still hydrates.
4. Production: WhatsApp/Instagram cache may stay stale until Facebook’s debugger is refreshed (accepted). Short `s-maxage` only limits **our** CDN, not WhatsApp.

No migrations. No Search Console work. No destructive Supabase commands.

## Rollback

- **Slice A:** revert the landing PR. Remove `robots.txt`, `sitemap.xml`, `404.astro`, `og-share.png`. Instagram and H1s return to current source. Restore `build-vercel` route patch if it shipped with A. No schema.
- **Slice B:** remove `booking-share.func` and its dest route so `/booking` is again a pure SPA rewrite. Do not leave a dest that 404s the PWA. Booking UX unchanged.
- Never half-apply a booking dest without a working shell fetch.

## Line-Count Forecast (ask-on-risk)

Review budget: **400** changed lines. Delivery strategy: **ask-on-risk**. No `chain_strategy`. No `size:exception`.

| Slice | Likely diff | vs 400 |
|-------|-------------|--------|
| A (Layout, robots, sitemap, 404, H1s, footer, OG PNG, SEO spec, 404-order extract/test) | ~280–420 | At or over budget if the PNG + spec are packed together |
| B (pure head/rewriter/match, Edge entry, build-vercel emit, privacy + route-order tests) | ~350–500 | Over budget |
| **A+B packed as one PR** | **~650–900** | **Exceeds 400. High risk.** |

Tasks MUST forecast per-slice and pause for a human delivery decision before packing A+B. Do not infer chaining or an exception from this forecast.

## Risks

1. **404 catch-all steals `/booking`** if slice A ships `404.astro` without the SPA-before-404 patch. Mitigate in A with the fixture contract.
2. **Share dest after SPA rewrite** → crawlers keep seeing `Orvel`. Mitigate in B with the order contract before Edge logic.
3. **Recursive fetch** if the Edge function fetches `/booking/{slug}` instead of `/dashboard/index.html`.
4. **Privacy leak** if RPC JSON is stringified into meta. Allowlist mapper + dump fixture tests.
5. **Accidental marketplace** if sitemap or `index,follow` lands on tenant URLs.
6. **Astro edge middleware mistaken for Vercel middleware** — documented and rejected.
7. **WhatsApp OG cache** outlives rename; accepted operational limit.
8. **Packed PR vs 400 lines** — pause; do not invent chain/exception.
9. **Local/QA drift** — proxy stays Orvel-titled; document.

## Non-Goals (design reminder)

Marketplace/directory, Angular SSR, privacy-policy page, GSC/ads, per-tenant OG generator, PWA manifest per tenant, dashboard `lang`/`title` source edits, 301 `/lanzamiento` → `/`, service-role preview, copying RPC dumps into HTML.
