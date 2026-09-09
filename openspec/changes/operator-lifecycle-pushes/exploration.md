# Exploration: operator-lifecycle-pushes

Capped operator inbox + web push only (11 events). Not marketing automation. Doctrine 1.0.1 still forbids ordinary owner booking email; this change does not add engagement email.

## Current state (verified)

### Pipeline

`dashboard_notifications` INSERT → trigger `trg_enqueue_web_push_outbox` (`enqueue_web_push_outbox`) → `web_push_outbox` (UNIQUE `notification_id`) → trigger `trg_request_web_push_outbox_processing` (`net.http_post` to `/functions/v1/process-web-push-outbox` with vault `service_role_key`) → Edge Function `process-web-push-outbox`.

- `supabase/config.toml`: `[functions.process-web-push-outbox] verify_jwt = true`.
- Auth: `isPrivilegedWebPushAuthorization` (exact service_role key or JWT `role=service_role`). Not `CRON_KEY`.
- Payload builder hardcodes `url: "/dashboard/turnos"`. SW `apps/dashboard/src/orvel-push-sw.js` defaults click to the same path (`payload.url || DEFAULT_CLICK_URL`).
- Email outbox is a separate webhook-per-row drain (`process-email-outbox`). Unused here.

### Event types today

| `event_type` | Inbox | Web push enqueue | Processor allowlist |
|---|---|---|---|
| `appointment.created` | yes | yes | yes |
| `appointment.cancelled` | yes | yes | yes |
| `appointment.rescheduled` | yes | yes | yes |
| `appointment.reminder` | yes | yes (later migration) | yes |
| `deposit.claimed` | yes (SQL insert in `claim_booking_deposit`) | **no** | **no** → outbox never created |

Enqueue allowlist lives in two places that must stay aligned:

1. SQL `enqueue_web_push_outbox` latest body: `supabase/migrations/20260829180000_reminder_operator_push_and_premium_activated.sql` (`created` / `cancelled` / `rescheduled` / `reminder`).
2. TS `OPERATOR_WEB_PUSH_EVENT_TYPES` in `supabase/functions/_shared/process-web-push-outbox.ts`. Unknown types are marked `skipped` / `unsupported_event_type`.

Dashboard TS union `DashboardNotificationEventType` lists the four appointment types only. `deposit.claimed` already reaches the bell as raw `event_type` + title/body; `appointmentId` is typed required though SQL `appointment_id` is nullable. Scheduled lifecycle rows will need nullable appointment + union extension.

There is **no UNIQUE** on `dashboard_notifications (appointment_id, event_type)` or `(business_id, event_type)`. Reminder RPC uses `WHERE NOT EXISTS`. `web_push_outbox` only unique-keys `notification_id`. Cron without a stronger key will spam.

Static contract `apps/dashboard/src/app/tests/unit/operator-web-push-send.red.contract.spec.ts` still asserts the **original three** types in the create-outbox migration and forbids `appointment.reminder` in that file. Later migration added reminder. Allowlist work must update the **latest** enqueue function and the processor helper; do not “fix” the historical create migration.

### Scheduler pattern (no pg_cron)

Existing clocked jobs: Edge Function + external POST (`CRON_KEY` / `x-cron-key` / Bearer), `verify_jwt = false`. Checked-in GitHub cron: `.github/workflows/release-expired-booking-holds.yml` (`*/5 * * * *`). Same family: `purge-elapsed-bookings`, `account-closure`, `signup-email-verification-lifecycle`.

`appointment-reminders-24h` is **not** that family in-repo:

- Function POSTs RPC `enqueue_appointment_reminders_24h` gated by `CRON_KEY`.
- No `[functions.appointment-reminders-24h]` block in `config.toml`.
- No root `.github/workflows` invoker (only a nested dashboard deploy mention). Cadence is operational/external.
- RPC window is **23–25h**, requires `customer.email`, `send_appointment_reminders_24h`, and also inserts `appointment.reminder` inbox+push. Coupling operator lifecycle here mixes customer email with owner push.

### Copy-link CTA (instrumentable)

Operator booking URL is `buildPublicBookingUrl(slug)` from `packages/booking/src/domain/public-booking-url.ts` (prod `https://orvel.pro/booking/{slug}`).

Clipboard writers today (local UI flags only; **no DB write**):

