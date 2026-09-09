# Apply progress: operator-lifecycle-pushes

Slice 1 shipped to prod via #1018 (ops 1–4). This apply is slice 2 only (onboarding events 5–8). Slice 3 retention not started. No commit. No push. No PR.

## Structured status consumed

- Parent resolved `changeName: operator-lifecycle-pushes`, `applyState: ready`, `nextRecommended: apply`.
- Task progress at start: 18/32 complete; this run implements 4.1–4.7 only. Leave 5.x and 6.1 unchecked.
- `actionContext.mode`: repo-local. Workspace: `C:\Users\usuario\proyectos\orvel`.
- Branch: `feat/operator-lifecycle-onboarding` from `origin/dev` (slice 1 already on prod).
- Artifact store: openspec. Delivery: ask-on-risk / feature-branch-chain. PR boundary: slice 2 onboarding only.
- Strict TDD active. No `size:exception` for this slice.

## Completed tasks (persisted checkboxes `- [x]`)

Slice 1 (prior apply, already on prod):

- 1.1–1.4 unique idempotency helper
- 2.1–2.6 eleven-string allowlist + inbox union + nullable `appointmentId`
- 3.1–3.7 clock RPC 1–4 + Edge Function + `*/15` workflow
- 6.2 slice-1-only diff hygiene

Slice 2 (this apply):

- 4.1 RED onboarding static contract (columns, branches 5–8, day-N, `once`)
- 4.2 RED `mark_booking_link_copied` + PWA install must not call it
- 4.3 GREEN additive `*_operator_lifecycle_onboarding.sql`
- 4.4 RED dashboard helper contract
- 4.5 GREEN helper + home/settings `copyBookingUrl()` wiring
- 4.6 TRIANGULATE default 09–18, PWA href, already-copied #7, cancelled public blocks #8, no `last_login_at`
- 4.7 REFACTOR shared helper next to `public-booking-url.ts`; pages keep copied/failed flags

## Remaining tasks (unchecked)

- [ ] 5.1 through 5.6 (slice 3 retention)
- [ ] 6.1 scoped green / `pnpm run check` after authorized slices (not claimed for this apply)

## Files changed

| File | Action |
|------|--------|
| `supabase/migrations/20260912120000_operator_lifecycle_onboarding.sql` | Create — once-flag columns, RPC 1–8, `mark_booking_link_copied` |
| `supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | Extend — onboarding + copy-link contracts; slice-1 page scan removed (ops SQL still forbids copy-link) |
| `apps/dashboard/src/app/core/booking/mark-booking-link-copied.ts` | Create |
| `apps/dashboard/src/app/core/booking/mark-booking-link-copied.contract.spec.ts` | Create |
| `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.ts` | Wire `copyBookingUrl()` after successful `writeText` |
| `apps/dashboard/src/app/features/settings/pages/configuracion.page.ts` | Wire `copyBookingUrl()` after successful `writeText` |
| `openspec/changes/operator-lifecycle-pushes/tasks.md` | Check 4.1–4.7 |
| `openspec/changes/operator-lifecycle-pushes/apply-progress.md` | This file |

## Test commands run

Safety net (existing static, before slice-2 tests):

```text
deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts
# 7 passed / 0 failed
```

RED then GREEN:

```text
deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts
# RED (4.1/4.2, missing onboarding migration): 7 passed / 2 failed
# GREEN after 4.3: 9 passed / 0 failed

pnpm --dir apps/dashboard exec vitest run src/app/core/booking/mark-booking-link-copied.contract.spec.ts
# RED (4.4, missing helper): 1 failed suite / 0 tests
# GREEN after 4.5: 4 passed / 0 failed

