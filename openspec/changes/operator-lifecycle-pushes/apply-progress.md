# Apply progress: operator-lifecycle-pushes

Slice 1 shipped to prod via #1018 (ops 1–4). Slice 2 onboarding shipped on `feat/operator-lifecycle-onboarding` (f5a8a88 / PR #1024). This apply is slice 3 only (retention events 9–11). No commit. No push. No PR.

## Structured status consumed

- Parent resolved `changeName: operator-lifecycle-pushes`, `applyState: ready`, tasks 5.1–5.6 unchecked at start.
- Native engine JSON in the parent prompt was non-selected (`changeName: null`); parent override named this change and slice 3.
- `actionContext.mode`: repo-local. Workspace: `C:\Users\usuario\proyectos\orvel`.
- Branch: `feat/operator-lifecycle-retention` stacked on `feat/operator-lifecycle-onboarding` f5a8a88 / PR #1024.
- Artifact store: openspec. Delivery: ask-on-risk / feature-branch-chain. PR boundary: slice 3 retention only.
- Strict TDD active. Slice 2 already has size:exception; this slice does not.

## Completed tasks (persisted checkboxes `- [x]`)

Slice 1 (prior apply, already on prod):

- 1.1–1.4 unique idempotency helper
- 2.1–2.6 eleven-string allowlist + inbox union + nullable `appointmentId`
- 3.1–3.7 clock RPC 1–4 + Edge Function + `*/15` workflow
- 6.2 slice-1-only diff hygiene

Slice 2 (prior apply, stacked parent):

- 4.1 RED onboarding static contract (columns, branches 5–8, day-N, `once`)
- 4.2 RED `mark_booking_link_copied` + PWA install must not call it
- 4.3 GREEN additive `*_operator_lifecycle_onboarding.sql`
- 4.4 RED dashboard helper contract
- 4.5 GREEN helper + home/settings `copyBookingUrl()` wiring
- 4.6 TRIANGULATE default 09–18, PWA href, already-copied #7, cancelled public blocks #8, no `last_login_at`
- 4.7 REFACTOR shared helper next to `public-booking-url.ts`; pages keep copied/failed flags

Slice 3 (this apply):

- 5.1 RED retention static contract (columns, `#9` AFTER INSERT, once-flag + `booking:{id}`)
- 5.2 RED `#11` insert/update-to-cancelled at count 2, `customer:{id}:cancel-2`, no actor column
- 5.3 RED RPC `#10` LIVE_REARM, no `_assert_business_accepts_public_bookings` raise, clock must not insert `#9`/`#11`
- 5.4 GREEN additive `20260913120000_operator_lifecycle_retention.sql`
- 5.5 TRIANGULATE disabled turnero skip, operator cancels still notify, no `last_seen` / `last_login_at`
- 5.6 REFACTOR fail-open triggers vs `trg_enqueue_web_push_outbox`; no GRANT of triggers/helper to anon/authenticated

## Remaining tasks (unchecked)

- [ ] 6.1 Scoped green: Deno static + processor contracts above, plus `pnpm --dir apps/dashboard run test -- src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/tests/unit/operator-web-push-send.red.contract.spec.ts src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts` and slice-2 helper specs if that slice shipped. Then `pnpm run check` or the scoped equivalent before asking to merge.

## Files changed

Slice 2 (prior, kept for history):

