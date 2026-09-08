# Exploration: public-seo-booking-preview

Locked intent: landing technical SEO plus a **server-rendered HTML head** for `/booking/:slug` so WhatsApp/Instagram show the business, not the Angular SPA title `Orvel`. ICP: Argentine beauty businesses. Marketing surface: `apps/landing` (Astro 6, `output: 'server'`). Public booking remains the Angular PWA. Production host: `https://orvel.pro`.

Do not implement from this note. Do not turn the booking UX into a second app. Do not Angular-SSR the dashboard.

## Current State

### Hosting contract

- Root `vercel.json` is framework-null and builds with `pnpm run build:vercel` → `scripts/build-vercel.mjs`.
- Landing builds with `@astrojs/vercel` (`apps/landing/astro.config.mjs`: `output: 'server'`). Dashboard is a static Angular browser build copied to `.vercel/output/static/dashboard`.
- After the landing build, `patchVercelOutputConfig()` injects SPA rewrites **after** `handle: filesystem`:
  - `/dashboard(?:/.*)?` → `/dashboard/index.html`
  - `/booking(?:/.*)?` → `/dashboard/index.html`
- Local `scripts/local-dev-proxy.mjs` sends `/booking` to the Angular dev server (`/dashboard` + path). Crawler-style HTML for booking is **not** produced locally today.
- Public booking origin helper already canonicalizes production to `https://orvel.pro/booking/{slug}` (`packages/booking/src/domain/public-booking-url.ts`). QA stays on `qa.orvel.pro`.

Consequence: `/booking/*` never hits Astro page handlers in production. Any booking `<head>` solution **must** change that rewrite, insert an earlier Edge/middleware match, or both. `apps/landing/src/middleware.ts` only 302s `/auth/signup/credentials` → `/auth/signup/account`; it does not see rewritten booking URLs.

### Landing technical SEO (verified in source)

| Claim | Source verdict |
|---|---|
| No `robots.txt` / sitemap | Confirmed: no `robots.txt` or `sitemap*` in the repo. |
| Canonical + `og:url` hardcoded to `https://orvel.pro/` | Confirmed in `apps/landing/src/layouts/Layout.astro`. Every page that uses Layout advertises the homepage URL. |
| Default description exists; home overrides title/description | Confirmed. Default: “Gestioná turnos y clientes…”. Home (`index.astro`) sets title “Orvel — Menos ida y vuelta. Más salón.” and a distinct description. |
| OG image `https://orvel.pro/logo.png` (not 1200×630) | Confirmed. File is `apps/landing/public/logo.png` (wordmark, **800×400**). Same URL on `twitter:image`. |
| `html lang="es"` not `es-AR` | Confirmed. Dashboard `index.html` is also `lang="es"`. |
| No JSON-LD | Confirmed: no `application/ld+json` in landing. |
| `/lanzamiento` two H1s | Confirmed. `Hero.astro` H1 “Gestioná tu salón con intención.” plus `CTA.astro` H1 “Detené el caos. Subí el nivel.” |
| `/plan` no H1 | Confirmed. `plan.astro` wraps `Roadmap.astro`, whose heading is an `h2`. |
| `/billing/subscription` is index,follow | Confirmed. Layout hardcodes `<meta name="robots" content="index, follow" />`. No page overrides robots. No `noindex` anywhere under `apps/`. |
| No `404.astro` | Confirmed. |
| Footer Instagram `href="#"` | Confirmed in `apps/landing/src/components/organisms/Footer.astro`. No official handle in `infra/context/`. |

Other landing facts:

- Home (`/`) is the live marketing surface (prelaunch organisms). `/lanzamiento` is a second full marketing page (legacy organisms). `/prelanzamiento` 301s to `/`.
- `/auth/login` and `/auth/signup/plan` 302 into the dashboard in-app flows (not Layout pages).
- `/terminos-y-condiciones` exists and uses Layout.
- Landing already SSR-fetches public plan catalog via anon Supabase (`apps/landing/src/lib/plans.ts`). Same env pattern can call public RPCs; landing API routes also use service-role (must **not** be used for crawler previews).

### Public booking SPA