pnpm --dir apps/dashboard exec vitest run src/app/core/booking/mark-booking-link-copied.contract.spec.ts src/app/features/dashboard-home/pages/dashboard-home-page-mobile-gating.contract.spec.ts
# GREEN: 15 passed / 0 failed (2 files)
```

Runtime harness: N/A — clipboard is unit/contract; clock stays silent until per-env cron secrets exist. No live DB.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `operator-lifecycle-pushes-static-contract.test.ts` | Contract (Deno SQL scan) | ✅ 7/7 | ✅ Written (missing `*_operator_lifecycle_onboarding.sql`) | ✅ 9/9 after SQL | ✅ day ≥1/#6 Mon–Fri enabled/`once`/no retention | ➖ SQL body |
| 4.2 | same | Contract | ✅ 7/7 | ✅ Written (missing `mark_booking_link_copied`) | ✅ SECURITY DEFINER + GRANT authenticated | ✅ PWA `window.location.href` does not call RPC | ➖ |
| 4.3 | onboarding SQL | Contract | — | ✅ | ✅ columns + RPC 5–8 + copy RPC | ✅ default 09–18 not HOURS_ALL_CLOSED | ➖ keep ops 1–4 |
| 4.4 | `mark-booking-link-copied.contract.spec.ts` | Contract (Vitest) | N/A (new) | ✅ Written (missing helper module) | ✅ 4/4 | ✅ professional + PWA copy excluded | ➖ |
| 4.5 | helper + home/settings | Contract | — | ✅ | ✅ RPC after `writeText` | ✅ clipboard flags unchanged on RPC error | ➖ |
| 4.6 | Deno + Vitest | Contract | ✅ | ✅ | ✅ | ✅ cancelled public counts; no `last_login_at`; already-copied `booking_link_copied_at IS NULL` | ➖ |
| 4.7 | helper path | — | ✅ 15/15 focused | ✅ | ✅ | ➖ structural | ✅ one helper next to `public-booking-url.ts` |

### Test Summary

- **Total tests written**: 2 Deno onboarding + 4 Vitest helper (plus 7 existing Deno kept green)
- **Total tests passing (focused)**: Deno 9/9, Vitest 15/15 (4 helper + 11 mobile gating)
- **Layers used**: Unit/contract Deno, Vitest contract
- **Approval tests** (refactoring): slice-1 ops SQL still forbids copy-link; mobile gating still green
- **Pure functions created**: 1 (`markBookingLinkCopied`)

## Deviations from design

- Spec `event_type` strings win (`onboarding.share_day7`, not design alias `onboarding.zero_public`).
- `#6` HOURS_ALL_CLOSED is Monday–Friday `(value->>'enabled') = 'true'` (spec/tasks), not “any day of the week”.
- Slice-1 static contract no longer scans home/settings for copy-link (those pages are instrumented in slice 2). Ops migration still must not contain `mark_booking_link_copied`.

## Workload / PR boundary

- Chain: feature-branch-chain. Tracker `feat/operator-lifecycle-pushes` → `origin/dev`. This branch: `feat/operator-lifecycle-onboarding`.
- This apply is slice 2 onboarding only. Do not pack 5.x retention.
- Authored line estimate (implementation + slice-2 tests): **~590** (new migration 312 + helper 21 + helper spec 82 + static-test 161/−16 + pages 12 + tasks/progress). Review budget 400; slice-2 forecast 320–500. Overage is the required `CREATE OR REPLACE` of the full clock RPC (ops 1–4 must stay). Did not shrink by deleting comments/tests. No `size:exception` requested; slice cannot split further without packing retention or dropping required ops branches.
- Rollback: stop calling `mark_booking_link_copied`; revert helper + home/settings wiring + onboarding migration usage. Sent onboarding inbox rows stay.

## Hygiene

- No `appointment-reminders-24h` edits
- No `process-email-outbox` drain
- No `pg_cron`
- No `20260824231000_create_web_push_outbox.sql` rewrite
- No client push / extra click URLs (click remains `/dashboard/turnos`)
- No retention production SQL
- PWA install and `copyProfessionalBookingUrl` do not call `mark_booking_link_copied`
- Untracked trees (`apps/ops`, `videos`, sandbox tests, `.pi`, `.codegraph`) untouched
