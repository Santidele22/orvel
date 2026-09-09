# Design: operator-lifecycle-pushes

Eleven capped operator inbox + web-push events reuse `dashboard_notifications` → `enqueue_web_push_outbox` → `process-web-push-outbox`. Instant events #9 and #11 are SQL triggers. Clocked events #1–8 and #10 run through a new `CRON_KEY` function `operator-lifecycle-pushes` (clone of `release-expired-booking-holds`) on GitHub `*/15 * * * *`. Click URL stays `/dashboard/turnos`. Processor auth stays `service_role`. No operator/client engagement email, no client push, no `pg_cron`, no `appointment-reminders-24h` coupling. Slice 1 does not instrument copy-link.

## Quick path

1. Slice 1 ships unique idempotency, latest enqueue + TS allowlist (all eleven strings named once; only ops rows inserted), inbox union + nullable `appointmentId`, RPC + Edge Function + workflow.
2. Slice 2 adds day-N once-flags, hours/services/slug predicates, and `booking_link_copied_at` from home + settings `copyBookingUrl()` only.
3. Slice 3 adds triggers #9/#11 and cron #10 `LIVE_REARM`. Packed PR is High vs 400 lines; tasks forecast per slice and pause under `ask-on-risk`. Do not invent `chain_strategy` or `size:exception`.

## Technical Approach

**Mix (exploration option 3), locked.**

| Kind | Events | Mechanism |
|------|--------|-----------|
| Instant | #9 first public, #11 second cancel | `AFTER INSERT` / `UPDATE OF status` on `bookings` → `_insert_operator_lifecycle_notification` → existing `trg_enqueue_web_push_outbox` (fail-open). |
| Clocked | #1–8, #10 | `enqueue_operator_lifecycle_pushes()` called by Edge Function `operator-lifecycle-pushes`. GitHub `*/15 * * * *` UTC; RPC evaluates `businesses.timezone` (default `America/Argentina/Buenos_Aires`). |

Clock math lives in SQL. The Edge Function is an auth shell: `CRON_KEY` / `x-cron-key` / Bearer, then `service_role` RPC. It must not accept or forward `service_role` as the caller secret.

Historical `20260824231000_create_web_push_outbox.sql` keep the original three-type allowlist. Latest body `20260829180000_reminder_operator_push_and_premium_activated.sql` is replaced by a **new** additive migration (`CREATE OR REPLACE enqueue_web_push_outbox`). `deposit.claimed` stays out of the allowlist.

## Architecture Decisions

### Decision: Mix — triggers + new 15-minute cron

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Mix: triggers #9/#11 + new `operator-lifecycle-pushes` | Matches cron family; #2/#4 hit windows; instant retention | **Chosen** |
| One true daily cron | Misses #2 and timely #4; delays #9/#11 | Rejected (do not reopen) |
| Extend `appointment-reminders-24h` | 23–25h customer-email RPC, settings flag, no in-repo GitHub invoker | Rejected (do not reopen) |
| `pg_cron` | Forbidden in this scheduler family | Rejected |

### Decision: Unique metadata idempotency, not `WHERE NOT EXISTS`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Partial unique `(business_id, event_type, (metadata->>'idempotency_key'))` plus helper insert | Cron-safe; existing rows without the key stay valid | **Chosen** |
| `WHERE NOT EXISTS` only | Reminder RPC pattern; races under `*/15` | Rejected |
| Unique `(business_id, event_type)` | Cannot re-arm #10 or daily ops | Rejected |

Helper `_insert_operator_lifecycle_notification(...)` catches `unique_violation` and returns false. Do not grant it to `anon` / `authenticated`.

### Decision: Name all eleven allowlist strings in slice 1; insert only 1–4

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Latest SQL enqueue + `OPERATOR_WEB_PUSH_EVENT_TYPES` list all eleven in slice 1; RPC only inserts ops | One allowlist touch; unknown types cannot split-brain later | **Chosen** |
| Allowlist only 1–4, extend twice more | Extra processor diffs in slices 2–3 | Rejected as more expensive |
| Rewrite create-outbox migration | Breaks `operator-web-push-send.red.contract.spec.ts` three-type lock | Rejected |

