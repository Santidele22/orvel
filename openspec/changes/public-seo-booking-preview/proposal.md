# Proposal: public-seo-booking-preview

## Intent

Make Orvel’s public marketing surface crawlable and shareable as itself, and make public booking links preview as the **business**, not the Angular SPA title `Orvel`.

WhatsApp and Instagram crawlers do not execute JS. Today they see `apps/dashboard/src/index.html` (`<title>Orvel</title>`) because production rewrites `/booking/*` to that shell. The landing Layout hardcodes canonical and `og:url` to `https://orvel.pro/`, has no robots/sitemap, no JSON-LD, a dead Instagram `href="#"`, and uses an 800×400 wordmark as `og:image`.

This change ships **technical SEO on `apps/landing`** plus a **server-rewritten HTML head** for `GET /booking/:slug`. Public booking UX stays the Angular PWA. Do not Angular-SSR the dashboard. Do not turn tenant slugs into a Google directory.

ICP: Argentine beauty businesses. Marketing origin: `https://orvel.pro`. QA stays on `qa.orvel.pro`.

## Confirmed product contract (do not reopen)

1. `/booking/:slug` robots: `noindex, follow` (share-only, not a Google directory).
2. Footer Instagram: `https://www.instagram.com/orvel.pro/`.
3. `/lanzamiento` stays live, excluded from sitemap, self-canonical.
4. Unknown slug: generic Orvel head + `noindex`; SPA still loads. If the resolver returns a name (including closed accounts), use that name.
5. `/booking/:slug/:professionalSlug` canonical + OG = `/booking/{slug}`.
6. One Orvel 1200×630 OG image for marketing and booking.
7. Booking description: `{name}: reservá turno online.` + up to 3 public active service names, no prices, never alias/CBU/phone.
8. `lang="es-AR"` on landing Layout only; dashboard `index.html` stays `lang="es"`.

## Why now

Operators already share `/booking/{slug}` as the product URL. Shares currently advertise Orvel, not the salon. Landing pages advertise the homepage URL even when they are not home. Both gaps are source-verified and cheap relative to the trust they cost.

Indexing every tenant slug would be a de facto marketplace. Product non-goals already forbid marketplace and marketing automation (`infra/context/product.md`). Share previews do not require Google index; `noindex, follow` on booking URLs is the contract that keeps SEO work inside marketing pages.

## Scope

Two slices under this change name. Slice A is independently shippable. Slice B depends on the new OG asset from A (same 1200×630 file) but not on marketing sitemap/H1 work.

### Slice A — Landing technical SEO

No booking rewrite.

1. Per-URL canonical + `og:url` from `Astro.url` with production origin `https://orvel.pro`.
2. `lang="es-AR"` and `og:locale=es_AR` on landing Layout only.
3. `robots.txt` plus a sitemap of **marketing URLs only**: `/`, `/plan`, `/terminos-y-condiciones`. Exclude `/lanzamiento`. Disallow `/billing`, `/auth`, `/dashboard`, `/booking/manage`.
4. Layout `robots` override: `noindex, nofollow` on `/billing/subscription` (and any leftover auth Layout pages).
5. One H1 on `/lanzamiento` (demote the CTA heading). One H1 on `/plan`.
6. `404.astro`.
7. Organization / SoftwareApplication JSON-LD on the home path only.
8. Real 1200×630 OG/Twitter image; stop using `logo.png` (800×400) as `og:image`.
9. Footer Instagram → `https://www.instagram.com/orvel.pro/`.

### Slice B — Booking share head (Approach 1)

Vercel Edge middleware + HTMLRewriter on the existing SPA shell for `GET /booking/:slug`.

