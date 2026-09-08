# Apply progress: close-deposit-coordination

## Work unit

PR 1 of 4 — Turnos confirm + split labels (`feat/close-deposit-coordination-s1`).

- delivery_strategy: ask-on-risk (human chose split)
- chain_strategy: stacked-to-main (Orvel integration branch is `dev`, not `main`)
- size:exception: not accepted
- max-changed-lines: 400

## Structured status consumed

Native engine initially reported `applyState: blocked` with ambiguous change selection (`chore-docs-and-context-align-release-2-0`, `close-deposit-coordination`). Parent assigned `close-deposit-coordination` work unit 1. `actionContext.mode: repo-local`; edits stayed inside allowed surfaces.

## Completed this slice

Persisted checkboxes in `tasks.md` marked `- [x]` for 1.1–1.7.

- 1.1 RED: dashboard.service.spec.ts locks `pending` → `Pendiente de seña`, `claim_pending` → `Seña avisada`, `depositPending` true for both.
- 1.2 RED: Turnos list + mobile card + mobile detail contracts require Confirmar seña and `data-testid="deposit-claimed-highlight"`.
- 1.3 RED/lock: Inicio contract still requires Confirmar seña / `dashboardService.confirmDepositReceived` and forbids `claimBookingDeposit`.
- 1.4 GREEN: `appointmentStatusLabel` splits unpaid labels; `isDepositUnpaid` unchanged; `index.ts` not edited.
- 1.5 GREEN: Turnos list, mobile card, and mobile detail call existing `DashboardService.confirmDepositReceived`.
- 1.6 TRIANGULATE: confirm gated by `isDepositUnpaid` / `depositPending` (pending-only works); claimed highlight is source-present and may have no rows; no auto-confirm; `dashboard-home.page.{ts,html}` not edited.
- 1.7 REFACTOR: no second confirm RPC client; unpaid gate remains `isDepositUnpaid`.

## Files changed

- `packages/booking/src/application/booking-record.ts`
- `apps/dashboard/src/app/core/dashboard/__tests__/dashboard.service.spec.ts`
- `apps/dashboard/src/app/features/booking/pages/turnos-list.page.ts`
- `apps/dashboard/src/app/features/booking/pages/turnos-list.page.html`
- `apps/dashboard/src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts`
- `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.component.ts`
- `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.component.html`
- `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts`
- `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.ts`
- `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.html`
- `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts`
- `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home-page-mobile-summary.contract.spec.ts`
- `openspec/changes/close-deposit-coordination/tasks.md`
- `openspec/changes/close-deposit-coordination/apply-progress.md`

`dashboard.service.ts` and `dashboard-home.page.{ts,html}` were not modified.

## Test commands

Safety net (before production edits):

`pnpm --dir apps/dashboard exec vitest run` on the five focused spec files → **75 passed**.

RED after new contracts: **7 failed / 75 passed** (82 total). 1.3 Inicio lock stayed green.

GREEN / TRIANGULATE / REFACTOR:

`pnpm --dir apps/dashboard exec vitest run src/app/core/dashboard/__tests__/dashboard.service.spec.ts src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts src/app/features/dashboard-home/pages/dashboard-home-page-mobile-summary.contract.spec.ts`

→ **5 files, 82 passed**.

Note: `pnpm --dir apps/dashboard run test -- <paths>` does not filter on this repo (runs the full Vitest suite). Use `pnpm --dir apps/dashboard exec vitest run <paths>`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `apps/dashboard/src/app/core/dashboard/__tests__/dashboard.service.spec.ts` | Unit | ✅ 75/75 focused | ✅ Written (claim_pending label failed) | ✅ 82/82 | ✅ pending vs claim_pending | ➖ None needed |
| 1.2 | turnos-list + mobile-appointment-card + mobile-turno-detail contract specs | Contract | ✅ included in 75/75 | ✅ Written (Confirmar seña / highlight failed) | ✅ 82/82 | ✅ list + card + detail | ➖ None needed |
| 1.3 | `dashboard-home-page-mobile-summary.contract.spec.ts` | Contract | ✅ included | ✅ Lock written; already green (Inicio confirm exists) | ✅ 82/82 | ✅ `dashboardService.confirmDepositReceived` + no `claimBookingDeposit` | ➖ None needed |
| 1.4 | same dashboard.service.spec.ts | Unit | ✅ | (RED from 1.1) | ✅ split labels | ✅ both unpaid states | ➖ `isDepositUnpaid` kept as gate |
| 1.5 | Turnos/mobile contracts | Contract | ✅ | (RED from 1.2) | ✅ wrappers call existing service | ✅ pending gate via `depositPending`/`isDepositUnpaid` | ➖ no second RPC client |
| 1.6 | same contracts | Contract | ✅ | covered in 1.2/1.3 | ✅ | ✅ pending-only confirm; claimed highlight source-only; never auto-confirm | ➖ home pages untouched |
| 1.7 | grep/contracts | Contract | ✅ | N/A | ✅ | ➖ structural | ✅ no second confirm client; unpaid gate `isDepositUnpaid` |

