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