- Routes: `/booking/:slug`, `/booking/:slug/:professionalSlug`, `/booking/manage` (`apps/dashboard/src/app/app.routes.ts`).
- `apps/dashboard/src/index.html` static title is `Orvel`. Contract `sprint1-nav-shell-updates.contract.spec.ts` **locks** that string in the checked-in file. There is no Angular `Title`/`Meta` update after `resolveBusinessBySlug`. WhatsApp/Facebook crawlers (`facebookexternalhit`, WhatsApp) do not execute JS, so shares show “Orvel”.
- After load, the page sets `businessName` from `displayName` (and optionally ` · {professional}`) for in-app UI only.

### Public data available for a slug (no auth)

Constrained resolver (anon + authenticated EXECUTE): `public.resolve_business_by_slug(text)` — latest body `supabase/migrations/20260904240000_public_deposit_receipt_contact.sql`.

Returns JSON:

- Identity: `id`, `slug`, `name`, `timezone`
- Booking policy knobs (auto-confirm, cancel/reschedule, professional selection)
- Settings: slot/buffer/notice/`maxAdvanceDays`/`workingHours`
- Deposit: `depositEnabled`, `depositPercent`, **`depositAlias`, `depositCbu`**
- `supportPhone` (coalesce of settings phone, whatsapp column, **owner profile phone**)

Does **not** return: city, address, logo, cover, Instagram handle, service list, professional list.

Not in product schema for tenants:

- No `city` / address column on `public.businesses` (city exists only in internal `apps/ops` prospect CRM — not a public booking field).
- No SQL `logo_url` / `cover_url` column. Dashboard settings types mention `logoUrl`, but there is no matching migration. Do not plan per-business OG images from a column that is not in schema.

Active services: RLS policy `"Public view active services"` allows anon SELECT of `services` where `is_active` (name, duration, price, description). Public booking already loads them client-side via `ServicioService.getByBusinessId` after the slug resolve.

Privacy boundary for this change (already-public booking info only):

- **OK in crawler head:** business `name`, slug, canonical `/booking/{slug}`, optional short description built from **public active service names**, fallback Orvel OG image.
- **Not OK in meta/JSON-LD:** deposit alias/CBU, owner/support phone, emails, manage tokens, customer data, closed-account internals.
- **Do not sitemap every tenant slug.** That is a directory/marketplace, which is a product non-goal.

Gaps in the resolver vs booking RPCs:

- `create_public_booking` / availability call `_assert_business_accepts_public_bookings` (closed accounts). `resolve_business_by_slug` does **not**. A closed business can still resolve for a preview.
- `"Public view businesses"` and `"Public view settings"` remain `FOR SELECT USING (true)` from the consolidated schema. Preview code should keep using the slug RPC + active services, not widen table reads.

## Affected Areas (paths)

Landing SEO:

- `apps/landing/src/layouts/Layout.astro` — canonical, og:url, robots override, lang, JSON-LD slot, OG image, locale
- `apps/landing/src/pages/index.astro`, `lanzamiento.astro`, `plan.astro`, `billing/subscription.astro`, `terminos-y-condiciones.astro`
- `apps/landing/src/components/organisms/Hero.astro`, `CTA.astro`, `Roadmap.astro`, `Footer.astro`, `prelaunch/PrelaunchHero.astro`
- New: `apps/landing/public/robots.txt`, sitemap (static or SSR), `apps/landing/src/pages/404.astro`
- New OG asset under `apps/landing/public/` (1200×630) — do not keep using 800×400 `logo.png` as `og:image`
- Tests under `apps/landing/src/tests/` (new contract specs)

Booking preview (host + data, not a new app):

- `scripts/build-vercel.mjs` — rewrite order vs middleware/function
- Possibly `apps/landing/src/middleware.ts` **or** a Vercel Edge middleware emitted into `.vercel/output` (only if it actually runs before the booking rewrite)
- `scripts/local-dev-proxy.mjs` if local crawler tests need the same head
- `packages/booking/src/domain/public-booking-url.ts` (canonical origin already exists)
- `packages/booking/src/public-booking-slug.ts` (validation/normalization)
- Read-only: `resolve_business_by_slug`, public `services` RLS
- `apps/dashboard/src/index.html` stays the SPA shell; do not fight the “title is Orvel” contract by editing the static file for per-slug titles
- Avoid: Angular SSR, dashboard feature rewrite, `packages/shared/` extraction

