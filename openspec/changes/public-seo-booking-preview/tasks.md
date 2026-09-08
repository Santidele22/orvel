# Tasks: public-seo-booking-preview

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Slice A ~280–420; Slice B ~350–500; packed A+B ~650–900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Slice A) → PR 2 (Slice B) |
| Delivery strategy | ask-on-risk |
| Chain strategy | deferred (sequential PRs to dev, not stacked) |

Decision needed before apply: No (resolved)
Chained PRs recommended: Yes (sequential independent PRs to `dev`)
Chain strategy: deferred — not stacked; Santi chose `split_sequential_dev`
400-line budget risk: High if packed; this apply is Slice A only and must stay a cohesive unit

**Delivery decision (ask-on-risk, resolved):** Two independent PRs targeting `dev`. This apply implements Slice A only (Phases 1–2). Do not implement Slice B. `size:exception` is not accepted.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Start / finish | Rollback |
|------|------|-----------|----------------------|----------------|----------|
| A | Marketing SEO + SPA-before-404 hosting patch + checked-in `og-share.png` | PR 1 | `pnpm --dir apps/landing run test` | Start: hosting extract + landing SEO contracts. Finish: marketing pages self-canonical; `/booking` still SPA after `404.astro`. | Revert landing SEO files, `og-share.png`, `scripts/vercel-output-config.mjs`, and the `build-vercel.mjs` call. |
| B | Booking-share dest before `/booking` SPA rewrite + allowlist HTML head | PR 2 | `pnpm --dir apps/landing run test` | Start: extend route-order contract. Finish: resolved slug head names the business; manage/unknown keep SPA. | Remove `booking-share.func` dest and Edge emit so `/booking` is a pure SPA rewrite. Do not leave a dest that 404s the PWA. |

Do not start Slice B rewriter product logic until the Slice B route-order contract is red then green.

---

## Phase 1: Slice A — SPA rewrite before 404 catch-all

- [x] 1.1 RED: add `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` that feeds a fixture `config.json` (Astro routes + `handle: filesystem` + a `/.*` 404 dest) into `scripts/vercel-output-config.mjs` and asserts `{ src: '/booking(?:/.*)?', dest: '/dashboard/index.html' }` is after filesystem and before the `/.*` 404 dest. Do not require `pnpm run build:vercel`. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 1.2 GREEN: extract unexported `patchVercelOutputConfig()` from `scripts/build-vercel.mjs` into `scripts/vercel-output-config.mjs` (pure route patch: filesystem → dashboard + booking SPA rewrites → remaining routes including 404 catch-all). Call it from `scripts/build-vercel.mjs`. Keep `/dashboard(?:/.*)?` rewrite. <!-- sdd-owner: implementation -->
- [x] 1.3 TRIANGULATE: same contract fixture with no filesystem handle still inserts `{ handle: filesystem }` then SPA rewrites; `/booking/manage` remains on the SPA rewrite dest, not a 404 dest. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 1.4 REFACTOR: keep the patch a testable pure function; no Edge booking-share dest in this phase. <!-- sdd-owner: implementation -->

---

## Phase 2: Slice A — Landing technical SEO

