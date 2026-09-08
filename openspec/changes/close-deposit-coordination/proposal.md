# Proposal: close-deposit-coordination

## Intent

Close the live manual-seña coordination loop on `public.bookings` so Orvel behaves as a **state intermediary**, not a PSP and not a chat.

Today a public book with deposits on occupies the slot (`deposit_status=pending`, 30-minute hold), emails transfer instructions, and lets operators confirm only from dashboard home. The client cannot say they transferred. The operator cannot reject a seña they do not see. The hold clock is lazy (availability / confirm / claim), so quiet businesses never free the slot and never send the hold-released email. Client claim copy that “we notified the business” has no dashboard notification.

This change wires the missing human coordination: public **Ya transferí** → `claim_pending` + durable dashboard notify; operator **Confirmar seña** on Turnos as well as Inicio (`pending` and `claim_pending`, never auto-confirm); eager scheduled release of expired holds; operator **no la veo** that sets `deposit_status='released'` so the existing hold-released email fires.

## Confirmed product contract (do not reopen)

- Orvel is a state intermediary for manual seña. Transfer is to the **business** alias/CBU. Not Mercado Pago, checkout, or escrow.
- Hold = slot reserved 30 minutes (unchanged). Percent 25/50/100 and hold duration stay as today.
- Client **Ya transferí** → `claim_pending`. Copy: we notified the business. NEVER “pago recibido”.
- Operator **Confirmar seña** → `paid` → client confirmation email. Confirm is available on `pending` **and** `claim_pending`; highlight `claim_pending`.
- Never auto-confirm.
- Timeout and operator “no la veo” → `deposit_status='released'` (NOT `abandoned`). Hold-released email trigger fires only on `released`. Honest copy already exists. No refund language.
- WhatsApp remains optional. It is not the structured aviso.
- Eager 30-min clock (scheduled release), not only lazy-on-read.
- Claim MUST enqueue a **dashboard notification** (not a business email) so “avisamos al negocio” is true.

## Why now

The machine already has most of the states. The product gap is coordination: operators confirm from one surface, clients cannot claim, the clock does not tick without traffic, and reject would skip the client email if it wrote `abandoned`. Shipping the loop on the live `bookings` path avoids dual-schema work and stops lying in copy.

## Scope

Live path only: `public.bookings.deposit_status`. No `appointments` / `clients` ghost tables. Four intended slices; slice 1 is independently shippable today.

### Slice 1 — Agenda confirm

Add **Confirmar seña** on Turnos list + detail (desktop and mobile). Reuse `dashboard.service.confirmDepositReceived`. RPC `confirm_booking_deposit_received` already accepts `pending` and `claim_pending`, sets `paid`, remints the manage token, and enqueues `appointment_confirmation`.

Split unpaid labels: pending vs claimed; highlight claimed. `claim_pending` will not appear until slice 2 — highlight-on-claimed is a no-op until then and MUST NOT block slice 1.

Keep occupancy, percent, hold duration, and Inicio confirm as they are.

### Slice 2 — Public “Ya transferí”

Hold-card CTA calling existing `claim_booking_deposit(manage_token, note)` with the `manageToken` already returned by `create_public_booking` and persistable via `readPublicDepositHold` / sessionStorage.

- New copy: we notified the business; never “pago recibido”.
- Drop “No hace falta volver acá” (the public hold contract spec currently **locks** that sentence — flip it with the copy).
- WhatsApp stays optional and is not the structured aviso.
- Extend `claim_booking_deposit` so a successful claim inserts `dashboard_notifications` (not `_business` outbox / business email). If the notification insert fails, the claim MUST fail (durable notify, same atomicity as other booking notifies).
- Wire claim through `packages/booking` gateway + dashboard public page. No package caller exists today.

Instructions email CTA / manage links remain a follow-up. SessionStorage is tab-scoped; clients who leave the hold card cannot claim until that follow-up.

### Slice 3 — Eager 30-min clock

Scheduled caller of existing `release_expired_booking_hold(NULL, NULL)` using the purge / account-closure pattern: Edge Function + external POST (GitHub cron + `CRON_KEY`). Do **not** use `pg_cron`. Do not rewrite the release function body unless contract tests require it.

Optional belt: public countdown hitting 00:00 MAY also RPC-release that booking (today it only clears sessionStorage). Hold-released email trigger already exists (`NEW.released` from `pending` / `claim_pending`) and will fire once an UPDATE actually happens.

### Slice 4 — Operator “no la veo”

New authenticated RPC: from `pending` or `claim_pending`, set `deposit_status='released'` so `appointment_hold_released` runs. Do **not** use `abandoned` unless that trigger is extended (it only fires on `released`).

