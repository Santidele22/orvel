## Exploration: close-deposit-coordination

### Current State

Orvel already runs manual seña on legacy `public.bookings.deposit_status`, not `appointments`. Hold is `created_at + 30 minutes`. Occupancy treats `released` / `abandoned` / `void` as free without mutating `bookings.status`. Percent 25/50/100 and alias/CBU stay as today.

Machine today:

| Event | Live behavior |
|---|---|
| Public book with deposits on | `deposit_status=pending`, slot occupied, instructions email via AFTER INSERT trigger |
| Client “Ya transferí” | RPC `claim_booking_deposit(manage_token, note)` exists (anon/authenticated). **No dashboard or package caller.** Hold card has WhatsApp + “Volver”, copy still says “No hace falta volver acá”. |
| Operator confirm | RPC `confirm_booking_deposit_received` accepts `pending` **and** `claim_pending`, sets `paid`, remints manage token, enqueues `appointment_confirmation`. UI button exists **only** on dashboard home. Turnos list/detail/mobile cards show one “Pendiente de seña” badge via `isDepositUnpaid` (pending ≡ claim_pending). |
| Timeout | `release_expired_booking_hold` is **lazy**: availability query, confirm, and claim. No scheduler. Public countdown hitting 00:00 only clears sessionStorage. Hold-released email trigger exists (`NEW.released` from `pending`/`claim_pending`) but does not fire until an UPDATE actually happens. |
| Operator “no la veo” | **Missing.** CHECK allows `abandoned`/`void`; no RPC sets them. |

Honest hold-released copy already exists: “No se acreditó la seña a tiempo… horario quedó disponible.” No refund language.

Claim does **not** insert `dashboard_notifications`. Product copy “avisamos al negocio” has no live notify path. Instructions email has no manage links (email CTA is a follow-up, not this change). `create_public_booking` already returns `manage_token`; `readPublicDepositHold` can persist it in sessionStorage — enough for an in-session claim button.

### Affected Areas

