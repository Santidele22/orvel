# Apply progress: operator-lifecycle-pushes

Slice 1 only (units 1a–1c + 6.2 hygiene). Slices 2–3 not started. No commit. No push.

## Structured status consumed

- Native `applyState` was `blocked` (ambiguous change selection among four active changes).
- Parent resolved selection to `operator-lifecycle-pushes`, granted proceed, `feature-branch-chain`, and `size:exception` for slice 1 only.
- `actionContext.mode`: repo-local. Edit roots: `openspec/changes/operator-lifecycle-pushes`, `supabase`, `apps/dashboard`, `.github/workflows`.
- Strict TDD active. Delivery: ask-on-risk / feature-branch-chain tracker `feat/operator-lifecycle-pushes` → `origin/dev`.
- PR boundary: slice 1 ops (events 1–4 + plumbing). Do not pack onboarding/retention.

## Completed tasks (persisted checkboxes `- [x]`)

- 1.1–1.4 unique idempotency helper
- 2.1–2.6 eleven-string allowlist + inbox union + nullable `appointmentId`
- 3.1–3.7 clock RPC 1–4 + Edge Function + `*/15` workflow
- 6.2 slice-1-only diff hygiene

## Remaining tasks (unchecked)

- [ ] 4.1 through 4.7 (slice 2 onboarding)
- [ ] 5.1 through 5.6 (slice 3 retention)
- [ ] 6.1 scoped green / `pnpm run check` after authorized slices (not claimed for this apply)

## Files changed

| File | Action |
|------|--------|
| `supabase/migrations/20260911120000_operator_lifecycle_ops.sql` | Create |
| `supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | Create |
| `supabase/functions/operator-lifecycle-pushes/index.ts` | Create |
| `.github/workflows/operator-lifecycle-pushes.yml` | Create |
| `supabase/config.toml` | `[functions.operator-lifecycle-pushes] verify_jwt = false` |
| `supabase/functions/_shared/process-web-push-outbox.ts` | Eleven spec strings on `OPERATOR_WEB_PUSH_EVENT_TYPES` |
| `supabase/functions/_shared/process-web-push-outbox.contract.test.ts` | Allowlist assertions |
| `apps/dashboard/src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts` | Create |
| `apps/dashboard/src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts` | Create |
| `apps/dashboard/src/app/core/notifications/internal-dashboard-notifications.api.ts` | Union + `appointmentId: string \| null` |
| `apps/dashboard/src/app/core/notifications/dashboard-notifications-once.contract.spec.ts` | Null `appointmentId` fixture |
| `openspec/changes/operator-lifecycle-pushes/tasks.md` | Slice-1 checkboxes |
| `openspec/changes/operator-lifecycle-pushes/apply-progress.md` | This file |

## Test commands run

Safety net (existing processor, `--allow-read`): 11 passed, 1 new RED for eleven types.

RED then GREEN:

```text
deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts
# RED: 0 passed / 7 failed (missing ops migration, function, workflow)
# GREEN after implement: 7 passed / 0 failed

deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/process-web-push-outbox.contract.test.ts
# RED: 11 passed / 1 failed (lifecycle types)
# GREEN: 12 passed / 0 failed

pnpm --dir apps/dashboard exec vitest run \
  src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts \
  src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts \
  src/app/core/notifications/dashboard-notifications-once.contract.spec.ts \
  src/app/tests/unit/operator-web-push-send.red.contract.spec.ts