Out of this change unless design reopens them: Google Search Console setup, ads, blog, privacy-policy content, seña/payments, marketplace.

## Approaches (booking server head)

Landing technical SEO is largely approach-independent (Layout + static files + a few page heading/robots fixes). The fork is how `/booking/:slug` gets a real HTML head.

### 1. Vercel Edge middleware + HTMLRewriter on the existing SPA shell (recommended)

Match `GET /booking/:slug` (and optionally `/:professionalSlug`). Exclude `/booking/manage` and query-token URLs. Fetch `resolve_business_by_slug` with the **anon** key. Rewrite only `<title>`, description, canonical, `og:*`, `twitter:*`, `lang`. Leave scripts, `<app-root>`, and PWA tags intact so the Angular UX is unchanged.

- Pros: Matches locked intent (head only). Crawlers that do not run JS still see the business. No second booking app. Static dashboard title contract can stay `Orvel`. Can cache rewritten HTML briefly (`Cache-Control` / CDN) keyed by slug.
- Cons: Must prove middleware runs **before** the `/booking → /dashboard/index.html` rewrite in the combined Vercel output. Local proxy will not preview unless extended. HTMLRewriter must be resilient if tags are missing. Edge CPU + one RPC per uncached share.
- Effort: Medium (hosting order + small rewriter + contract tests). Highest risk is route-order, not product code.

### 2. Astro SSR route that emits head + SPA shell

Add `apps/landing/src/pages/booking/[slug].astro` (server). Resolve slug, render unique head, then include the same dashboard bootstrap (script/link tags pointing at `/dashboard/` assets) or a tiny redirect/refresh into the SPA. Requires **removing or narrowing** the catch-all booking rewrite so Astro wins for `/booking/:slug`.

- Pros: First-class HTML, easy JSON-LD, uses existing Astro SSR + landing Supabase env. Natural place for `404` when slug missing.
- Cons: Tight coupling to dashboard asset URLs and `runtime-env.js` injection. Easy to accidentally ship a second “booking page” body. Rewrite patch in `build-vercel.mjs` becomes a merge conflict forever. Professional nested route and `/booking/manage` still need explicit exclusions. Heavier review surface.
- Effort: Medium–High.

### 3. Dedicated Edge Function (not middleware) that returns rewritten HTML

Same rewrite idea as (1), packaged as a Vercel Edge Function destination for `/booking/:slug` instead of middleware-on-the-static-file.

- Pros: Explicit route in output config; easier to reason than “does Astro middleware run?”
- Cons: Duplicates hosting surface (function + still need the SPA body). Same RPC/privacy work as (1). More build-script plumbing.
- Effort: Medium.

### 4. Build-time prerender of all public slugs

Generate static HTML per business at `build:vercel`.

- Pros: Fast crawler responses, no runtime RPC.
- Cons: Slugs are tenant data, not a marketing catalog. Needs a listing query (directory/marketplace). Stale names until rebuild. Closed businesses linger. Explicitly conflicts with “no marketplace” and privacy. Unfit.
- Effort: High and wrong product shape.

Rejected: Angular Universal / SSR of `apps/dashboard`. Locked non-goal. Would SSR operator chrome, auth, and PWA boot — far beyond share previews.

## Recommendation

Ship **two slices** under this change name. Delivery remains `ask-on-risk` (do not invent a chain or `size:exception` here). Together they will likely exceed a 400-line review; forecast at proposal/tasks.

**Slice A — Landing technical SEO** (no booking rewrite):