- `supabase/migrations/20260904120000_manual_booking_deposits.sql` — hold clock, lazy `release_expired_booking_hold`, occupancy exclude list, evidence/strikes tables.
- `supabase/migrations/20260904133000_manual_booking_deposit_rpcs.sql` — `claim_booking_deposit` (no notify); original confirm was pending-only (superseded).
- `supabase/migrations/20260904233000_deposit_confirmation_email.sql` / `20260908120000_deposit_client_emails.sql` — confirm accepts both unpaid states; instructions + hold-released triggers; confirm remints links.
- `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — SQL contract lock for RPCs/triggers.
- `packages/booking/src/application/booking-record.ts` — `isDepositUnpaid` collapses pending and claim_pending; `appointmentStatusLabel` is one badge.
- `packages/booking/src/gateway-interface.ts` + `real-gateway.ts` + `api-wrapper.ts` — confirm wired; **no claim/reject methods**.
- `apps/dashboard/src/app/core/dashboard/dashboard.service.ts` — `confirmDepositReceived` + `depositPending`.
- `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.{ts,html}` — only Confirmar seña surface.
- `apps/dashboard/src/app/features/booking/pages/turnos-list.page.{ts,html}` — badge only.
- `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/` + `mobile-turno-detail/` — badge only; detail has no confirm/reject.
- `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts` + `public-booking.page.{ts,html}` — hold card, WhatsApp optional, next-steps copy, no claim CTA; countdown does not call release.
- `apps/dashboard/src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts` — **locks** “No hace falta volver acá”.
- `apps/shared/email-templates/appointment-templates.ts` — instructions + hold-released renderers (keep copy; no refund).
- `supabase/functions/process-email-outbox/index.ts` — already routes those template keys.
- `supabase/functions/purge-elapsed-bookings/` + `.github/workflows/account-closure.yml` — existing **external scheduler** pattern (CRON_KEY / GitHub cron). Do not use `pg_cron` (purge contract forbids it for that RPC; repo pattern is Edge Function + external POST).
- Non-goals stay out: `public.appointments` / `clients` ghost tables, `_business` outbox templates, Mercado Pago, percent/duration knobs, strike UI, walk-in UI.

### Approaches

1. **Four intended slices on the live bookings path (no dual-schema)** — close the coordination loop where it already lives.
   - Pros: matches locked product; reuses confirm/claim/release/email triggers; smallest schema risk.
   - Cons: four slices together will exceed the 400-line review budget; claim_pending UI is dead until the public CTA exists.
   - Effort: Medium (UI + one new reject RPC + scheduler), High if packed into one PR.

2. **Single PR “full loop”** — agenda + claim CTA + eager cron + reject together.
   - Pros: one coherent story.
   - Cons: oversized review; mixes UI, SQL, and infra secrets; `ask-on-risk` forbids inventing an exception.
   - Effort: High.

3. **Migrate to `appointments` while closing the loop**
   - Pros: none for this change.
   - Cons: dual-schema cleanup is an explicit non-goal; live path is `bookings`.
   - Effort: High.

### Recommendation

Approach 1. Stay on `public.bookings`. Do not reopen percent, hold duration, PSP, or email-CTA-in-instructions.

Slice order that matches code reality:

1. **Agenda confirm** — add Confirmar seña on Turnos list + detail (desktop and mobile). Keep confirm available on `pending` and `claim_pending`. Split labels: pending vs claimed (highlight claimed). Reuse `dashboard.service.confirmDepositReceived`. RPC already accepts both states.
2. **Public “Ya transferí”** — hold-card CTA calling `claim_booking_deposit` with persisted `manageToken`. New copy: we notified the business; never “pago recibido”. Drop “No hace falta volver acá” (update the contract spec that locks it). WhatsApp stays optional. Claim RPC should enqueue a **dashboard notification** (not business email) so the copy is true.
3. **Eager 30-min clock** — scheduled caller of existing `release_expired_booking_hold(NULL, NULL)` using the purge/account-closure pattern (Edge Function + external cron). Optional belt: public countdown expiry may also RPC-release that booking. Do not rewrite the release function body unless tests require it. Hold-released email then actually fires.
4. **Operator “no la veo”** — new authenticated RPC that sets `deposit_status='released'` from `pending` or `claim_pending` so the existing hold-released trigger runs. Do **not** use `abandoned` unless that trigger is extended (it only fires on `released`). Evidence row; strike UI remains out of scope.

Delivery: `ask-on-risk`. Do not invent chained-PR strategy or `size:exception` here. Forecast at tasks: four slices together are High 400-line risk.

### First-slice reality

Slice 1 is independently shippable **today**: unpaid holds already show as “Pendiente de seña” on Turnos, and operators can only confirm from Inicio. `claim_pending` will not appear until slice 2; highlight-on-claimed is a no-op until then and must not block slice 1. Slice 2 is the coordination loop (claim is GRANT-only with no caller). Slice 3 is the only slice that needs scheduler secrets/deploy. Slice 4 needs a new RPC; reject must write `released` to reuse the email trigger.

### Risks

- Lazy release means quiet businesses never free the slot and never send hold-released mail until someone reads availability or hits confirm/claim.
- Claim without a dashboard notification makes “avisamos al negocio” a lie.
- Instructions email has no claim link; sessionStorage `manageToken` is tab-scoped. Clients who leave the hold card cannot claim until the deferred email-CTA follow-up.
- Operator reject to `abandoned` would skip `appointment_hold_released`.
- Confirm currently writes no evidence; claim writes `claim`; timeout writes `timeout_strike`. Keep reject evidence distinct; do not auto-confirm claim.
- Existing contract spec asserts “No hace falta volver acá” — must flip with the copy change.
- Eager scheduler needs CRON_KEY / GitHub secrets like other crons; missing secrets = still-lazy clock in some envs.
- Four slices vs 400-line budget: pause at tasks under `ask-on-risk`.

### Ready for Proposal

Yes. Product contract is locked. No interview. Next phase is `sdd-propose` for `close-deposit-coordination` on the live `bookings` path, with the four verified slices and the non-goals above.
