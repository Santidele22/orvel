# Tasks: close-deposit-coordination

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1000–1500 packed; ~200–400 per slice |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (slice 1) → PR 2 (slice 2) → PR 3 (slice 3) → PR 4 (slice 4) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

**Pause (ask-on-risk):** Packed four slices exceed the 400-line review budget. Do not apply until Santi chooses a chain strategy. Do not invent `stacked-to-main` or `feature-branch-chain`. `size:exception` is not accepted. Claimed badge copy stays `Seña avisada`.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Turnos confirm + split labels; Inicio stays | PR 1 | `pnpm --dir apps/dashboard run test -- src/app/features/booking src/app/core/dashboard/__tests__/dashboard.service.spec.ts src/app/features/dashboard-home/pages/dashboard-home-page-mobile-summary.contract.spec.ts` | N/A — e2e out of scope | Revert dashboard/package UI; confirm RPC unchanged |
| 2 | Ya transferí + atomic `dashboard_notifications` | PR 2 | `deno test --config supabase/functions/deno.json supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` and `pnpm --dir apps/dashboard run test -- src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts` plus `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` | N/A — e2e out of scope | Revert CTA/gateway; if notify SQL reverts, drop “avisamos” copy |
| 3 | Eager release Edge Function + GitHub cron | PR 3 | `deno test --config supabase/functions/deno.json supabase/functions/_shared/release-expired-booking-holds-static-contract.test.ts` | N/A — live cron needs per-env secrets | Disable workflow; keep `release_expired_booking_hold` |
| 4 | Operator no la veo → `released` | PR 4 | `deno test --config supabase/functions/deno.json supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` and Turnos/mobile contract specs under `apps/dashboard/src/app/features/booking/` | N/A — e2e out of scope | Stop UI / revoke EXECUTE; leftover `released` rows stay honest |

## Phase 1: Slice 1 — Agenda confirm + split labels

- [x] 1.1 RED: in `apps/dashboard/src/app/core/dashboard/__tests__/dashboard.service.spec.ts` lock `pending` → `Pendiente de seña`, `claim_pending` → `Seña avisada`, `isDepositUnpaid` both. <!-- sdd-owner: implementation -->
- [x] 1.2 RED: `apps/dashboard/src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts` require Confirmar seña on list+detail and stronger `claim_pending` highlight. <!-- sdd-owner: implementation -->
- [x] 1.3 RED: `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home-page-mobile-summary.contract.spec.ts` still contains Inicio Confirmar seña / `confirmDepositReceived`. <!-- sdd-owner: implementation -->
- [x] 1.4 GREEN: split labels in `packages/booking/src/application/booking-record.ts`; keep `isDepositUnpaid`; do not change `packages/booking/src/application/index.ts` exports unless required. <!-- sdd-owner: implementation -->
- [x] 1.5 GREEN: call existing `apps/dashboard/src/app/core/dashboard/dashboard.service.ts` `confirmDepositReceived` from `apps/dashboard/src/app/features/booking/pages/turnos-list.page.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.component.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.{ts,html}`. <!-- sdd-owner: implementation -->
- [x] 1.6 TRIANGULATE: confirm works with only `pending` rows; claimed highlight may be a no-op; never auto-confirm; do not edit `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.{ts,html}` except to keep confirm. <!-- sdd-owner: implementation -->
- [x] 1.7 REFACTOR: no second confirm client; shared unpaid gate stays `isDepositUnpaid`. <!-- sdd-owner: implementation -->

## Phase 2: Slice 2 — Ya transferí + atomic dashboard notify

- [x] 2.1 RED: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — `claim_booking_deposit` INSERT `dashboard_notifications` `event_type='deposit.claimed'`, `appointment_id`=booking id, no `EXCEPTION WHEN OTHERS`, never `paid`, no `_business` outbox. <!-- sdd-owner: implementation -->
- [x] 2.2 GREEN: additive `supabase/migrations/<ts>_claim_booking_deposit_notify.sql` (same transaction as status). <!-- sdd-owner: implementation -->
- [x] 2.3 RED: `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` delegates `claimBookingDeposit({ manageToken, note? })`. <!-- sdd-owner: implementation -->
- [x] 2.4 GREEN: add claim on `packages/booking/src/gateway-interface.ts`, `packages/booking/src/types.ts`, `packages/booking/src/infrastructure/supabase/real-gateway.ts`, `packages/booking/src/infrastructure/supabase/api-wrapper.ts`, `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`. <!-- sdd-owner: implementation -->
- [x] 2.5 RED: `apps/dashboard/src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts` — Ya transferí; unlock `No hace falta volver acá`; no `pago recibido`; WhatsApp optional not the aviso. <!-- sdd-owner: implementation -->
- [x] 2.6 GREEN: CTA in `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts` and `apps/dashboard/src/app/features/booking/pages/public/public-booking.page.{ts,html}` using session `manageToken`. <!-- sdd-owner: implementation -->
- [x] 2.7 TRIANGULATE: notify insert fail ⇒ claim fails, stay `pending`, no success “avisamos”; no instructions-email manage CTA. <!-- sdd-owner: implementation -->
- [x] 2.8 REFACTOR: keep WhatsApp helper optional; copy constants only in hold module. <!-- sdd-owner: implementation -->