Inbox TS union also gains all eleven in slice 1. `appointmentId` becomes `string \| null`.

### Decision: Once-flags on `business_settings`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Columns on `business_settings` | Same home as `working_hours`; RLS already `can_manage_business` | **Chosen** |
| Columns on `businesses` | Mixes identity with notify caps | Rejected unless a later slice is blocked |

Slice 2: `booking_link_copied_at`, `onboarding_no_services_notified_at`, `onboarding_no_hours_notified_at`, `onboarding_copy_link_notified_at`, `onboarding_share_day7_notified_at`. Slice 3: `retention_first_public_notified_at`, `retention_gap7_notified_at`.

### Decision: Copy-link persistence is slice 2 only, shared helper, business URL only

| Option | Tradeoff | Decision |
|--------|----------|----------|
| After successful `clipboard.writeText` of `buildPublicBookingUrl(slug)` from home + settings `copyBookingUrl()`, RPC `mark_booking_link_copied` | Honest #7; one helper | **Chosen** (slice 2) |
| Instrument in slice 1 | Proposal forbids it | Rejected |
| Treat PWA `window.location.href` or `copyProfessionalBookingUrl` as success | Not the business public booking URL | Rejected |
| Client `update` of `business_settings` | Broader column write than needed | Rejected; authenticated RPC, set-if-null |

### Decision: Processor vs cron auth stay different

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `process-web-push-outbox` `verify_jwt = true` + `isPrivilegedWebPushAuthorization` (`service_role`) | Unchanged | **Chosen** |
| New function `verify_jwt = false` + `CRON_KEY` like release-holds | Unchanged family | **Chosen** |
| Give the new function `service_role` Bearer from GitHub | Leaks processor privilege into cron secret | Rejected |
| Auth the new function with `service_role` JWT | Mixes drain and clock | Rejected |

## Data Flow

```
Clocked (*/15 GitHub UTC)
  workflow POST Bearer CRON_SECRET
    → operator-lifecycle-pushes (CRON_KEY gate, 401 before RPC)
      → enqueue_operator_lifecycle_pushes()  [service_role only]
        → per-business local tz predicates
        → _insert_operator_lifecycle_notification (idempotency_key)
          → dashboard_notifications INSERT
            → trg_enqueue_web_push_outbox (allowlist; EXCEPTION RETURN NEW)
              → web_push_outbox UNIQUE(notification_id)
                → net.http_post process-web-push-outbox (vault service_role)
                  → payload.url = "/dashboard/turnos"

Instant #9 / #11
  bookings INSERT / status→cancelled
    → trigger (SECURITY DEFINER)
      → same helper → same pipeline

deposit.claimed (unchanged)
  claim_booking_deposit INSERT inbox only → not in allowlist → no outbox
```

Closed accounts (`businesses.account_closed_at IS NOT NULL`) are skipped by the clocked RPC. Ops events do **not** require a live public turnero. #10 does: ≥1 `source = 'client-self-service'` ever **and** `public_turnero_disabled_at IS NULL` (same gates as `_assert_business_accepts_public_bookings`, without calling that function so a disabled turnero does not raise).

## Clock and predicate rules

GitHub cron is UTC. Eligibility is local to `COALESCE(businesses.timezone, 'America/Argentina/Buenos_Aires')`. Idempotency makes a later tick in the same local day a no-op.