- [x] 2.1 RED: add `apps/landing/src/tests/landing-public-seo.contract.spec.ts` locking Layout source in `apps/landing/src/layouts/Layout.astro`: production origin `https://orvel.pro` + pathname (query stripped; trailing slash only on `/`); no hardcoded homepage-only canonical/`og:url`; `lang="es-AR"`; `og:locale` `es_AR`; optional `robots` prop defaulting `index, follow`; `og:image`/`twitter:image` `https://orvel.pro/og-share.png` with width 1200 and height 630; not `logo.png` as og/twitter image. Also lock `apps/dashboard/src/index.html` still `lang="es"` and static `<title>Orvel</title>`. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 2.2 GREEN: add `apps/landing/src/lib/public-origin.ts` (`MARKETING_ORIGIN`, canonical helper) and update `apps/landing/src/layouts/Layout.astro` to match 2.1. Do not change dashboard `index.html`. <!-- sdd-owner: implementation -->
- [x] 2.3 RED: extend `landing-public-seo.contract.spec.ts` for `apps/landing/public/robots.txt` (disallow `/billing`, `/auth`, `/dashboard`, `/booking/manage`; `Sitemap:` to marketing sitemap) and `apps/landing/public/sitemap.xml` (only `https://orvel.pro/`, `/plan`, `/terminos-y-condiciones`; exclude `/lanzamiento`, `/booking/`, `/billing`, `/auth`, `/dashboard`). Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 2.4 GREEN: add checked-in `apps/landing/public/robots.txt` and `apps/landing/public/sitemap.xml`. Do not add `@astrojs/sitemap` or `src/pages/sitemap.xml.ts`. <!-- sdd-owner: implementation -->
- [x] 2.5 RED: extend `landing-public-seo.contract.spec.ts` so `apps/landing/public/og-share.png` exists, is PNG, and IHDR is 1200×630. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 2.6 GREEN: create checked-in 1200×630 PNG at `apps/landing/public/og-share.png` (shared marketing + booking `og:image`). Keep `logo.png` for brand/JSON-LD logo only. <!-- sdd-owner: implementation -->
- [x] 2.7 RED: extend `landing-public-seo.contract.spec.ts` for: `apps/landing/src/components/organisms/CTA.astro` not `h1`; `apps/landing/src/components/organisms/Roadmap.astro` page title is `h1`; composed `/lanzamiento` and `/plan` each exactly one `h1`; `apps/landing/src/components/organisms/Footer.astro` Instagram `https://www.instagram.com/orvel.pro/` not `#`; `apps/landing/src/pages/index.astro` Organization + SoftwareApplication JSON-LD; `apps/landing/src/pages/plan.astro` does not pass homepage JSON-LD; `apps/landing/src/pages/billing/subscription.astro` `robots="noindex, nofollow"`; `apps/landing/src/pages/404.astro` exists, Layout-backed, `noindex, nofollow`. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 2.8 GREEN: demote CTA `h1`→`h2`; promote Roadmap title `h2`→`h1`; fix Footer Instagram; pass JSON-LD only from `index.astro`; billing robots prop; add `404.astro`. Do not 301 `/lanzamiento`. Do not edit `PrelaunchHero.astro` H1. Leave `terminos-y-condiciones.astro` inheriting Layout. Leave `apps/landing/src/middleware.ts` as signup 302 only. <!-- sdd-owner: implementation -->
- [x] 2.9 TRIANGULATE: leftover auth pages in `apps/landing/src/pages/auth*.astro` stay 302 (no Layout identity leak); sitemap has no tenant `/booking/{slug}`; `logo.png` is not og/twitter image. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [x] 2.10 REFACTOR: keep canonical helper in `public-origin.ts`; no booking rewriter files in this slice. <!-- sdd-owner: implementation -->

---

## Phase 3: Slice B — Booking-share dest before SPA rewrite

Do not implement rewriter/mapper/Edge entry in this phase.

- [ ] 3.1 RED: extend `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` so the patched fixture has a tenant booking-share dest matching `^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$` at a lower index than `{ src: '/booking(?:/.*)?', dest: '/dashboard/index.html' }`. Assert `/booking/manage` is not dest’d to booking-share. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 3.2 GREEN: update `scripts/vercel-output-config.mjs` to insert the booking-share dest before the `/booking` SPA rewrite. Do not enable Astro `middlewareMode: 'edge'`. Do not fold booking into `apps/landing/src/middleware.ts`. <!-- sdd-owner: implementation -->
- [ ] 3.3 TRIANGULATE: `/booking` with no slug and `/booking/manage` still hit `/dashboard/index.html`; filesystem handle remains first static phase. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 3.4 REFACTOR: keep route constants next to the existing SPA rewrite src strings in `scripts/vercel-output-config.mjs`. <!-- sdd-owner: implementation -->

---

## Phase 4: Slice B — Allowlist mapper and HTML rewriter

