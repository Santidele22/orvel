# Apply Progress: public-seo-booking-preview

Work unit: **Slice A only** (Phases 1–2, checkboxes 1.1–2.10). Slice B was not implemented. No commit.

## Structured Status Consumed

- `changeName`: `public-seo-booking-preview`
- `applyState`: ready (parent override; native engine had been blocked on ambiguous change selection)
- `artifactStore`: openspec
- `actionContext.mode`: repo-local
- `allowedEditRoots`: `apps/landing/**`, `scripts/build-vercel.mjs`, `scripts/vercel-output-config.mjs`, this change’s `tasks.md` and `apply-progress.md`
- Delivery: `ask-on-risk` resolved as `split_sequential_dev`; this unit is PR 1 / Slice A; `size:exception` not accepted; chain strategy deferred (not stacked)

## Persisted Task Checkbox Updates

All Slice A implementation rows in `openspec/changes/public-seo-booking-preview/tasks.md` are `- [x]`:

- 1.1, 1.2, 1.3, 1.4
- 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10

## Completed Tasks

Phase 1 hosting-safety extract plus Phase 2 landing technical SEO. Dashboard `apps/dashboard/src/index.html` was not edited. `apps/landing/src/middleware.ts` remains signup 302 only. No booking-share mapper/rewriter/Edge files.

## Files Changed

- `scripts/vercel-output-config.mjs` (add) — pure `patchVercelOutputConfig`
- `scripts/build-vercel.mjs` — call extracted patch via `writePatchedVercelOutputConfig`
- `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` (add)
- `apps/landing/src/tests/landing-public-seo.contract.spec.ts` (add)
- `apps/landing/src/lib/public-origin.ts` (add)
- `apps/landing/src/layouts/Layout.astro`
- `apps/landing/src/pages/index.astro`
- `apps/landing/src/pages/404.astro` (add)
- `apps/landing/src/pages/billing/subscription.astro`
- `apps/landing/src/components/organisms/CTA.astro`
- `apps/landing/src/components/organisms/Roadmap.astro`
- `apps/landing/src/components/organisms/Footer.astro`
- `apps/landing/public/robots.txt` (add)
- `apps/landing/public/sitemap.xml` (add)
- `apps/landing/public/og-share.png` (add, 1200×630 PNG)

## Test Commands Run

- RED/GREEN focused: `pnpm --dir apps/landing exec vitest run src/tests/vercel-booking-spa-route-order.contract.spec.ts`
- RED/GREEN focused: `pnpm --dir apps/landing exec vitest run src/tests/landing-public-seo.contract.spec.ts`
- Combined: `pnpm --dir apps/landing exec vitest run src/tests/landing-public-seo.contract.spec.ts src/tests/vercel-booking-spa-route-order.contract.spec.ts` → **15 passed**

Note: `pnpm --dir apps/landing run test -- <file>` does not isolate Vitest to that file (script is `vitest run`). Focused runs used `pnpm --dir apps/landing exec vitest run <file>`.

