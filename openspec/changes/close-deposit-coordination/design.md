# Design: close-deposit-coordination

## Technical Approach

Close the seña loop on live `public.bookings.deposit_status`. Reuse confirm (already `pending`|`claim_pending`), `claim_booking_deposit`, `release_expired_booking_hold`, occupancy exclude `released`/`abandoned`/`void`, and the hold-released trigger. Additive migrations only. Product contract stays locked. PWA daily ops: Turnos confirm/reject on mobile list+detail are in scope; no desktop-only chrome on mobile cards. Inicio confirm stays. Packed four slices are High vs 400-line `ask-on-risk`; do not invent `chain_strategy` or `size:exception`.

## Architecture Decisions

### Decision: Reuse confirm on Turnos

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Call existing `DashboardService.confirmDepositReceived` from Turnos list + detail (desktop and mobile) | Shared RPC, auth, cache invalidate | **Chosen** |
| New Turnos-only confirm client | Duplicate error/auth | Rejected |
| Remove Inicio confirm | Forbidden | Rejected |

`isDepositUnpaid` stays the occupancy/action gate for both unpaid states. Split `appointmentStatusLabel`: `pending` → `Pendiente de seña`; `claim_pending` → `Seña avisada` with a stronger highlight. Slice 1 highlight is a no-op until slice 2 and must not block confirm.

### Decision: Claim notify is inside the RPC

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `INSERT dashboard_notifications` in `claim_booking_deposit` with no `EXCEPTION` swallow | Same transaction as status; insert fail rolls back | **Chosen** |
| Notify after RPC in the app | Copy can lie | Rejected |
| `_business` outbox / business email | Non-goal | Rejected |

`appointment_id` = booking id. `event_type` `deposit.claimed`. Hold card calls gateway `claimBookingDeposit` with session `manageToken`. WhatsApp optional, not the aviso. Flip locked `No hace falta volver acá` with the CTA. Claim never sets `paid`.

### Decision: Eager clock copies purge cron

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Edge Function + GitHub cron POST, `CRON_KEY`, `verify_jwt = false`, `release_expired_booking_hold(NULL, NULL)` | Matches purge/account-closure | **Chosen** |
| `pg_cron` | Forbidden in that family | Rejected |
| Rewrite release function body | Trigger already fires on `released` UPDATE | Rejected |

Cadence `*/5 * * * *`. Missing `CRON_KEY`/secrets: 401 or job fail; env stays lazy (not eager). Countdown 00:00 MAY RPC-release that booking; clearing sessionStorage is not occupancy.

### Decision: Reject writes `released`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New `reject_booking_deposit_unseen(booking_id, performed_by)` → `released` + evidence `operator_reject` | Hold-released mail fires | **Chosen** |
| Write `abandoned` or `void` | Trigger is `released`-only; client gets no mail | Rejected |

`SECURITY DEFINER` + `can_manage_business`; GRANT `authenticated, service_role` (not anon). Confirm stays on the same unpaid Turnos surfaces. No strike UI; evidence is not `claim` or `timeout_strike`.

## Data Flow