- `dashboard-home.page.ts` `copyBookingUrl()` — header “Compartir link” plus more home buttons.
- `configuracion.page.ts` `copyBookingUrl()` — settings portal copy; zen theme delegates here.

PWA install copies `window.location.href`, not the booking URL. Do not treat that as “copied booking link”.

### Detection sources

| Catalog # | Detectable today? | Evidence |
|---|---|---|
| 1 Morning briefing | Yes | `bookings.starts_at` in local day; `businesses.timezone` default `America/Argentina/Buenos_Aires`; customer name via `customers`. Active statuses used elsewhere: `booked` and `confirmed`. |
| 2 First turno 60–90 min | Yes | Same agenda query with `starts_at` in `[now()+60m, now()+90m]`. Needs a **frequent** tick, not a once-daily job. |
| 3 Empty agenda if yesterday had turnos | Yes | Count today’s vs yesterday’s local-day bookings. |
| 4 Stale seña claim | Yes | `deposit_status = 'claim_pending'` and `deposit_claimed_at` (set in `claim_booking_deposit`). Threshold not specified. `deposit.claimed` inbox already fires at claim time; stale is a **new** later event. |
| 5 Day 1 no services | Partial | `services` per `business_id` (`is_active`). Signup/onboarding **provisions default services** (`provision_default_services_for_business`). Day-1 empty is the skip/delete/fail path, not the happy path. Clock: `businesses.created_at` exists; `public.users.last_login_at` has **no writer** (dead). |
| 6 Day 2 no hours | Ambiguous | `business_settings.working_hours` defaults to weekday 09:00–18:00 JSON, so the row is never “missing”. Multi-pro also has `professional_hours`. “Empty” is undefined. |
| 7 Day 3 copy link | Needs a flag | Turnero-ready = services + hours (once defined) + slug. Copy is not persisted. Instrument home + settings copy CTAs. |
| 8 Day 7 0 public bookings | Yes, if capped | `bookings.source = 'client-self-service'` (public path). Admin manual is `admin-manual`. Count ever; send once. |
| 9 First public booking | Yes | First INSERT `source = 'client-self-service'`. Trigger is natural. |
| 10 7d gap (live business) | Partial | Last public `created_at` older than 7d. “Live business” undefined. |
| 11 Same client cancelled twice | Partial | `bookings.customer_id` + `status = 'cancelled'`. No cancel-actor column in the paths checked; client vs operator cancel is not distinguished in SQL. |

Public booking URL is not stored; compute from `businesses.slug` when copy is needed in push body.

## Non-goals (locked)

Operator emails; client web push; client 2h same-day reminder; reschedule email enqueue repair; inactivity/`last_seen` re-engagement; marketing engine / newsletter / CRM; `pg_cron`; changing existing appointment.created/cancelled/reminder push copy except allowlist extension. `deposit.claimed` stays inbox-only unless a later decision adds it — stale seña is a distinct event.

## Approaches

### 1. One daily cron Edge Function enqueueing all 11 via RPC

Single `enqueue_operator_lifecycle_pushes()` + GitHub cron like release-holds.

- Pros: one deployable; idempotent RPC can own all clock math.
- Cons: **cannot** implement #2 (60–90 min before first turno) or timely stale seña unless “daily” is a lie. Onboarding once-flags still need extra columns. First booking / double cancel become delayed up to 24h.
- Effort: Medium SQL, High if forced to cover #2 with a daily tick.

### 2. Extend `appointment-reminders-24h`

Add operator branches to `enqueue_appointment_reminders_24h` and its Edge Function.

- Pros: reuses an existing privileged RPC entry.
- Cons: RPC is customer-email + 23–25h window + settings flag; no in-repo GitHub workflow; mixes customer mail with owner lifecycle; still wrong cadence for #2; review-risk on a live reminder path.
- Effort: Medium-High, poor fit.

### 3. Mix: triggers for instant events + new frequent cron for clocked ones (recommended)