Full `pnpm --dir apps/landing run test` still has **pre-existing** failures unrelated to this slice (auth/onboarding/signup contracts). Not fixed here.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` | Contract | N/A (new) | ✅ Written (module missing) | ✅ Passed after extract | ✅ 1.3 | ✅ 1.4 |
| 1.2 | same | Contract | N/A (new module) | ✅ 1.1 | ✅ Passed (3 later) | ✅ 1.3 | ✅ copies of rewrite objects |
| 1.3 | same | Contract | ✅ 1/1 then 3/3 | ✅ Written | ✅ Passed without extra product logic | ✅ no-filesystem + `/booking/manage` | ➖ in 1.4 |
| 1.4 | `scripts/vercel-output-config.mjs` | Contract | ✅ 3/3 | ➖ | ✅ Still 3/3 | ➖ | ✅ Pure function; no booking-share dest |
| 2.1 | `apps/landing/src/tests/landing-public-seo.contract.spec.ts` | Contract | N/A (new) | ✅ Layout + helper missing | ✅ 3/3 | ✅ query + trailing-slash cases | ➖ 2.10 |
| 2.2 | `public-origin.ts` + `Layout.astro` | Contract | ✅ dashboard lock passed | ✅ 2.1 | ✅ 3/3 | ➖ covered in 2.1 | ➖ |
| 2.3 | same SEO spec | Contract | ✅ 3/3 | ✅ ENOENT robots/sitemap | ✅ 5/5 | ➖ 2.9 tenant slug | ➖ |
| 2.4 | `robots.txt` + `sitemap.xml` | Contract | N/A (new) | ✅ 2.3 | ✅ 5/5 | ➖ | ➖ |
| 2.5 | same SEO spec | Contract | ✅ 5/5 | ✅ ENOENT og-share.png | ✅ 6/6 | ➖ | ➖ |
| 2.6 | `og-share.png` | Contract | N/A (new binary) | ✅ 2.5 | ✅ IHDR 1200×630 | ➖ | ➖ generator deleted |
| 2.7 | same SEO spec | Contract | ✅ 6/6 | ✅ 4 failed (CTA/footer/JSON-LD/404) | ✅ 10/10 | ➖ 2.9 | ➖ |
| 2.8 | CTA/Roadmap/Footer/index/billing/404/Layout slot | Contract | ✅ | ✅ 2.7 | ✅ 10/10 | ➖ | ➖ |
| 2.9 | same SEO spec | Contract | ✅ 10/10 | ✅ Written | ✅ 12/12 (+ 3 route tests = 15) | ✅ auth 302, no tenant slugs, no logo og | ➖ |
| 2.10 | `public-origin.ts` | Contract | ✅ 15/15 | ➖ | ✅ Still 15/15 | ➖ | ➖ None needed — helper already isolated; no rewriter files |

### Test Summary

- **Total tests written**: 15 (3 route-order + 12 public SEO)
- **Total tests passing** (this slice): 15
- **Layers used**: Contract/unit (15), Integration (0), E2E (0)
- **Approval tests**: None — no unrelated refactor of existing behavior beyond specified heading/meta/footer changes
- **Pure functions created**: `patchVercelOutputConfig`, `marketingCanonicalUrl`

## Deviations From Design

- None for Slice A. JSON-LD is a named `jsonLd` slot filled only by `index.astro`. Canonical origin is `https://orvel.pro` + pathname. `og-share.png` is checked in; `logo.png` remains JSON-LD logo only.
- Temporary PNG generator `apps/landing/public/_gen_og_share.py` was run then deleted; not part of the slice.

## Remaining Tasks (Slice B — not this work unit)

```text
- [ ] 3.1 RED: extend `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` so the patched fixture has a tenant booking-share dest matching `^/booking/(?!manage(?:/|$))([^/]+)(?:/[^/]+)?/?$` at a lower index than `{ src: '/booking(?:/.*)?', dest: '/dashboard/index.html' }`. Assert `/booking/manage` is not dest’d to booking-share. Run `pnpm --dir apps/landing run test`.
- [ ] 3.2 GREEN: update `scripts/vercel-output-config.mjs` to insert the booking-share dest before the `/booking` SPA rewrite. Do not enable Astro `middlewareMode: 'edge'`. Do not fold booking into `apps/landing/src/middleware.ts`.
- [ ] 3.3 TRIANGULATE: `/booking` with no slug and `/booking/manage` still hit `/dashboard/index.html`; filesystem handle remains first static phase. Run `pnpm --dir apps/landing run test`.
- [ ] 3.4 REFACTOR: keep route constants next to the existing SPA rewrite src strings in `scripts/vercel-output-config.mjs`.
- [ ] 4.1 RED: add `apps/landing/src/tests/booking-share-head.contract.spec.ts` ...
- [ ] 4.2 GREEN: implement `apps/landing/src/lib/booking-share-head.ts` ...
- [ ] 4.3 RED: extend `booking-share-head.contract.spec.ts` for `isTenantBookingSharePath` ...
- [ ] 4.4 GREEN: implement `apps/landing/src/lib/booking-share-match.ts`.
- [ ] 4.5 RED: extend `booking-share-head.contract.spec.ts` for `rewriteBookingShareHead` ...
- [ ] 4.6 GREEN: implement `apps/landing/src/lib/booking-share-rewriter.ts` ...
- [ ] 4.7 TRIANGULATE: closed-account fixture ...
- [ ] 4.8 REFACTOR: mapper returns a new `BookingShareHead` object; rewriter receives only that object.
- [ ] 5.1 RED: extend booking-share-head / sibling for Edge entry source ...
- [ ] 5.2 GREEN: implement `apps/landing/src/edge/booking-share.ts` ...
- [ ] 5.3 GREEN: update `scripts/build-vercel.mjs` to copy/bundle Edge entry ...
- [ ] 5.4 TRIANGULATE: source contracts still forbid sitemap tenant slugs, UA allowlists, Angular SSR, and Astro `pages/booking/[slug].astro`.
- [ ] 5.5 REFACTOR: keep Edge entry thin; no privileged landing API routes for previews.
```