## Deviations from design

None. Confirm reuses `DashboardService.confirmDepositReceived`. Labels: pending `Pendiente de seña`, claim_pending `Seña avisada`. Inicio confirm kept. No claim CTA, reject, migrations, or cron.

## Remaining tasks

Phase 1 complete. Unchecked implementation rows:

- [ ] 2.1 RED: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — `claim_booking_deposit` INSERT `dashboard_notifications` `event_type='deposit.claimed'`, `appointment_id`=booking id, no `EXCEPTION WHEN OTHERS`, never `paid`, no `_business` outbox. <!-- sdd-owner: implementation -->
- [ ] 2.2 GREEN: additive `supabase/migrations/<ts>_claim_booking_deposit_notify.sql` (same transaction as status). <!-- sdd-owner: implementation -->
- [ ] 2.3 RED: `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` delegates `claimBookingDeposit({ manageToken, note? })`. <!-- sdd-owner: implementation -->
- [ ] 2.4 GREEN: add claim on `packages/booking/src/gateway-interface.ts`, `packages/booking/src/types.ts`, `packages/booking/src/infrastructure/supabase/real-gateway.ts`, `packages/booking/src/infrastructure/supabase/api-wrapper.ts`, `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`. <!-- sdd-owner: implementation -->
- [ ] 2.5 RED: `apps/dashboard/src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts` — Ya transferí; unlock `No hace falta volver acá`; no `pago recibido`; WhatsApp optional not the aviso. <!-- sdd-owner: implementation -->
- [ ] 2.6 GREEN: CTA in `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts` and `apps/dashboard/src/app/features/booking/pages/public/public-booking.page.{ts,html}` using session `manageToken`. <!-- sdd-owner: implementation -->
- [ ] 2.7 TRIANGULATE: notify insert fail ⇒ claim fails, stay `pending`, no success “avisamos”; no instructions-email manage CTA. <!-- sdd-owner: implementation -->
- [ ] 2.8 REFACTOR: keep WhatsApp helper optional; copy constants only in hold module. <!-- sdd-owner: implementation -->
- [ ] 3.1–3.7 and 4.1–4.8 remain unchecked (slices 3–4).

## Workload / PR boundary

- Authored production+test diff (excluding OpenSpec): **12 files, 173 insertions, 13 deletions** (`git diff --stat`).
- Under 400-line budget. No `size:exception`.
- Current PR boundary: PR 1 of 4 on `feat/close-deposit-coordination-s1`. Follow-up: slice 2 on a later stacked branch targeting `dev`.
- Did not commit or push.

## Not done

No commit, no push, no PR. Slices 2–4 not implemented.

---

## Work unit 2