Write a distinct evidence row (confirm writes none; claim writes `claim`; timeout writes `timeout_strike`). Strike UI stays out of scope. Wire reject through gateway + Turnos (and keep confirm available on the same unpaid states).

## Non-goals

- Mercado Pago / checkout / escrow / refunds / refund copy.
- Configurable seña amount or hold duration.
- Email CTA / manage link in deposit instructions (follow-up change).
- `_business` outbox as the claim aviso.
- Strike UI.
- Dual-schema (`public.appointments` / ghost `clients`).
- Walk-in UI.
- Auto-confirm on claim.
- Changing occupancy exclude list semantics (`released` / `abandoned` / `void` already free the slot without mutating `bookings.status`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/dashboard/.../dashboard-home.page.{ts,html}` | Keep | Existing Confirmar seña; do not remove |
| `apps/dashboard/.../turnos-list.page.{ts,html}` | Modify | Confirm + later reject; split unpaid badges |
| `apps/dashboard/.../mobile-appointment-card/` + `mobile-turno-detail/` | Modify | Confirm + later reject; highlight `claim_pending` |
| `apps/dashboard/.../dashboard.service.ts` | Modify | Reuse confirm; add claim/reject callers as slices land |
| `apps/dashboard/.../public-booking-deposit-hold.ts` + `public-booking.page.{ts,html}` | Modify | Ya transferí CTA, copy, optional countdown release |
| `apps/dashboard/.../public-booking-deposit-hold.contract.spec.ts` | Modify | Unlock “No hace falta volver acá”; lock new notify copy |
| `packages/booking/src/application/booking-record.ts` | Modify | Split pending vs claimed labels; keep `isDepositUnpaid` for occupancy/actions that apply to both |
| `packages/booking/src/gateway-interface.ts` + `real-gateway.ts` + `api-wrapper.ts` | Modify | Claim + reject methods (confirm already wired) |
| `supabase/migrations/` (new, additive) | Add | Claim notify; reject RPC; do not restated dual-schema |
| `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` | Modify | Lock claim notify, reject → `released`, scheduler caller |
| New Edge Function + `.github/workflows/` | Add | Eager release cron (purge pattern) |
| `apps/shared/email-templates/appointment-templates.ts` | Keep | Instructions + hold-released copy; no refund language |
| `supabase/functions/process-email-outbox/index.ts` | Keep | Already routes those template keys |

## Capabilities

### New capabilities

- **deposit-claim-coordination** — public Ya transferí to `claim_pending` with honest copy and a required dashboard notification.
- **deposit-hold-eager-release** — scheduled (and optionally client-side) release of expired unpaid holds so the slot frees and hold-released mail sends without traffic.
- **deposit-operator-reject** — authenticated “no la veo” to `released` with distinct evidence, reusing the hold-released trigger.

### Modified capabilities

- **deposit-operator-confirm** — Confirmar seña on Turnos list/detail (desktop + mobile) as well as Inicio; labels distinguish pending vs claimed; confirm remains valid on both unpaid states; never auto-confirm.
- **deposit-hold-occupancy** — unchanged rules, but timeout and reject now actually reach `released` without waiting for a lazy read.

## Approach

Stay on `public.bookings`. Reuse confirm / claim / `release_expired_booking_hold` / email triggers. Smallest schema risk.

Slice order matches code reality (agenda first, then the public claim that makes `claim_pending` real, then the clock that needs secrets, then the new reject RPC).

Delivery: `ask-on-risk`, review budget **400** changed lines. Four slices together are **High 400-line risk** if packed as one PR. Do **not** invent `chain_strategy` or `size:exception` in this proposal. Tasks MUST forecast size per slice and pause for a human delivery decision if the packed diff would exceed 400 lines.

Strict TDD where tests exist: flip the public-hold copy contract in the same slice as the CTA; extend the SQL static contract before RPC/notify/reject SQL; dashboard confirm/reject UI behind existing booking contract tests.

## Impact

- **Clients**: can declare a transfer while the hold card is open; see “we notified the business”, never “pago recibido”; receive confirmation only after operator confirm; receive hold-released mail when the hold actually expires or is rejected.
- **Operators**: confirm seña from Turnos, not only Inicio; see claimed holds highlighted once slice 2 exists; can reject with honest client email; get a dashboard notification on claim.
- **Ops**: one more cron (CRON_KEY / GitHub secrets) in the same family as purge-elapsed-bookings / account-closure. Missing secrets leave that env lazy.
- **Support**: no refund language; session-scoped claim means “I left the tab” is still unclaimable until the email-CTA follow-up.

## Risks

1. **Packed PR vs 400-line budget** — UI + SQL + gateway + cron in one PR will exceed 400 lines. *Mitigation*: `ask-on-risk`; tasks forecast per slice; do not invent chaining or `size:exception` here.
2. **“Avisamos al negocio” is false until claim notifies** — copy without `dashboard_notifications` is a product lie. *Mitigation*: claim RPC insert is required and atomic with the state change; no business email substitute.
3. **Lazy clock in some envs** — eager release needs CRON_KEY and workflow secrets. *Mitigation*: reuse purge pattern; document env gap; keep lazy release as belt, not the only clock once the function is deployed.
4. **Reject to `abandoned` skips hold-released mail** — CHECK allows `abandoned`/`void`, but the trigger is `released`-only. *Mitigation*: reject writes `released` only.
5. **Tab-scoped claim** — instructions email has no manage link; sessionStorage is not durable. *Mitigation*: accepted non-goal (email CTA follow-up); do not expand this change.
6. **Copy contract lock** — `public-booking-deposit-hold.contract.spec.ts` asserts “No hace falta volver acá”. *Mitigation*: update that spec in slice 2 with the CTA.
7. **Never auto-confirm** — claim already must not set `paid`. *Mitigation*: keep existing claim contract (pending → claim_pending + evidence, never paid).
8. **Scheduler vs `pg_cron`** — purge contract forbids `pg_cron` for that family. *Mitigation*: Edge Function + external POST only.

## Rollback Plan

- **Slice 1 (UI)**: revert the dashboard/package PR. Confirm RPC stays as today; Inicio confirm remains.
- **Slice 2**: revert public CTA + gateway; optionally keep or revert the claim-notify migration. Claim without a caller returns to GRANT-only. Do not silently leave “avisamos” copy if notify SQL is reverted.
- **Slice 3**: disable the GitHub workflow / stop POSTing the Edge Function. Lazy `release_expired_booking_hold` remains. Do not drop the RPC.
- **Slice 4**: revoke EXECUTE / stop UI from calling the reject RPC. Occupancy already treats `released` as free; leftover `released` rows stay honest.

No destructive schema rollback. Do not run migration repair without Santi approval.

## Dependencies

- Existing RPCs and triggers from `20260904120000_manual_booking_deposits.sql`, `20260904133000_manual_booking_deposit_rpcs.sql`, `20260904233000_deposit_confirmation_email.sql`, `20260908120000_deposit_client_emails.sql`.
- Dashboard notify table + owner RLS already used by public booking.
- Purge-elapsed-bookings / account-closure cron pattern (Edge Function + `CRON_KEY`). Slice 3 needs those secrets in each env.
- No dependency on `public.appointments`, Mercado Pago, or the instructions-email CTA follow-up.

## Success Criteria

- [ ] Operator can **Confirmar seña** from Turnos list and detail (desktop and mobile) on both `pending` and `claim_pending`; Inicio confirm still works.
- [ ] Unpaid badges distinguish pending vs claimed; claimed is highlighted; confirm is never implied by claim.
- [ ] Public hold card shows **Ya transferí**; successful claim sets `claim_pending` (never `paid`) and inserts a dashboard notification; copy says the business was notified and never “pago recibido”.
- [ ] WhatsApp remains optional and is not required for the aviso.
- [ ] Expired unpaid holds are released on a schedule via `release_expired_booking_hold` without waiting for an availability read; hold-released email fires; copy has no refund language.
- [ ] Operator “no la veo” sets `released` (not `abandoned`) from `pending` or `claim_pending`, writes distinct evidence, and sends hold-released email.
- [ ] Percent 25/50/100 and 30-minute hold are unchanged.
- [ ] Non-goals above are absent from the diff.
- [ ] Contract tests updated: public hold copy, claim notify, reject → `released`, eager caller; `pnpm run check` (or the scoped dashboard + deposit SQL contracts) green before asking to merge.

## Delivery

- Strategy: `ask-on-risk`.
- Review budget: 400 changed lines.
- Intended slices: (1) agenda confirm → (2) Ya transferí → (3) eager clock → (4) reject.
- Four slices packed as one PR: **High** 400-line risk. Pause at tasks for a human delivery decision. Do not invent `chain_strategy` or `size:exception`.

## References

- Exploration: `openspec/changes/close-deposit-coordination/exploration.md`
- Product context: `infra/context/product.md` (señas as alias/CBU deposits, not Mercado Pago)
- SQL/UI lock: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts`, `apps/dashboard/src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts`
- Scheduler pattern: `supabase/functions/purge-elapsed-bookings/`, `.github/workflows/account-closure.yml`