| # | Local gate | Predicate | `appointment_id` | Idempotency key |
|---|------------|-----------|------------------|-----------------|
| 1 | Mon–Fri, local time ∈ [08:30, 09:30) | Remaining today `booked`/`confirmed` counted (zero allowed) | null | `{local_date}` e.g. `2026-04-09` |
| 2 | none (every tick) | Day’s first remaining `booked`/`confirmed` by `starts_at` has `starts_at` in `[now()+60m, now()+90m]`. Once per local day. | that booking | `{local_date}` |
| 3 | local time ≥ 08:30 (all weekdays) | Remaining today = 0 **and** yesterday’s local day had ≥1 `booked`/`confirmed` (count rows that started yesterday, any current status) | null | `{local_date}` |
| 4 | `now() >= deposit_claimed_at + 15m` | `deposit_status = 'claim_pending'` (not the 30-minute unpaid hold) | booking id | `booking:{id}` |
| 5 | catch-up: local_date ≥ created local date (day 1) | No `services` row with `is_active` for the business; once-flag null | null | `once` |
| 6 | catch-up: local_date ≥ created local date + 1 (day 2) | `HOURS_ALL_CLOSED`: no `working_hours` day with `enabled === true`. Default weekday 09–18 **does not** fire. Ignore `professional_hours`. | null | `once` |
| 7 | catch-up: day 3 | slug present + ≥1 active service + ≥1 enabled day with an interval (`enabled` true and non-empty `start`/`end` or `intervals`) + `booking_link_copied_at` is null | null | `once` |
| 8 | catch-up: day 7 | Zero bookings with `source = 'client-self-service'` ever (include cancelled) | null | `once` |
| 9 | instant INSERT | First `client-self-service` row for the business (count including `NEW` = 1), even if later cancelled | booking id | `booking:{id}` |
| 10 | every tick | Live: ≥1 public booking ever **and** `public_turnero_disabled_at IS NULL`. Last public `created_at` older than 7 days. Re-arm: `retention_gap7_notified_at IS NULL OR retention_gap7_notified_at < last_public.created_at` | last public booking | `booking:{last_public_id}` |
| 11 | instant cancel | `customer_id` not null; count of `status = 'cancelled'` for that customer reaches 2 (this and prior). Further cancels no-op via unique key | the cancelling booking | `customer:{id}:cancel-2` |

Day-N uses `businesses.created_at` in the business timezone. Catch-up (not “miss the day and skip forever”) still requires the predicate and the once-flag / unique key.

`working_hours` shape (verified): jsonb map `monday`…`sunday` → `{ enabled, start, end, intervals?: [{start,end}] }`. Default consolidated JSON enables Mon–Fri 09:00–18:00. A day counts as an enabled interval iff `(value->>'enabled') = 'true'`.

Public booking URL in **body copy** (not click target): `https://orvel.pro/booking/{slug}` — same canonical origin as `buildPublicBookingUrl` for non-local, non-qa. SQL cannot see request origin; do not store the URL.

## File Changes

### Slice 1 — Ops (events 1–4). No copy-link instrumentation.

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/<ts>_operator_lifecycle_ops.sql` | Create | Partial unique index; `_insert_operator_lifecycle_notification`; `enqueue_operator_lifecycle_pushes` branches 1–4; `CREATE OR REPLACE enqueue_web_push_outbox` with eleven types (not `deposit.claimed`); GRANT RPC `service_role` only |
| `supabase/functions/operator-lifecycle-pushes/index.ts` | Create | Clone `release-expired-booking-holds`: CRON_KEY gate, then `rpc('enqueue_operator_lifecycle_pushes')`. Response `{ success: true }` / 401 / 500. No `service_role` in body or logs |
| `supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | Create | Clone release-holds static contract: 401 before RPC, `verify_jwt=false`, workflow secrets, no `pg_cron`, cadence `*/15` |
| `supabase/config.toml` | Modify | `[functions.operator-lifecycle-pushes] verify_jwt = false` plus CRON_KEY comment |
| `.github/workflows/operator-lifecycle-pushes.yml` | Create | `*/15 * * * *` + `workflow_dispatch`; secrets `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` + `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET`; missing → exit 1 |
| `supabase/functions/_shared/process-web-push-outbox.ts` | Modify | `OPERATOR_WEB_PUSH_EVENT_TYPES` += eleven strings |
| `supabase/functions/_shared/process-web-push-outbox.contract.test.ts` | Modify | Allowlist assertions for the eleven; `deposit.claimed` / `system.welcome` false; url still `/dashboard/turnos` |
| `apps/dashboard/src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts` | Create | Vitest reads **latest** `enqueue_web_push_outbox` body (not create-outbox); eleven types present; `deposit.claimed` absent |
| `apps/dashboard/src/app/tests/unit/operator-web-push-send.red.contract.spec.ts` | Keep | Still locks create-outbox three types |
| `apps/dashboard/src/app/core/notifications/internal-dashboard-notifications.api.ts` | Modify | Union += eleven; `appointmentId: string \| null` |
| `apps/dashboard/src/app/core/notifications/dashboard-notifications-once.contract.spec.ts` | Modify | Fixture allows null `appointmentId` |
| `apps/dashboard/src/orvel-push-sw.js` | Keep | Already defaults click to `/dashboard/turnos` |
| `supabase/functions/appointment-reminders-24h/` | Keep | Do not extend |
| Home / settings `copyBookingUrl` | Keep | Slice 1 must not persist copy |