## Workload / PR Boundary

- This apply is **PR 1 / Slice A** only (independent PR to `dev`, not stacked).
- Authored text churn (product + tests, excluding `openspec/` artifacts and binary PNG): **399 insertions** in new files + **45 insertions / 34 deletions** in tracked files ≈ **433 changed lines** of text. Binary `og-share.png` is additional (not line-oriented).
- Review budget is 400. Slice A cannot stay under 400 without deleting comments or tests. `size:exception` is **not** accepted; count reported honestly; no comment/test deletion to shrink.
- Next human delivery step after verify: open PR 1 to `dev`. Slice B is PR 2.

## actionContext Warnings

None. Edits stayed inside allowed surfaces. Dashboard `index.html` read-only. No Slice B files created.

---

# Slice B apply (this work unit)

Work unit: **Slice B Phases 3–4 only** (checkboxes 3.1–4.8). Phase 5 (5.1–5.5) stopped at the last green TDD checkpoint because authored product+test churn already exceeds the 400-line budget. No commit.

## Structured Status Consumed

- `changeName`: `public-seo-booking-preview`
- Native JSON had `applyState: blocked` / ambiguous change; parent override: ready after Slice A reset; continue Slice B
- `artifactStore`: openspec
- `actionContext.mode`: repo-local
- Delivery: `ask-on-risk`; chain deferred sequential independent PR to `origin/dev`; `size:exception` not accepted; max 400 lines for this unit
- `skill_resolution`: paths-injected

## Persisted Task Checkbox Updates

Marked `- [x]` in `openspec/changes/public-seo-booking-preview/tasks.md`:

- 3.1, 3.2, 3.3, 3.4
- 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8

Left `- [ ]`:

- 5.1, 5.2, 5.3, 5.4, 5.5

## Completed Tasks

Phase 3 inserts tenant booking-share dest before `/booking` SPA rewrite. Phase 4 allowlist mapper, path matcher, and pure HTML rewriter. No Edge emit, no `build-vercel.mjs` copy, no `middleware.ts` change, no dashboard `index.html` edit.

## Files Changed

- `scripts/vercel-output-config.mjs` — `BOOKING_SHARE_REWRITE` before `BOOKING_SPA_REWRITE`
- `apps/landing/src/tests/vercel-booking-spa-route-order.contract.spec.ts` — dest order + manage/no-slug SPA
- `apps/landing/src/tests/booking-share-head.contract.spec.ts` (add)
- `apps/landing/src/lib/booking-share-head.ts` (add)
- `apps/landing/src/lib/booking-share-match.ts` (add)
- `apps/landing/src/lib/booking-share-rewriter.ts` (add)

Not changed: `scripts/build-vercel.mjs`, `apps/landing/src/edge/booking-share.ts` (not created), `apps/landing/src/middleware.ts`, `apps/dashboard/src/index.html`.

## Test Commands Run

- RED/GREEN: `pnpm --dir apps/landing exec vitest run src/tests/vercel-booking-spa-route-order.contract.spec.ts`
- RED/GREEN: `pnpm --dir apps/landing exec vitest run src/tests/booking-share-head.contract.spec.ts`
- Combined: `pnpm --dir apps/landing exec vitest run src/tests/vercel-booking-spa-route-order.contract.spec.ts src/tests/booking-share-head.contract.spec.ts src/tests/landing-public-seo.contract.spec.ts` → **23 passed**

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `vercel-booking-spa-route-order.contract.spec.ts` | Contract | Slice A 3/3 | ✅ share dest missing | ✅ dest inserted | ✅ 3.3 | ✅ 3.4 constants |
| 3.2 | `scripts/vercel-output-config.mjs` | Contract | ✅ | ✅ 3.1 | ✅ 5/5 | ✅ 3.3 | ✅ HOSTING_ROUTES |
| 3.3 | same | Contract | ✅ | ✅ written with 3.1 | ✅ `/booking` + manage SPA; filesystem first | ✅ | ➖ 3.4 |
| 3.4 | `vercel-output-config.mjs` | Contract | ✅ 5/5 | ➖ | ✅ still 5/5 | ➖ | ✅ src constants beside SPA rewrites |
| 4.1 | `booking-share-head.contract.spec.ts` | Contract | N/A (new) | ✅ module missing | ✅ mapper | ➖ 4.7 | ➖ 4.8 |
| 4.2 | `booking-share-head.ts` | Contract | ✅ | ✅ 4.1 | ✅ 3/3 then 4 | ➖ | ✅ new object return |
| 4.3 | same | Contract | ✅ | ✅ match module missing | ✅ matcher | ➖ | ➖ |
| 4.4 | `booking-share-match.ts` | Contract | ✅ | ✅ 4.3 | ✅ | ➖ | ➖ |
| 4.5 | same | Contract | ✅ | ✅ rewriter missing | ✅ upsert | ➖ 4.7 | ➖ |
| 4.6 | `booking-share-rewriter.ts` | Contract | ✅ | ✅ 4.5 | ✅ shell tags survive | ➖ | ✅ string upsert, typed head only |
| 4.7 | same | Contract | ✅ 5/5 then 6/6 | ✅ written | ✅ closed-account name; invalid slug generic; secrets absent | ✅ | ➖ 4.8 |
| 4.8 | mapper + rewriter | Contract | ✅ 6/6 head + 5 route = 11; +12 SEO = 23 | ➖ | ✅ still 23 | ➖ | ✅ `BookingShareHead` new object; rewriter `(html, head)` only |