- Keep Angular PWA as the UX. Do not Angular-SSR. Do not add an Astro booking page body.
- Exclude `/booking/manage` (and query-token manage URLs). Nested `/booking/:slug/:professionalSlug` may match the rewriter but MUST emit the business canonical and OG URL `/booking/{slug}`.
- Fetch `public.resolve_business_by_slug` with the **anon** key. Load at most three **public active** service names via existing public `services` RLS. Do not widen table reads. Do not use service-role.
- Rewrite only `<title>`, description, canonical, `og:*`, `twitter:*`, and robots. Leave scripts, `<app-root>`, and PWA tags intact.
- Title pattern: `{name} · Reservá turno | Orvel`. Unknown slug: generic Orvel title + `noindex`; SPA still loads.
- Description: `{name}: reservá turno online.` plus up to 3 public active service names. No prices. Never deposit alias/CBU, owner/support phone, emails, manage tokens, or customer data.
- `og:image`: the same new Orvel 1200×630 asset as slice A.
- Robots on tenant booking URLs: `noindex, follow`.
- Do **not** sitemap tenant slugs.
- Prefer proving Edge middleware runs **before** the `/booking → /dashboard/index.html` rewrite with a contract test on `scripts/build-vercel.mjs` / generated `config.json` before rewriter logic.

## Non-goals