- [ ] 4.1 RED: add `apps/landing/src/tests/booking-share-head.contract.spec.ts` for `toBookingShareHead` in `apps/landing/src/lib/booking-share-head.ts`: resolved `Nails Nora` → title `Nails Nora · Reservá turno | Orvel`; canonical/`og:url` `https://orvel.pro/booking/nails-nora`; robots `noindex, follow`; description starts `Nails Nora: reservá turno online.` with ≤3 service names and no prices; fixture RPC dump with `depositAlias`/`depositCbu`/`supportPhone`/emails/tokens those strings absent from mapped head (not a JSON dump). Unknown/missing name → generic Orvel title + `noindex`. Nested slug still canonicalizes to `/booking/{slug}`. Image `https://orvel.pro/og-share.png` not `logo.png`. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 4.2 GREEN: implement `apps/landing/src/lib/booking-share-head.ts` allowlist mapper only. Reuse `normalizePublicBookingSlug` / `isValidPublicBookingSlug` from `packages/booking` for slug validation. Do not use service-role. <!-- sdd-owner: implementation -->
- [ ] 4.3 RED: extend `booking-share-head.contract.spec.ts` for `isTenantBookingSharePath` in `apps/landing/src/lib/booking-share-match.ts`: tenant `/booking/:slug` and nested professional true; `/booking/manage` and `?token=` false. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 4.4 GREEN: implement `apps/landing/src/lib/booking-share-match.ts`. <!-- sdd-owner: implementation -->
- [ ] 4.5 RED: extend `booking-share-head.contract.spec.ts` for `rewriteBookingShareHead` in `apps/landing/src/lib/booking-share-rewriter.ts` against a dashboard-shell fixture: upserts title/description/canonical/`og:*`/`twitter:*`/robots only; `<app-root>`, scripts, manifest, apple-touch-icon survive; checked-in `apps/dashboard/src/index.html` still static `<title>Orvel</title>` and `lang="es"`. Unknown slug is not a 404 document. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 4.6 GREEN: implement `apps/landing/src/lib/booking-share-rewriter.ts` as a pure HTML string upsert (not Cloudflare HTMLRewriter in tests). <!-- sdd-owner: implementation -->
- [ ] 4.7 TRIANGULATE: closed-account fixture that still returns a name uses that name (no distinct “not found” card); invalid slug → generic head; rewriter never writes alias/CBU/phone even if present on input. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 4.8 REFACTOR: mapper returns a new `BookingShareHead` object; rewriter receives only that object. <!-- sdd-owner: implementation -->

---

## Phase 5: Slice B — Edge function emit

- [ ] 5.1 RED: extend `booking-share-head.contract.spec.ts` (or a tiny sibling under `apps/landing/src/tests/`) so `apps/landing/src/edge/booking-share.ts` source fetches same-origin `/dashboard/index.html` (never `/booking/...`), uses only `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`, calls `resolve_business_by_slug` then `from('services').select('name')` with `is_active` true and `limit 3`, sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, and skips tenant rewrite when match is false. Assert no `SUPABASE_SERVICE_ROLE_KEY`. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 5.2 GREEN: implement `apps/landing/src/edge/booking-share.ts` using matcher + mapper + rewriter. RPC/network failure → generic Orvel head + SPA shell (never 404 the PWA). Query `token` exclude inside the function. <!-- sdd-owner: implementation -->
- [ ] 5.3 GREEN: update `scripts/build-vercel.mjs` to copy/bundle the Edge entry into `.vercel/output/functions/booking-share.func/` (Edge runtime). Do not extend `scripts/local-dev-proxy.mjs`. <!-- sdd-owner: implementation -->
- [ ] 5.4 TRIANGULATE: source contracts still forbid sitemap tenant slugs, UA allowlists, Angular SSR, and Astro `pages/booking/[slug].astro`. Run `pnpm --dir apps/landing run test`. <!-- sdd-owner: implementation -->
- [ ] 5.5 REFACTOR: keep Edge entry thin; no privileged landing API routes for previews. <!-- sdd-owner: implementation -->