### Slice 2 — Onboarding (events 5–8)

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/<ts>_operator_lifecycle_onboarding.sql` | Create | Once-flag columns; RPC branches 5–8; `mark_booking_link_copied(p_business_id uuid)` `SECURITY DEFINER` + `can_manage_business`; GRANT `authenticated` |
| `apps/dashboard/.../mark-booking-link-copied.ts` (shared helper next to home/settings) | Create | After successful writeText of business public URL, call the RPC once |
| `dashboard-home.page.ts` + `configuracion.page.ts` | Modify | `copyBookingUrl()` uses the helper. Do not touch `copyProfessionalBookingUrl` or `pwa-install.copyInstallLink` |
| Deno/vitest onboarding static contracts | Create/Modify | `HOURS_ALL_CLOSED` vs default 09–18; day-N `created_at`; copy helper not used by PWA install |

### Slice 3 — Retention (events 9–11)

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/<ts>_operator_lifecycle_retention.sql` | Create | First-public / gap flags; triggers #9/#11; RPC branch #10 `LIVE_REARM` |
| Static SQL contracts | Modify | First `client-self-service` INSERT; cancel count 2; gap re-arm; assert function not invoked |

## Interfaces / Contracts

### Locked `event_type` strings

| # | `event_type` | Push? |
|---|--------------|-------|
| 1 | `ops.briefing` | yes |
| 2 | `ops.first_turno_soon` | yes |
| 3 | `ops.empty_agenda` | yes |
| 4 | `ops.deposit_claim_stale` | yes |
| 5 | `onboarding.no_services` | yes |
| 6 | `onboarding.no_hours` | yes |
| 7 | `onboarding.copy_link` | yes |
| 8 | `onboarding.zero_public` | yes |
| 9 | `retention.first_public` | yes |
| 10 | `retention.public_gap` | yes |
| 11 | `retention.second_cancel` | yes |
| — | `deposit.claimed` | **no** (inbox only) |
| — | `appointment.created` / `cancelled` / `rescheduled` / `reminder` | yes (unchanged) |

### RPC

```sql
-- service_role only; REVOKE PUBLIC, anon, authenticated
enqueue_operator_lifecycle_pushes() RETURNS integer
-- returns inserted row count; no PII, no business ids

-- slice 2; authenticated + can_manage_business
mark_booking_link_copied(p_business_id uuid) RETURNS timestamptz
-- sets booking_link_copied_at = now() WHERE IS NULL; returns the timestamp
```

### Helper

```sql
_insert_operator_lifecycle_notification(
  p_business_id uuid,
  p_appointment_id uuid,          -- nullable
  p_event_type text,
  p_title text,
  p_body text,
  p_idempotency_key text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS boolean
```

Merges `idempotency_key` into metadata. Unique index:

```sql
CREATE UNIQUE INDEX dashboard_notifications_lifecycle_idempotency_uidx
  ON public.dashboard_notifications (
    business_id,
    event_type,
    (metadata->>'idempotency_key')
  )
  WHERE coalesce(metadata->>'idempotency_key', '') <> '';
```

### Idempotency key examples

```
ops.briefing              2026-04-09
ops.first_turno_soon      2026-04-09
ops.empty_agenda          2026-04-09
ops.deposit_claim_stale   booking:11111111-1111-1111-1111-111111111111
onboarding.*              once
retention.first_public    booking:{id}
retention.public_gap      booking:{last_public_id}
retention.second_cancel   customer:{id}:cancel-2
```

