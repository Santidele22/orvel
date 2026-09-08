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