# RED: 3 failed / 17 passed (4 files)
# GREEN: 20 passed / 0 failed (4 files)
```

Runtime harness: N/A — no live DB; clock stays silent until per-env `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL`, `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET`, and function `CRON_KEY` exist.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `operator-lifecycle-pushes-static-contract.test.ts` | Contract (Deno SQL scan) | N/A (new) | ✅ Written (missing ops migration) | ✅ 7/7 after SQL | ✅ unique_violation vs not-exists | ✅ `search_path = public, pg_temp` |
| 1.2 | same | Contract | N/A | ✅ | ✅ unique index + helper | ➖ production for 1.1 | ✅ no extra metadata columns |
| 1.3 | same | Contract | ✅ | ✅ | ✅ | ✅ unique_violation handler | ➖ None needed |
| 1.4 | same | Contract | ✅ | ✅ | ✅ | ➖ structural | ✅ SECURITY DEFINER + sibling search_path |
| 2.1 | `operator-lifecycle-enqueue-allowlist.contract.spec.ts` + kept red create-outbox | Contract (Vitest) | ✅ create-outbox 5/5 | ✅ eleven strings missing | ✅ latest enqueue names eleven | ✅ `deposit.claimed` / `system.welcome` absent; fail-open | ✅ one SQL IN-list |
| 2.2 | `process-web-push-outbox.contract.test.ts` | Unit/contract Deno | ✅ 11/11 existing | ✅ eleven types false | ✅ 12/12 | ✅ `deposit.claimed` false; url `/dashboard/turnos` | ✅ one TS const |
| 2.3 | `dashboard-lifecycle-inbox.contract.spec.ts` + once-contract | Contract (Vitest) | ✅ once-contract 8/8 | ✅ union + `appointmentId` type | ✅ 3/3 inbox + 9/9 once | ✅ null `appointmentId` fixture | ➖ types only |
| 2.4 | same as 2.1–2.3 | — | — | ✅ | ✅ enqueue replace + TS + inbox | — | — |
| 2.5 | 2.1 + 2.2 commands | Contract | ✅ | ✅ | ✅ historical create-outbox still green | ✅ fail-open remains | ➖ |
| 2.6 | process-web-push-outbox | — | ✅ | ✅ | ✅ | ➖ | ✅ processor auth unchanged |
| 3.1 | static contract | Contract | N/A | ✅ missing RPC | ✅ GRANT service_role only | ✅ RPC inserts only four ops types | ➖ |
| 3.2 | static contract | Contract | clone read-only | ✅ missing function/workflow | ✅ 401 before `rpc(` | ✅ secrets `exit 1`; curl `--output /dev/null` | ✅ auth shell |
| 3.3 | static contract | Contract | N/A | ✅ | ✅ briefing `[08:30,08:45)` spec window | ✅ first remaining ORDER BY + 60/90; empty yesterday; claim 15m not 30m | ➖ |
| 3.4 | ops SQL | Contract | — | ✅ | ✅ helper inserts 1–4 | ✅ operational Spanish copy | ➖ |
| 3.5 | `operator-lifecycle-pushes/index.ts` + workflow + config.toml | Contract | — | ✅ | ✅ | ✅ `*/15` + workflow_dispatch | ✅ no `service_role` caller secret |
| 3.6 | static contract | Contract | — | ✅ | ✅ | ✅ weekend ISODOW; copy-link pages untouched; reminders dir present | ➖ |
| 3.7 | Edge Function | — | — | ✅ | ✅ | ➖ | ✅ clock math stays in SQL |
| 6.2 | static + diff | Hygiene | — | ✅ | ✅ | ✅ no `pg_cron`, no create-outbox rewrite, no copy-link writes, no reminders edits | ➖ |

### Test Summary

- **Total tests written**: 7 Deno static + 1 Deno processor + 3 Vitest enqueue + 3 Vitest inbox + 1 once-contract case
- **Total tests passing (focused)**: Deno 19 (7 static + 12 processor), Vitest 20
- **Layers used**: Unit/contract Deno, Vitest contract
- **Approval tests** (refactoring): historical create-outbox red contract kept green
- **Pure functions created**: 0 (SQL helper + cron auth shell)

## Deviations from design

- Spec `event_type` strings win over design aliases (`lifecycle.*` not `ops.*`).
- Briefing local window is spec/clock `[08:30, 08:45)`, not design table `[08:30, 09:30)`.
- Empty-agenda has no extra local ≥ 08:30 gate (ops spec + task 3.3).
- Inbox union does not add `deposit.claimed` (not on the union today).

## Workload / PR boundary

- Chain: feature-branch-chain. Tracker `feat/operator-lifecycle-pushes` → `origin/dev`.
- This apply is slice 1 only. Do not pack 4.x / 5.x.
- Authored line count (implementation + slice-1 tests, excluding unrelated untracked trees): **~820** (tracked 71+/3− + new 746). Plus this progress file and task checkbox edits.
- Review budget 400; maintainer accepted **size:exception for slice 1 only**. Under 1500 attempt cap.
- Rollback: disable `.github/workflows/operator-lifecycle-pushes.yml`. Unique index + unused RPC may remain. Revert allowlist only if new types must not push.

## 6.2 hygiene

- No `appointment-reminders-24h` edits
- No `process-email-outbox` drain
- No `pg_cron`
- No `20260824231000_create_web_push_outbox.sql` rewrite
- No client push
- Click URL remains `/dashboard/turnos`
- No `mark_booking_link_copied` / `booking_link_copied_at` in home or settings