- Marketplace, public business directory, sitemap of all tenant slugs.
- Marketing automation, blog, ads, Google Search Console / Bing setup.
- Privacy-policy page content.
- Angular SSR of `apps/dashboard` or a second booking micro-frontend.
- Changing seña / payments.
- Storing or exposing city, address, or per-business logo that the schema does not have.
- Putting deposit alias/CBU, phones, or manage tokens in meta / JSON-LD.
- Rewriting PWA install / `manifest.webmanifest` per tenant.
- Changing dashboard `index.html` `lang="es"` or the locked static `<title>Orvel</title>` source contract.
- 301 of `/lanzamiento` to `/`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/landing/src/layouts/Layout.astro` | Modify | Per-URL canonical/`og:url`, robots prop, `lang="es-AR"`, locale, OG image, JSON-LD slot |
| `apps/landing/src/pages/index.astro` | Modify | Home JSON-LD path; title/description stay page-owned |
| `apps/landing/src/pages/lanzamiento.astro` + organisms `Hero.astro` / `CTA.astro` | Modify | Self-canonical; one H1 (demote CTA) |
| `apps/landing/src/pages/plan.astro` + `Roadmap.astro` | Modify | One H1 |
| `apps/landing/src/pages/billing/subscription.astro` | Modify | `noindex, nofollow` |
| `apps/landing/src/pages/terminos-y-condiciones.astro` | Keep/light | Uses Layout; inherit per-URL canonical |
| `apps/landing/src/components/organisms/Footer.astro` | Modify | Instagram URL |
| `apps/landing/public/robots.txt` | Add | Disallow private surfaces |
| Landing sitemap (static or SSR) | Add | Marketing URLs only |
| `apps/landing/src/pages/404.astro` | Add | Custom 404 |
| New 1200×630 OG asset under `apps/landing/public/` | Add | Shared marketing + booking `og:image` |
| `apps/landing/src/tests/` | Add/modify | Landing SEO contract specs |
| `scripts/build-vercel.mjs` | Modify | Prove middleware/function order vs `/booking` SPA rewrite |
| Vercel Edge middleware + HTMLRewriter (landing middleware **or** emitted Edge in `.vercel/output`) | Add | Slice B head rewrite; must run before SPA rewrite |
| `scripts/local-dev-proxy.mjs` | Maybe | Only if local crawler tests need the same head |
| `packages/booking/src/domain/public-booking-url.ts` | Keep/reuse | Production canonical origin already exists |
| `packages/booking/src/public-booking-slug.ts` | Keep/reuse | Slug validation/normalization |
| `public.resolve_business_by_slug` + public `services` RLS | Read-only | Anon preview data; no RPC body dump into meta |
| `apps/dashboard/src/index.html` | Keep | Static title remains `Orvel`; `lang="es"` unchanged |
| `apps/landing/src/middleware.ts` (today signup 302 only) | Maybe | Only if it is the Edge entry that actually sees `/booking` |

Avoid: Angular SSR, dashboard feature rewrite, `packages/shared/` extraction.

## Capabilities

### New capabilities

- **landing-technical-seo** — per-URL canonical, marketing-only sitemap/`robots.txt`, billing `noindex`, heading fixes, 404, home JSON-LD, 1200×630 OG, Instagram footer.
- **booking-share-head** — Edge HTMLRewriter of the SPA shell for `GET /booking/:slug` so non-JS crawlers see business name, share-only robots, and a privacy-safe description.

### Modified capabilities

- **public-booking-url** — unchanged UX and origin helper; crawler responses gain a rewritten head. Nested professional URLs canonicalize to the business URL.
- **landing-layout-identity** — Layout stops advertising the homepage as every page’s canonical/`og:url`.

## Approach

Landing SEO is Layout + static files + a few page heading/robots fixes (slice A).

Booking head is **Approach 1** from exploration: Vercel Edge middleware + HTMLRewriter on the existing SPA shell. Rejected for this change:

- Astro SSR booking route (second page body risk, dashboard asset coupling).
- Dedicated Edge Function destination (extra hosting surface without a product gain).
- Build-time prerender of all slugs (marketplace shape, stale names).
- Angular Universal / dashboard SSR (locked non-goal).

Privacy: crawler head MAY include business `name`, slug, canonical `/booking/{slug}`, up to 3 public active service names, fallback Orvel OG. MUST NOT include deposit alias/CBU, owner/support phone, emails, manage tokens, customer data, or closed-account internals beyond the public `name` the resolver already returns.

Delivery: `ask-on-risk`, review budget **400** changed lines. Slices A+B packed as one PR are **High 400-line risk**. Do **not** invent `chain_strategy` or `size:exception` in this proposal. Tasks MUST forecast size per slice and pause for a human delivery decision if the packed diff would exceed 400 lines.

Strict TDD where tests exist: landing contract specs for canonical/robots/sitemap/H1/JSON-LD; build-output contract for middleware-before-rewrite **before** rewriter logic; rewriter unit tests that assert privacy (no alias/CBU/phone) and unknown-slug fallback.

## Impact

- **Prospective customers / crawlers:** marketing pages self-describe; WhatsApp/Instagram shares of a booking link show the salon name and public services, not “Orvel”.
- **Operators:** same share URL and same Angular booking UX; no new operator settings.
- **Google:** marketing URLs may be indexed; tenant booking URLs MUST NOT become a directory (`noindex, follow`, no slug sitemap).
- **Support / privacy:** unknown slugs do not get a distinct “not found” OG card; closed accounts that still resolve show the returned name.
- **Local/QA:** production-like booking heads require the Edge path; local proxy does not emit them today unless slice B extends it.

## Risks

1. **Rewrite vs middleware order.** If Edge code runs after `/booking` → `/dashboard/index.html`, crawlers keep seeing `Orvel`. Load-bearing hosting risk. *Mitigation:* contract-test generated Vercel `config.json` / rewrite order before rewriter work.
2. **Privacy leak.** Dumping full `resolve_business_by_slug` JSON into `og:description` would expose alias, CBU, and owner phone. *Mitigation:* allowlist name + up to 3 public service names; contract tests forbid those fields.
3. **Accidental marketplace.** Sitemap of tenant slugs or `index,follow` on booking URLs. *Mitigation:* confirmed `noindex, follow`; marketing-only sitemap; explicit non-goal.
4. **Packed PR vs 400-line budget.** Layout + robots + sitemap + 404 + OG asset + middleware + build-script tests will likely exceed 400 lines. *Mitigation:* `ask-on-risk`; tasks forecast per slice; do not invent chaining or `size:exception` here.
5. **Stale WhatsApp OG cache.** Facebook caches share cards. *Mitigation:* short slug-keyed HTML cache; operators may still need debugger refresh after rename (accepted operational limit).
6. **Closed accounts still resolve.** Previews can outlive public booking. *Mitigation:* confirmed — if resolver returns a name, use it; do not invent a closed-account 404.
7. **Local/QA drift.** `scripts/local-dev-proxy.mjs` and `qa.orvel.pro` may not match production heads. *Mitigation:* document; extend proxy only if crawler tests require it.
8. **Dashboard title contract.** `sprint1-nav-shell-updates.contract.spec.ts` locks static `<title>Orvel</title>`. *Mitigation:* response-time rewrite only; do not edit the checked-in shell for per-slug titles.
9. **Wrong OG size.** Keeping `logo.png` as `og:image` crops badly in WhatsApp even after head work. *Mitigation:* slice A ships 1200×630; slice B reuses it.

## Rollback Plan

- **Slice A:** revert the landing PR. Remove `robots.txt` / sitemap / `404.astro` / new OG asset. Footer Instagram and H1s return to current source. No schema.
- **Slice B:** revert Edge middleware / HTMLRewriter and any `build-vercel.mjs` order change so `/booking` is again a pure SPA rewrite. Booking UX is unchanged. Do not leave a half-applied rewrite that 404s the PWA.
- Do not run destructive Supabase commands or migration repair. Slice B is read-only against existing RPCs/RLS.

## Dependencies

- Existing `public.resolve_business_by_slug` (anon EXECUTE) and `"Public view active services"` RLS.
- `packages/booking` public URL + slug helpers.
- Root `scripts/build-vercel.mjs` SPA rewrite for `/booking` (must be ordered relative to Edge).
- Landing `@astrojs/vercel` `output: 'server'` and anon Supabase env already used for public plan catalog — **not** service-role (landing API routes that use service-role MUST NOT be used for crawler previews).
- No Google Search Console, ads, or new schema columns.

## Success Criteria

- [ ] Every Layout marketing page emits a self canonical and `og:url` for that path on `https://orvel.pro` (not a hardcoded homepage URL).
- [ ] `robots.txt` and sitemap list only marketing URLs (`/`, `/plan`, `/terminos-y-condiciones`); `/lanzamiento` is live, self-canonical, and absent from the sitemap.
- [ ] `/billing/subscription` is `noindex, nofollow`.
- [ ] `/lanzamiento` and `/plan` each have one H1.
- [ ] Landing Layout is `lang="es-AR"`; dashboard `index.html` remains `lang="es"` with static title `Orvel`.
- [ ] Home includes Organization/SoftwareApplication JSON-LD; other pages do not inherit a false homepage identity.
- [ ] Marketing and booking `og:image` is one 1200×630 Orvel asset, not `logo.png`.
- [ ] Footer Instagram points at `https://www.instagram.com/orvel.pro/`.
- [ ] `GET /booking/:slug` HTML for non-JS crawlers includes business name in title/OG when the resolver returns a name; robots `noindex, follow`; description matches the confirmed pattern with ≤3 public active service names and no prices/alias/CBU/phone.
- [ ] Nested professional URLs canonicalize + OG to `/booking/{slug}`.
- [ ] Unknown slug: generic Orvel head + `noindex`; SPA still loads.
- [ ] `/booking/manage` is excluded from the rewriter.
- [ ] Tenant slugs are not in the sitemap.
- [ ] Contract tests cover landing SEO, Vercel rewrite-vs-middleware order, and rewriter privacy; `pnpm run check` (or scoped landing + build-script contracts) green before asking to merge.
- [ ] Non-goals above are absent from the diff.

## Delivery

- Strategy: `ask-on-risk`.
- Review budget: 400 changed lines.
- Intended slices: (A) landing technical SEO → (B) Edge HTMLRewriter for `GET /booking/:slug`.
- Combined slices packed as one PR: **High** 400-line risk. Pause at tasks for a human delivery decision. Do not invent `chain_strategy` or `size:exception`.

## References

- Exploration: `openspec/changes/public-seo-booking-preview/exploration.md`
- Pre-proposal (confirmed): `openspec/changes/public-seo-booking-preview/preproposal.md`
- Product non-goals: `infra/context/product.md` (no marketplace, no marketing automation)
- Landing agent rules: `apps/landing/AGENTS.md`
- Hosting: `scripts/build-vercel.mjs`, `apps/landing/astro.config.mjs`
- Public booking origin: `packages/booking/src/domain/public-booking-url.ts`