### Once-flag columns (`business_settings`)

`booking_link_copied_at`, `onboarding_no_services_notified_at`, `onboarding_no_hours_notified_at`, `onboarding_copy_link_notified_at`, `onboarding_share_day7_notified_at`, `retention_first_public_notified_at`, `retention_gap7_notified_at` — all `timestamptz` null.

After #10 insert, set `retention_gap7_notified_at = now()`. Next public booking with `created_at > retention_gap7_notified_at` re-arms. Unique key on last public id is the second belt.

### Operator-facing copy (Spanish, operational — not campaign)

| Type | Title | Body |
|------|-------|------|
| `ops.briefing` | Resumen de hoy | Hoy tenés {n} turnos. |
| `ops.first_turno_soon` | Primer turno cerca | {name} a las {local_hh:mm}. |
| `ops.empty_agenda` | Agenda vacía | Hoy no quedan turnos. Ayer tuviste movimiento. |
| `ops.deposit_claim_stale` | Seña sin confirmar | Sigue pendiente de confirmar 15 minutos después del aviso. |
| `onboarding.no_services` | Faltan servicios | Todavía no hay un servicio activo. |
| `onboarding.no_hours` | Faltan horarios | No hay un día con horario habilitado. |
| `onboarding.copy_link` | Compartí tu link | Tu turnero está listo. {canonical_booking_url} |
| `onboarding.zero_public` | Sin reservas públicas | A una semana, nadie reservó desde el link. |
| `retention.first_public` | Primera reserva pública | {name} reservó desde el turnero. |
| `retention.public_gap` | 7 días sin reservas públicas | La última reserva pública fue hace más de una semana. |
| `retention.second_cancel` | Mismo cliente canceló dos veces | {name} ya tiene dos cancelaciones. |

No digest/newsletter wording. Click is never the public booking URL.

### GitHub secrets / function env

| Name | Role |
|------|------|
| `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` | Workflow POST target |
| `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET` | Workflow `Authorization: Bearer` |
| Function secret `CRON_KEY` | Must equal the cron secret; **must not** be `SUPABASE_SERVICE_ROLE_KEY` |
| Function `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Server-side RPC only, same as release-holds |

Missing workflow secrets: job `exit 1`; that env has no clocked events. Triggers #9/#11 still work once slice 3 is migrated.

### Dashboard TS

```ts
export type DashboardNotificationEventType =
  | 'appointment.created' | 'appointment.cancelled'
  | 'appointment.rescheduled' | 'appointment.reminder'
  | 'ops.briefing' | 'ops.first_turno_soon' | 'ops.empty_agenda' | 'ops.deposit_claim_stale'
  | 'onboarding.no_services' | 'onboarding.no_hours' | 'onboarding.copy_link' | 'onboarding.zero_public'
  | 'retention.first_public' | 'retention.public_gap' | 'retention.second_cancel';