## Phase 3: Slice 3 — Eager release Edge Function + GitHub cron

- [ ] 3.1 RED (threat): `supabase/functions/_shared/release-expired-booking-holds-static-contract.test.ts` — missing/bad `CRON_KEY` → 401 and no RPC; clone `supabase/functions/_shared/purge-elapsed-bookings-static-contract.test.ts` (read-only) / `supabase/functions/purge-elapsed-bookings/index.ts` (read-only). <!-- sdd-owner: implementation -->
- [ ] 3.2 RED (threat): `.github/workflows/release-expired-booking-holds.yml` missing `*_FUNCTION_URL` / `*_CRON_SECRET` fails like `.github/workflows/account-closure.yml` (read-only); env stays lazy. <!-- sdd-owner: implementation -->
- [ ] 3.3 GREEN: `supabase/functions/release-expired-booking-holds/index.ts` POST calls `release_expired_booking_hold(NULL, NULL)`; `supabase/config.toml` `[functions.release-expired-booking-holds]` `verify_jwt = false`. <!-- sdd-owner: implementation -->
- [ ] 3.4 GREEN: `.github/workflows/release-expired-booking-holds.yml` schedule `*/5 * * * *` + `workflow_dispatch`; no `pg_cron`. <!-- sdd-owner: implementation -->
- [ ] 3.5 TRIANGULATE: occupancy exclude `released`/`abandoned`/`void` unchanged in `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts`; timeout writes `released` not `abandoned`; `apps/shared/email-templates/appointment-templates.ts` (read-only) no refund language. <!-- sdd-owner: implementation -->
- [ ] 3.6 GREEN (optional MAY): public countdown 00:00 may RPC-release that booking from `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts`; clearing sessionStorage is not occupancy. <!-- sdd-owner: implementation -->
- [ ] 3.7 REFACTOR: do not rewrite `release_expired_booking_hold` body. <!-- sdd-owner: implementation -->

## Phase 4: Slice 4 — Operator reject → released

- [ ] 4.1 RED: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — `reject_booking_deposit_unseen(booking_id, performed_by)` → `released` not `abandoned`/`void`; evidence `operator_reject` not `claim`/`timeout_strike`; `SECURITY DEFINER` + `can_manage_business`; GRANT `authenticated, service_role` not anon. <!-- sdd-owner: implementation -->
- [ ] 4.2 GREEN: additive `supabase/migrations/<ts>_reject_booking_deposit_unseen.sql` (lazy-release first like confirm). <!-- sdd-owner: implementation -->
- [ ] 4.3 RED: `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` delegates `rejectBookingDepositUnseen({ bookingId, performedBy })` → `depositStatus: 'released'`. <!-- sdd-owner: implementation -->
- [ ] 4.4 GREEN: reject on `packages/booking/src/gateway-interface.ts`, `packages/booking/src/types.ts`, `packages/booking/src/infrastructure/supabase/real-gateway.ts`, `packages/booking/src/infrastructure/supabase/api-wrapper.ts`, `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`. <!-- sdd-owner: implementation -->
- [ ] 4.5 RED: Turnos/mobile contracts in `apps/dashboard/src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts` — **no la veo** plus Confirmar seña still present. <!-- sdd-owner: implementation -->
- [ ] 4.6 GREEN: reject UI on `apps/dashboard/src/app/features/booking/pages/turnos-list.page.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.component.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.{ts,html}`. <!-- sdd-owner: implementation -->
- [ ] 4.7 TRIANGULATE: unauthenticated reject cannot set `released`; no strike UI; no dual-schema; `apps/shared/email-templates/appointment-templates.ts` (read-only) and `supabase/functions/process-email-outbox/index.ts` (read-only) unchanged, no refund copy. <!-- sdd-owner: implementation -->
- [ ] 4.8 REFACTOR: reject does not replace confirm; occupancy still `isDepositUnpaid`. <!-- sdd-owner: implementation -->