### Test Summary

- Slice B tests this unit: 11 (5 route-order + 6 head)
- Combined with Slice A SEO: 23 passed
- Layers: Contract (23), Integration (0), E2E (0)

## Deviations From Design

- None for Phases 3–4. Booking-share dest src/dest match the locked regex and `/booking-share`. Mapper reuses `packages/booking` slug helpers via relative import (landing `package.json` is outside allowed edit surfaces).
- Phase 5 Edge emit not started.

## Remaining Tasks

```text
- [ ] 5.1 RED: extend `booking-share-head.contract.spec.ts` (or a tiny sibling under `apps/landing/src/tests/`) so `apps/landing/src/edge/booking-share.ts` source fetches same-origin `/dashboard/index.html` (never `/booking/...`), uses only `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_ANON_KEY`, calls `resolve_business_by_slug` then `from('services').select('name')` with `is_active` true and `limit 3`, sets `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, and skips tenant rewrite when match is false. Assert no `SUPABASE_SERVICE_ROLE_KEY`. Run `pnpm --dir apps/landing run test`.
- [ ] 5.2 GREEN: implement `apps/landing/src/edge/booking-share.ts` using matcher + mapper + rewriter. RPC/network failure → generic Orvel head + SPA shell (never 404 the PWA). Query `token` exclude inside the function.
- [ ] 5.3 GREEN: update `scripts/build-vercel.mjs` to copy/bundle the Edge entry into `.vercel/output/functions/booking-share.func/` (Edge runtime). Do not extend `scripts/local-dev-proxy.mjs`.
- [ ] 5.4 TRIANGULATE: source contracts still forbid sitemap tenant slugs, UA allowlists, Angular SSR, and Astro `pages/booking/[slug].astro`. Run `pnpm --dir apps/landing run test`.
- [ ] 5.5 REFACTOR: keep Edge entry thin; no privileged landing API routes for previews.
```

## Workload / PR Boundary

- Cohesive Slice B PR for Phases 3–4 only (sequential independent PR to `dev`, not stacked on Slice A).
- Authored product+test churn (excluding `openspec/`): route-order **75/40**, `vercel-output-config.mjs` **13/11**, new files **172+80+17+50** ≈ **458 changed lines**.
- Review budget 400. Phase 5 not started. `size:exception` is not accepted. Count reported honestly; no comment/test deletion to shrink.
- Route dest is in config but Edge function is not emitted yet: shipping this PR alone would dest `/booking/{slug}` to a missing function. Do not merge until Phase 5 lands or the dest is reverted with the function.

## actionContext Warnings

None for allowed surfaces. Budget stop before Phase 5.

---

# Slice B Phase 5 apply (this work unit)

Work unit: **Slice B Phase 5 only** (checkboxes 5.1–5.5). Phases 3–4 reused; no rewriter/mapper rewrite. No commit.

## Structured Status Consumed

- `changeName`: `public-seo-booking-preview` (parent override; native JSON was ambiguous)
- Native `applyState: blocked` treated as non-blocking because parent selected this change and Phase 5 tasks were unchecked
- `artifactStore`: openspec
- `actionContext.mode`: repo-local
- Delivery: `ask-on-risk`; sequential PR to `origin/dev`; `size:exception` ACCEPTED by Santi for completing Slice B; this unit stayed under 400 authored product+test lines
- `skill_resolution`: paths-injected
- Strict TDD: `pnpm --dir apps/landing exec vitest run <files>`

## Persisted Task Checkbox Updates

Marked `- [x]` in `openspec/changes/public-seo-booking-preview/tasks.md`:

- 5.1, 5.2, 5.3, 5.4, 5.5

## Completed Tasks

Phase 5 Edge entry + Vercel Build Output emit. Matcher/mapper/rewriter reused. `local-dev-proxy.mjs`, `middleware.ts`, and dashboard `index.html` untouched.

## Files Changed

- `apps/landing/src/edge/booking-share.ts` (add) — Edge handler: same-origin `/dashboard/index.html`, anon RPC + `services.name` limit 3, Cache-Control on tenant rewrite, skip when `isTenantBookingSharePath` is false, generic head on RPC/network failure (HTTP 200)
- `apps/landing/src/tests/booking-share-edge.contract.spec.ts` (add) — source contracts for 5.1/5.3/5.4/5.5
- `scripts/build-vercel.mjs` — emit `.vercel/output/functions/booking-share.func/` (`runtime: edge`, `entrypoint: index.js`) via workspace esbuild bundle
- `openspec/changes/public-seo-booking-preview/tasks.md` — 5.1–5.5 checked
- `openspec/changes/public-seo-booking-preview/apply-progress.md` — this section

Not changed: Phases 3–4 libs except reuse, `scripts/local-dev-proxy.mjs`, `apps/landing/src/middleware.ts`, `apps/dashboard/src/index.html`.

## Test Commands Run

- RED 5.1: `pnpm --dir apps/landing exec vitest run src/tests/booking-share-edge.contract.spec.ts` → ENOENT `booking-share.ts`
- GREEN 5.2: same → 1 passed
- RED 5.3: emit source missing → 1 failed / 1 passed
- GREEN 5.3: same → 2 passed
- TRIANGULATE 5.4 + REFACTOR 5.5: same → 3 passed
- Combined keep-green: `pnpm --dir apps/landing exec vitest run src/tests/vercel-booking-spa-route-order.contract.spec.ts src/tests/booking-share-head.contract.spec.ts src/tests/landing-public-seo.contract.spec.ts src/tests/booking-share-edge.contract.spec.ts` → **26 passed**
- Smoke (not the red-green gate): esbuild bundle of the Edge entry to a temp dir succeeded (~738KB, includes `/dashboard/index.html`, no `SUPABASE_SERVICE_ROLE_KEY`)

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 | `booking-share-edge.contract.spec.ts` | Contract | Phases 3–4 23 tests | ✅ ENOENT edge entry | ✅ source strings | ✅ 5.4 | ✅ 5.5 |
| 5.2 | `apps/landing/src/edge/booking-share.ts` | Contract | ✅ 5.1 | ✅ 5.1 | ✅ 1/1 then 2/2 | ➖ 5.4 | ✅ thin mapper/rewriter calls |
| 5.3 | same spec + `scripts/build-vercel.mjs` | Contract | ✅ | ✅ emit strings missing | ✅ `.func` + edge runtime | ➖ | ➖ |
| 5.4 | same spec | Contract | ✅ 26 combined | ✅ written | ✅ sitemap/UA/SSR/Astro page forbidden | ✅ | ➖ |
| 5.5 | edge entry | Contract | ✅ 26 | ➖ | ✅ still 26 | ➖ | ✅ shorter service-name map; no privileged API |

### Test Summary

- Phase 5 tests this unit: 3
- Combined with Slice A + Phases 3–4: 26 passed
- Layers: Contract (26), Integration (0), E2E (0)

## Deviations From Design

- None. Edge fetches `/dashboard/index.html`, uses anon env only, allowlist mapper + rewriter, never 404s the PWA. Emit uses Build Output `.vc-config.json` `{ runtime: "edge", entrypoint: "index.js" }` because the repo had no prior function emit helper.
- esbuild is resolved from `node_modules/.pnpm/esbuild@*` (not a direct landing dependency).

## Remaining Tasks

None for implementation. All tasks 1.1–5.5 are `- [x]`.

## Workload / PR Boundary

- This apply is **Slice B Phase 5 only** (sequential independent PR to `dev` after Phases 3–4 in the same branch/worktree).
- Authored product+test churn excluding `openspec/`: new edge ~94 lines, new spec ~66 lines, `build-vercel.mjs` **37/2** ≈ **199 changed lines**.
- Review budget 400. This unit is under budget. `size:exception` was accepted for Slice B completeness but was not required for Phase 5 size.
- Do not commit (parent instruction).

## actionContext Warnings

None. Edits stayed on allowed surfaces.