appointmentId: string | null;
```

`deposit.claimed` may still arrive as raw `event_type` (already true today). Do not add it to the push allowlist.

## Testing Strategy

Strict TDD in apply. RED contracts before production SQL/TS.

| Layer | What | Approach |
|-------|------|----------|
| Deno static SQL | Unique index predicate; helper unique_violation; RPC service_role GRANT; clock predicates (weekday 08:30, 60–90 first remaining, empty after busy yesterday, claim_pending + 15m on `deposit_claimed_at`); `deposit.claimed` not in latest enqueue; no `pg_cron`; no `enqueue_appointment_reminders_24h` | New `operator-lifecycle-pushes-static-contract.test.ts` plus SQL body scans of the **new** migration |
| Deno Edge | Bad/missing `CRON_KEY` → 401 **before** `rpc(`; `verify_jwt = false`; no `isPrivilegedWebPushAuthorization`; response has no `service_role` / key material | Clone release-holds contract |
| Workflow | `*/15 * * * *`; `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` / `_CRON_SECRET`; missing → exit 1; Bearer cron secret not service_role name; `workflow_dispatch` | Same file as Edge static |
| Vitest allowlist | Latest `enqueue_web_push_outbox` contains eleven types; create-outbox file still three types only; helper TS list aligned; `buildOperatorWebPushPayload` url `/dashboard/turnos` | New vitest + existing red contract **kept** |
| Processor Deno | `isOperatorWebPushEventType` true for eleven; false for `deposit.claimed` | Extend `process-web-push-outbox.contract.test.ts` |
| Inbox vitest | Union includes eleven; `appointmentId` nullable | `internal-dashboard-notifications.api.ts` + once-contract fixtures |
| Slice 2 | Default 09–18 does not match `HOURS_ALL_CLOSED`; PWA install page has no `mark_booking_link_copied`; home+settings `copyBookingUrl` do | Static + page contracts |
| Slice 3 | #9 WHEN `client-self-service`; #11 count 2; #10 uses `public_turnero_disabled_at` without calling `_assert_business_accepts_public_bookings` | Static SQL |
| E2E | Out of scope | Scoped dashboard + Deno, then `pnpm run check` or scoped equivalent |

## Threat Matrix

| Threat | Mitigation |
|--------|------------|
| Unauthenticated clock fan-out (`verify_jwt = false`) | Constant-time `CRON_KEY` compare; 401 before RPC; missing env key → 401 |
| GitHub secret is actually `service_role` | Contract: function source reads `CRON_KEY` only for the gate; workflow secret names are `*_CRON_SECRET`; processor stays on vault Bearer `service_role` |
| Function response leaks `SUPABASE_SERVICE_ROLE_KEY` / cron material | JSON `{ success: true }` or `{ success: false, error: "UNAUTHORIZED" \| "SERVER_CONFIGURATION_ERROR" \| "OPERATOR_LIFECYCLE_PUSHES_FAILED" }`; `--output /dev/null` on curl |
| Authenticated client spam-inserts lifecycle rows | Helper and clock RPC not granted to `anon`/`authenticated`; unique index still caps duplicates |
| Inbox insert fails push | Existing fail-open `EXCEPTION WHEN OTHERS THEN RETURN NEW` on enqueue |
| Cron spam | Unique idempotency ships in slice 1 **before** the workflow is enabled |
| Marketing-shaped copy | Locked operational Spanish titles/bodies above |

Agent git/PR composition rows are N/A (design only; no commit/push).

## Migration / Rollout

Additive migrations only. No backfill of historical briefing/onboarding. No destructive rollback. No migration repair without Santi.

1. Deploy slice-1 SQL (unique index + RPC + allowlist) **before** enabling the workflow.
2. Deploy Edge Function `operator-lifecycle-pushes` to the env.
3. Set function `CRON_KEY` and GitHub `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` + `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET` (ops follow-up; same family as release-holds). Until secrets exist, clocked events are silent; that is an env gate, not a schema bug.
4. Slice 2 dashboard copy writers can ship after the RPC exists.
5. Slice 3 triggers work as soon as migrated, independent of cron secrets.

Rollback:

- Slice 1: disable the GitHub workflow. Unique index and unused RPC may remain. Revert allowlist only if new types must not push; appointment types stay.
- Slice 2: stop calling `mark_booking_link_copied`; flags stop updating. Inbox rows already sent stay.
- Slice 3: drop or no-op #9/#11 triggers; #10 branch no-op. Re-arm columns stay inert.

Delivery: `ask-on-risk`. Review budget 400. Slice 1 alone (SQL + Deno + workflow + allowlist + inbox types) is **High** 400-line risk. Tasks MUST forecast lines per slice. Parent pauses for a human delivery decision if a packed diff would exceed 400. Do **not** invent `chain_strategy` or `size:exception`.

## Open Questions

None that reopen `DEFAULTS`.

Operational leftover (not product): per-env GitHub secrets + Edge Function deploy + function `CRON_KEY` wiring. Document in the workflow comment the same way `release-expired-booking-holds.yml` does. QA vs prod canonical booking URL in **body copy** is always `https://orvel.pro/booking/{slug}`; click path stays `/dashboard/turnos`.