PR 2 of 4 — Ya transferí + atomic dashboard notify (`feat/close-deposit-coordination-s2` from `origin/dev`; slice 1 already on `dev` via #995).

- delivery_strategy: ask-on-risk (split chosen)
- chain_strategy: stacked-to-main (Orvel integration is `dev`)
- size:exception: not accepted
- max-changed-lines: 400

## Structured status consumed

Native engine reported `applyState: blocked` with ambiguous change selection. Parent assigned `close-deposit-coordination` work unit 2 only. `actionContext.mode: repo-local`; edits stayed inside allowed surfaces plus `packages/booking/src/infrastructure/index.ts` barrel export required to import `claimBookingDeposit`.

## Completed this slice

Persisted checkboxes in `tasks.md` marked `- [x]` for 2.1–2.8.

- 2.1 RED: static contract requires `claim_booking_deposit` INSERT `dashboard_notifications` `event_type='deposit.claimed'`, `appointment_id` = `v_booking.id`, no `EXCEPTION WHEN OTHERS`, never `paid`, no `_business` outbox.
- 2.2 GREEN: additive `supabase/migrations/20260909120000_claim_booking_deposit_notify.sql` (notify after `claim_pending` in the same function/transaction).
- 2.3 RED: api-wrapper contract delegates `claimBookingDeposit({ manageToken, note? })`.
- 2.4 GREEN: claim on gateway-interface, types, real-gateway, api-wrapper, dashboard.service (plus infrastructure barrel).
- 2.5 RED: hold contract offers Ya transferí; unlocks `No hace falta volver acá`; forbids `pago recibido`; WhatsApp optional.
- 2.6 GREEN: hold copy constants + public page CTA using session `manageToken`.
- 2.7 TRIANGULATE: no EXCEPTION swallow (notify fail rolls back); page only `depositClaimed.set(true)` on 200; instructions email still has no manage CTA.
- 2.8 REFACTOR: WhatsApp helper unchanged/optional; copy constants live in the hold module.

## Files changed

- `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts`
- `supabase/migrations/20260909120000_claim_booking_deposit_notify.sql`
- `packages/booking/src/types.ts`
- `packages/booking/src/gateway-interface.ts`
- `packages/booking/src/infrastructure/supabase/real-gateway.ts`
- `packages/booking/src/infrastructure/supabase/api-wrapper.ts`
- `packages/booking/src/infrastructure/index.ts`
- `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts`
- `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`
- `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts`
- `apps/dashboard/src/app/features/booking/pages/public/public-booking.page.ts`
- `apps/dashboard/src/app/features/booking/pages/public/public-booking.page.html`
- `apps/dashboard/src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts`
- `openspec/changes/close-deposit-coordination/tasks.md`
- `openspec/changes/close-deposit-coordination/apply-progress.md`

## Test commands

Safety net:

- `pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts` → **12 passed**
- `pnpm --dir packages/booking exec vitest run src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` → **4 passed**
- Deno requires `--allow-read` on this machine (`deno` not on PATH; used `~/.deno/bin/deno.exe`)

RED 2.1: deno 25 passed / **1 failed** (notify INSERT missing).

GREEN 2.2: deno **26 passed**.

RED 2.3: vitest booking 4 passed / **1 failed** (`claimBookingDeposit is not a function`).

GREEN 2.4: vitest booking **5 passed**.

RED 2.5: dashboard hold 11 passed / **4 failed**.

GREEN / TRIANGULATE / REFACTOR 2.6–2.8: dashboard hold **15 passed**.

## TDD Cycle Evidence (work unit 2)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `manual-booking-deposits-static-contract.test.ts` | SQL static | ✅ 25/25 existing | ✅ Written (notify INSERT failed) | ✅ 26/26 | ✅ no EXCEPTION / never paid / no `_business` | ➖ SQL additive only |
| 2.2 | same | SQL static | ✅ | (RED from 2.1) | ✅ notify migration | ✅ insert after claim_pending | ➖ |
| 2.3 | `api-wrapper.contract.spec.ts` | Contract | ✅ 4/4 | ✅ Written (not a function) | ✅ 5/5 | ✅ with and without `note` | ➖ |
| 2.4 | same + gateway files | Unit/adapter | ✅ | (RED from 2.3) | ✅ RPC `claim_booking_deposit` | ✅ dashboard.service wrapper | ➖ barrel export |
| 2.5 | `public-booking-deposit-hold.contract.spec.ts` | Contract | ✅ 12/12 | ✅ Written (4 failed) | ✅ 15/15 | ✅ copy + WhatsApp optional | ➖ |
| 2.6 | same | UI | ✅ | (RED from 2.5) | ✅ CTA + manageToken | ✅ claimed copy only on success | ➖ constants in hold module |
| 2.7 | SQL static + hold contract | Contract | ✅ | covered | ✅ | ✅ notify fail rolls back; no email manage CTA | ➖ |
| 2.8 | hold module + page | UI | ✅ | N/A | ✅ | ➖ structural | ✅ WhatsApp helper kept optional |

## Deviations from design

- Exported `claimBookingDeposit` from `packages/booking/src/infrastructure/index.ts` so dashboard can import `@orvel/booking/infrastructure` (not listed in the parent allowed-surface list; required barrel).
- Public page calls `claimBookingDeposit` from infrastructure directly (session `manageToken`); `DashboardService.claimBookingDeposit` is also wired.

## Remaining tasks

Phase 2 complete. Unchecked implementation rows:

- [ ] 3.1–3.7 (slice 3 eager release)
- [ ] 4.1–4.8 (slice 4 operator reject)

## Workload / PR boundary

- Authored production+test diff excluding OpenSpec: **12 tracked files, 225 insertions, 8 deletions** plus **87-line** untracked migration (~320 changed lines).
- Under 400-line budget. No `size:exception`.
- Current PR boundary: PR 2 of 4 on `feat/close-deposit-coordination-s2` targeting `dev`.
- Did not commit or push.

## Not done

No commit, no push, no PR. Slices 3–4 not implemented.