```
Public book → pending, occupy, instructions mail
Ya transferí → claim RPC: pending→claim_pending + evidence claim + dashboard_notifications
               (notify INSERT fail ⇒ whole claim fails, stay pending)
Confirmar seña (Inicio or Turnos) → paid + appointment_confirmation
no la veo → released + evidence operator_reject + hold-released mail
Cron / optional countdown 0 → release_expired_booking_hold → released + hold-released mail
Occupancy: pending|claim_pending occupy; released|abandoned|void free; bookings.status unchanged
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `packages/booking/.../booking-record.ts` (+ `index.ts`) | Modify | Split labels; keep `isDepositUnpaid` |
| `gateway-interface.ts`, `types.ts`, `real-gateway.ts`, `api-wrapper.ts` + api-wrapper contract | Modify | Claim + reject methods |
| `apps/dashboard/.../dashboard.service.ts` | Modify | Reuse confirm; add reject |
| `dashboard-home.page.{ts,html}` | Keep | Inicio Confirmar seña |
| `turnos-list` + `mobile-appointment-card` + `mobile-turno-detail` | Modify | Confirm (s1), reject (s4), badges |
| `public-booking-deposit-hold.ts` + `public-booking.page.{ts,html}` + hold contract spec | Modify | Ya transferí, copy, optional countdown RPC |
| Turnos/mobile/home `*.contract.spec.ts` | Modify | Lock confirm/reject/labels |
| `migrations/<ts>_claim_booking_deposit_notify.sql` | Create | Additive claim notify |
| `migrations/<ts>_reject_booking_deposit_unseen.sql` | Create | Additive reject RPC |
| `manual-booking-deposits-static-contract.test.ts` | Modify | Notify, reject→`released`, scheduler, no `pg_cron` |
| `functions/release-expired-booking-holds/` + Deno contract + `config.toml` + `.github/workflows/release-expired-booking-holds.yml` | Create | Purge-pattern cron (`verify_jwt=false`) |
| Email templates + `process-email-outbox` | Keep | No refund language |

## Interfaces / Contracts

```ts
claimBookingDeposit({ manageToken, note? }): ApiResponse<{ bookingId: string; depositStatus: 'claim_pending' }>
rejectBookingDepositUnseen({ bookingId, performedBy }): ApiResponse<{ bookingId: string; depositStatus: 'released' }>
```

Claim SQL (one transaction): `UPDATE` → `claim_pending` then `INSERT dashboard_notifications` (`event_type = 'deposit.claimed'`). No `EXCEPTION WHEN OTHERS`. Reject: unpaid → `released`; evidence `operator_reject`; lazy-release first like confirm.

## Testing Strategy

Strict TDD in apply. RED existing contracts before production SQL/UI.

| Layer | What | Approach |
|-------|------|----------|
| SQL static | Claim notify + never `paid`; no EXCEPTION wrapper; reject `released` not `abandoned`; evidence not `claim`/`timeout_strike`; occupancy exclude unchanged; no `pg_cron` | Extend `manual-booking-deposits-static-contract.test.ts` first |
| Edge | Bad/missing `CRON_KEY` → 401; RPC `(NULL,NULL)`; `verify_jwt=false` | Clone purge static contract |
| Dashboard | Split labels; Turnos+mobile confirm; Inicio still present; later reject | Existing `*.contract.spec.ts` |
| Public hold | CTA; no `No hace falta volver acá`; no `pago recibido`; WhatsApp optional | Hold contract spec in slice 2 |
| Gateway | Claim/reject delegated | `api-wrapper.contract.spec.ts` |
| E2E | Out of scope | Scoped dashboard + Deno, then `pnpm run check` |

## Threat Matrix

Process integration (cron + Edge). Agent git/PR matrix rows are N/A (no `git -C`/commit/push/PR composition). Cron: bad `CRON_KEY` → 401, no RPC. Missing workflow secrets → job fail, env stays lazy.

## Migration / Rollout

No backfill, dual-schema, or destructive rollback. No migration repair without Santi.

- Slice 1: revert UI; confirm RPC unchanged; Inicio remains.
- Slice 2: revert CTA/gateway; if notify SQL reverts, drop “avisamos” copy too. Claim without a caller is GRANT-only again.
- Slice 3: disable workflow; keep release RPC; lazy belt remains.
- Slice 4: revoke EXECUTE / stop UI; leftover `released` rows stay honest and free the slot.

Packed four slices: High 400-line risk. Tasks forecast per slice and pause for a human delivery decision under `ask-on-risk`.

## Open Questions

- None blocking. Claimed badge copy `Seña avisada` is locked here unless Santi overrides at tasks.
- Workflow secret names follow account-closure (`*_FUNCTION_URL` + `*_CRON_SECRET`); per-env wiring is ops, not schema.