| File | Action |
|------|--------|
| `supabase/migrations/20260912120000_operator_lifecycle_onboarding.sql` | Create — once-flag columns, RPC 1–8, `mark_booking_link_copied` |
| `supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | Extend — onboarding + copy-link contracts |
| `apps/dashboard/src/app/core/booking/mark-booking-link-copied.ts` | Create |
| `apps/dashboard/src/app/core/booking/mark-booking-link-copied.contract.spec.ts` | Create |
| `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.ts` | Wire `copyBookingUrl()` after successful `writeText` |
| `apps/dashboard/src/app/features/settings/pages/configuracion.page.ts` | Wire `copyBookingUrl()` after successful `writeText` |

Slice 3 (this apply):

| File | Action |
|------|--------|
| `supabase/migrations/20260913120000_operator_lifecycle_retention.sql` | Create — flags, `#9`/`#11` triggers, RPC 1–8 + `#10` |
| `supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | Extend — retention contracts 5.1–5.6 |
| `openspec/changes/operator-lifecycle-pushes/tasks.md` | Check 5.1–5.6 |
| `openspec/changes/operator-lifecycle-pushes/apply-progress.md` | This file |

## Test commands run

Safety net (existing static, before slice-3 tests):

```text
deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts
# 9 passed / 0 failed
```

RED then GREEN:

```text
deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts
# RED (5.1–5.3, missing *_operator_lifecycle_retention.sql): 9 passed / 3 failed
# GREEN after 5.4 / triangulate / refactor: 12 passed / 0 failed
```

Runtime harness: N/A — static SQL/contract only; triggers work after migrate even without cron secrets. No live DB.

6.1 not run (`pnpm run check` not executed).

## TDD Cycle Evidence

Slice 2 evidence (prior apply):

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `operator-lifecycle-pushes-static-contract.test.ts` | Contract (Deno SQL scan) | ✅ 7/7 | ✅ Written (missing `*_operator_lifecycle_onboarding.sql`) | ✅ 9/9 after SQL | ✅ day ≥1/#6 Mon–Fri enabled/`once`/no retention | ➖ SQL body |
| 4.2 | same | Contract | ✅ 7/7 | ✅ Written (missing `mark_booking_link_copied`) | ✅ SECURITY DEFINER + GRANT authenticated | ✅ PWA `window.location.href` does not call RPC | ➖ |
| 4.3 | onboarding SQL | Contract | — | ✅ | ✅ columns + RPC 5–8 + copy RPC | ✅ default 09–18 not HOURS_ALL_CLOSED | ➖ keep ops 1–4 |
| 4.4 | `mark-booking-link-copied.contract.spec.ts` | Contract (Vitest) | N/A (new) | ✅ Written (missing helper module) | ✅ 4/4 | ✅ professional + PWA copy excluded | ➖ |
| 4.5 | helper + home/settings | Contract | — | ✅ | ✅ RPC after `writeText` | ✅ clipboard flags unchanged on RPC error | ➖ |
| 4.6 | Deno + Vitest | Contract | ✅ | ✅ | ✅ | ✅ cancelled public counts; no `last_login_at`; already-copied `booking_link_copied_at IS NULL` | ➖ |
| 4.7 | helper path | — | ✅ 15/15 focused | ✅ | ✅ | ➖ structural | ✅ one helper next to `public-booking-url.ts` |

Slice 3 evidence (this apply):

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.1 | `operator-lifecycle-pushes-static-contract.test.ts` | Contract (Deno SQL scan) | ✅ 9/9 | ✅ Written (missing `*_operator_lifecycle_retention.sql`) | ✅ AFTER INSERT + once-flag + `booking:{id}` | ✅ cancelled first public still counts (no status filter) | ➖ |
| 5.2 | same | Contract | ✅ 9/9 | ✅ Written | ✅ count 2 + `customer:{id}:cancel-2` | ✅ no cancel-actor column; third cancel `<> 2` | ➖ |
| 5.3 | same | Contract | ✅ 9/9 | ✅ Written | ✅ `#10` LIVE_REARM + `booking:{last_public_id}` | ✅ zero-public stays `onboarding.share_day7`; clock omits `#9`/`#11` | ➖ |
| 5.4 | retention SQL | Contract | — | ✅ | ✅ columns + triggers + RPC 1–8+#10 | ✅ copy titles mapped to spec types | ➖ keep ops/onboarding |
| 5.5 | same Deno file | Contract | ✅ | ✅ | ✅ 12/12 | ✅ no `_assert_business_accepts_public_bookings`; no `last_seen`/`last_login_at`; no DROP of `trg_enqueue_web_push_outbox` | ➖ |
| 5.6 | triggers | Contract | ✅ 12/12 after refactor | ✅ | ✅ | ➖ grants | ✅ EXCEPTION WHEN OTHERS RETURN NEW; REVOKE trigger fns from PUBLIC/anon/authenticated |

### Test Summary

- **Total tests written (slice 3)**: 3 Deno retention contracts (plus 9 existing Deno kept green)
- **Total tests passing (focused)**: Deno 12/12
- **Layers used**: Unit/contract Deno
- **Approval tests** (refactoring): slice-1/2 contracts still green; enqueue fail-open trigger not dropped
- **Pure functions created**: 0 (SQL triggers + RPC branch)

## Deviations from design

- Spec `event_type` strings win (`retention.first_public_booking`, `retention.public_gap_7d`, `retention.customer_cancelled_twice`, not design aliases `retention.first_public` / `retention.public_gap` / `retention.second_cancel`).
- `#10` live gate inlines `public_turnero_disabled_at IS NULL` and closed-account skip; does not call `_assert_business_accepts_public_bookings` (would RAISE).
- `#9`/`#11` are instant triggers; clock RPC still inserts only `#1`–`#8` plus `#10`.

## Workload / PR boundary

- Chain: feature-branch-chain. Tracker `feat/operator-lifecycle-pushes` → `origin/dev`. This branch: `feat/operator-lifecycle-retention`.
- This apply is slice 3 retention only. Did not reopen slice 2 onboarding or dashboard copy-link.
- Authored line estimate: **~585** (`466` new migration + `119` static-test insertions + tasks/progress). Review budget 400; slice-3 forecast 250–420 / 450 attempt cap.
- Overage is the required `CREATE OR REPLACE` of `enqueue_operator_lifecycle_pushes` keeping ops 1–4 and onboarding 5–8 while adding `#10`. Cannot shrink further without dropping required branches or tests. Recommend `size:exception` for this slice’s PR; not applied here.
- Rollback: drop/no-op `#9`/`#11` triggers; `#10` branch no-op. Re-arm columns stay inert.

## Hygiene

- No `appointment-reminders-24h` edits
- No `process-email-outbox` drain
- No `pg_cron`
- No `20260824231000_create_web_push_outbox.sql` rewrite
- No client push / extra click URLs (click remains `/dashboard/turnos`)
- No dashboard copy-link helper/pages edits
- No `orvel-push-sw.js` edits
- Untracked trees (`apps/ops`, `videos`, sandbox tests, `.pi`, `.codegraph`) untouched