- **Triggers** (insert `dashboard_notifications` → existing push pipeline): #9 first public booking; #11 second cancel for same `customer_id`. Optional: skip cron for these entirely.
- **New Edge Function** `operator-lifecycle-pushes` (`verify_jwt = false`, `CRON_KEY`, clone release-holds/purge). RPC fans out clocked events with per-event idempotency. **Do not** use `pg_cron`. **Do not** drain via email outbox.
- Cadence: GitHub `*/15 * * * *` (or `*/10`) so #2 and #4 can fire in-window; morning/onboarding/gap no-op unless local weekday window / day-N / once-flag matches.
- Allowlist: extend SQL enqueue + `OPERATOR_WEB_PUSH_EVENT_TYPES` together. Keep payload URL `/dashboard/turnos` unless product later asks deep links (SW already honors `payload.url`).

Pros: matches existing cron family; keeps 24h reminder intact; instant retention without waiting for cron; one RPC can still host ops+onboarding+retention clocked slices.

Cons: new secrets (`*_FUNCTION_URL`, `*_CRON_SECRET`); two allowlist sites; inbox TS union lag.

Effort: Medium per slice; High if packed.

## Idempotency (anti-spam)

Do not rely on `WHERE NOT EXISTS` alone.

1. **Period key on the notification row**, unique:

   `UNIQUE (business_id, event_type, (metadata->>'idempotency_key'))`  
   Examples: `2026-04-08` (briefing/empty agenda), `booking:{id}` (first-turno-soon, stale claim, first public), `customer:{id}:cancel-2`.

2. **Once-flags on `business_settings`** (or `businesses`) for onboarding/retention caps: `booking_link_copied_at`, `onboarding_no_services_notified_at`, `onboarding_no_hours_notified_at`, `onboarding_copy_link_notified_at`, `onboarding_share_day7_notified_at`, `retention_first_public_notified_at`, `retention_gap7_notified_at` (re-arm rule is a product question).

Copy CTA: on successful `clipboard.writeText` of the public booking URL, set `booking_link_copied_at = now()` (RPC or authenticated update). Both home and settings must share one helper.

Enqueue trigger remains fail-open (`EXCEPTION WHEN OTHERS THEN RETURN NEW`) — inbox must not fail if push enqueue fails.

## Slice recommendation (400-line ask-on-risk)

Do not invent `chain_strategy` or `size:exception`. Forecast: all 11 + dashboard copy instrumentation + new function + workflow **will exceed 400 lines**. Parent pauses at delivery if a slice forecasts over budget.

Suggested independently shippable order:

1. **Ops (1–4)** — unique idempotency key; allowlist extension; new RPC + Edge Function + `config.toml` + GitHub workflow; inbox union/null `appointmentId`; events 1–4 only. Highest operational value; proves the clock without onboarding product ambiguity.
2. **Onboarding (5–8)** — once-flags; copy CTA persistence (dashboard); day-N using `businesses.created_at` unless product picks another clock. Blocked on “empty hours” and “turnero ready”.
3. **Retention (9–11)** — triggers for #9/#11; cron branch for #10. Smallest if ops RPC already exists.

Slice 1 already touches SQL + Deno + workflow + tests + TS allowlist. Keep dashboard copy instrumentation out of slice 1.

## Open product questions (block proposal)

1. Morning briefing local hour (and weekend skip: weekdays only confirmed)?
2. Stale `claim_pending` age (minutes/hours)? Distinct from the 30-min unpaid hold?
3. What is “no hours” given default `working_hours` JSON and `professional_hours`?
4. Day 1/2/3/7 clock: `businesses.created_at` vs something else? (`last_login_at` is dead.)
5. “Turnero ready” for #7: active service + at least one enabled day + slug?
6. Same-client cancel: any `cancelled` row, or client-self-service / public-manage only?
7. “Live business” for #10, and does the 7d gap re-arm after the next public booking?
8. Keep click URL `/dashboard/turnos` for onboarding events?
9. #2: only the day’s first remaining turno, once per day per business?
10. Public booking = `source = 'client-self-service'` including later cancelled rows?

## Risks

- Extending `appointment-reminders-24h` would couple owner lifecycle to customer email and the wrong time window.
- Default service provisioning makes #5 rare; default hours make #6 undefined until product answers.
- Copy-link without a persisted flag cannot implement #7/#8 honestly.
- A true daily cron misses #2.
- Inbox TypeScript union and required `appointmentId` will drop or mis-type new rows until updated.
- New GitHub secrets are an ops gate for slice 1, same as release-expired-holds.
- Historical web-push contract tests lock the **create** migration allowlist of three types; tests for the latest enqueue function must be added rather than rewriting history.