1. Per-URL canonical + `og:url` from `Astro.url` (production origin `https://orvel.pro`).
2. `lang="es-AR"`, `og:locale=es_AR`.
3. `robots.txt` + sitemap of **marketing URLs only** (`/`, `/plan`, `/terminos-y-condiciones`; decide `/lanzamiento` in Open Questions). Disallow `/billing`, `/auth`, `/dashboard`, `/booking/manage`.
4. Layout `robots` prop: `noindex, nofollow` on `/billing/subscription` (and any leftover auth Layout pages).
5. One H1 on `/lanzamiento` (demote CTA heading). One H1 on `/plan`.
6. `404.astro`.
7. Organization/SoftwareApplication JSON-LD on the home Layout path only.
8. Real 1200×630 OG/Twitter image; stop using `logo.png` for `og:image`.
9. Footer Instagram: only if Santi supplies a URL; otherwise hide the dead `#` control.

**Slice B — Booking share head**, Approach 1:

- Keep Angular PWA as the UX.
- Change hosting so crawlers receive rewritten `index.html` head for `/booking/:slug`.
- Title pattern (draft): `{name} · Reservá turno | Orvel`.
- Description: short, Spanish (Rioplatense), using name + at most a few **active public service names**. No prices required; no city (field does not exist).
- Canonical: `https://orvel.pro/booking/{slug}` (strip professional segment unless product later wants it).
- `og:image`: same new Orvel 1200×630 until a real public logo column exists.
- `noindex` vs `index` on tenant URLs is a product gate (Open Questions). Social crawlers still read OG when `noindex` is set.
- Never put deposit/phone/owner fields in the head.
- Unknown slug: fallback title “Orvel” + `noindex` (do not leak “not found” into OG image).
- Exclude `/booking/manage`.
- Do not add tenant slugs to the sitemap in v1.

Prefer proving Edge middleware order with a contract test on `scripts/build-vercel.mjs` / generated `config.json` before writing rewriter logic.

## Open Questions (product)

1. Should public booking URLs be **Google-indexable** (`index,follow`) or **share-only** (`noindex,follow`)? Share previews do not require Google index. Indexing every slug creates a de facto directory (marketplace non-goal).
2. Official Instagram URL for the landing footer, or remove the icon until one exists?
3. Keep `/lanzamiento` in the sitemap, 301 it to `/`, or leave it live but unlisted?
4. Unknown / closed-account slugs: generic Orvel card, or non-preview 404 for crawlers? Resolver currently succeeds for closed accounts.
5. Include `/booking/:slug/:professionalSlug` in unique OG titles (`{business} · {professional}`) or canonicalize to the business URL?
6. OG image: one Orvel 1200×630 for all tenants (v1), or later generated cards? No public logo column today.
7. Description: name-only vs name + up to N public service names (and is price allowed in OG text)?
8. Is `es-AR` required on the **dashboard SPA** `index.html` as well, or landing-only?

## Non-goals

Unless a later source change makes them required:

- Blog, privacy-policy page content, Google Search Console / Bing / ads setup
- Angular SSR of the dashboard or a new booking micro-frontend
- Marketplace, public business directory, sitemap of all slugs
- Marketing automation
- Changing seña / payments
- Storing or exposing city/address/logo that the schema does not have
- Putting deposit alias/CBU, phones, or manage tokens in meta tags
- Rewriting PWA install / `manifest.webmanifest` per tenant

## Risks

- **Rewrite vs middleware order.** If Edge code runs after `/booking` → `/dashboard/index.html`, crawlers keep seeing `Orvel`. This is the load-bearing hosting risk.
- **Privacy leak** if the rewriter dumps the full RPC JSON (alias, CBU, owner phone) into `og:description`.
- **Accidental marketplace** if the sitemap lists tenant slugs or if booking pages are `index,follow` without an explicit product yes.
- **Stale WhatsApp OG cache** (shares are cached by Facebook’s debugger; TTL + slug cache must be short enough for rename, long enough to protect Supabase).
- **Closed accounts** still resolve; previews could outlive public booking.
- **Local/QA drift:** proxy and `qa.orvel.pro` will not show production-like heads unless the same path is wired.
- **Review budget:** Layout + robots + sitemap + 404 + OG asset + booking middleware + build-script tests is High 400-line risk if packed as one PR.
- **Existing contract** locks dashboard static `<title>Orvel</title>`; per-slug titles must be response-time rewrites, not a source edit that breaks that spec.
- **`logo.png` as og:image** crops badly in WhatsApp even after head work if slice A does not ship a 1200×630 asset.
