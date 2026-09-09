# Proposal: operator-lifecycle-pushes

## Intent

Give operators a **capped** inbox + web-push loop for the eleven operational and onboarding moments that already exist in the product, without becoming marketing automation.

Today the durable bell and web-push pipeline only fire for appointment create / cancel / reschedule / reminder. `deposit.claimed` is inbox-only. There is no morning briefing, no 60–90 minute first-turno nudge, no empty-agenda ping, no stale-seña follow-up, no day-N onboarding prompts, and no first-public / 7-day-gap / second-cancel retention signals. Clocked work either does not exist or would be wrongly bolted onto customer 24h reminder email.

This change inserts at most eleven new `dashboard_notifications` event types. Each allowed type also enqueues operator web push through the existing outbox. Doctrine from release 1.0.1 still forbids ordinary owner booking email; this change does not add operator or client engagement email, and does not add client push.

Frame: capped operational / onboarding operator push. Not a CRM, newsletter, or marketing engine (`infra/context/product.md` non-goal).

## Confirmed product contract (do not reopen)

Token `DEFAULTS` accepted 2026-04-09. No overrides.

| # | Event | Token | Rule |
|---|---|---|---|
| 1 | Morning briefing | `0830_WEEKDAYS` | Local 08:30, Monday–Friday only. Timezone: `businesses.timezone` (default `America/Argentina/Buenos_Aires`). |
| 2 | First turno soon | `FIRST_REMAINING_ONCE` | Day’s first remaining `booked`/`confirmed` turno whose `starts_at` is in `[now()+60m, now()+90m]`. Once per local day per business. |
| 3 | Empty agenda | (locked in catalog) | Fire when today has zero remaining `booked`/`confirmed` turnos and yesterday’s local day had at least one. |
| 4 | Stale seña claim | `CLAIM_15M` | `deposit_status = 'claim_pending'` and 15 minutes after `deposit_claimed_at`. Distinct from the 30-minute unpaid hold. Distinct from inbox-only `deposit.claimed`. |
| 5 | Day 1 no services | `CREATED_AT` | Clock = `businesses.created_at`. Fire once if the business has no active service on day 1. |
| 6 | Day 2 no hours | `HOURS_ALL_CLOSED` | Fire only if there is **no enabled interval on any weekday**. Default weekday 09–18 JSON **does not** fire. |
| 7 | Day 3 copy link | `READY_SLUG_SVC_HOURS` | Fire once on day 3 if turnero-ready (slug + ≥1 active service + ≥1 enabled day with intervals) and the public booking URL has not been copied (`booking_link_copied_at` is null). |
| 8 | Day 7 zero public | `SELF_SERVICE` | Fire once on day 7 if zero bookings with `source = 'client-self-service'` ever (count rows even if later cancelled). |
| 9 | First public booking | `SELF_SERVICE` | First INSERT with `source = 'client-self-service'` (count even if later cancelled). Instant. |
| 10 | 7-day public gap | `LIVE_REARM` | Live business = ≥1 public booking ever **and** public turnero not disabled (same accept-public-bookings gate as `_assert_business_accepts_public_bookings`). Fire when last public `created_at` is older than 7 days. Re-arm after the next public booking. |
| 11 | Same client cancelled twice | `ANY_CANCEL_ONCE` | Any `cancelled` row for the same `customer_id`; notify once when the count reaches 2. No cancel-actor column (limitation: cannot distinguish client vs operator cancel). |

Click URL for all eleven: `/dashboard/turnos` (`TURNOS_URL`). The public booking URL may appear in body copy; it is not the click target.

`deposit.claimed` stays inbox-only. Stale seña is a **new** later event.

## Why now

Operators already live in the dashboard bell and PWA push. The product is turnos-first; the gaps are operational (today’s book, seña stuck in `claim_pending`, empty day after a busy yesterday) and onboarding (share the link, set hours only when they are actually closed, first public booking). Shipping a capped list on the existing notify → outbox → `process-web-push-outbox` path avoids a marketing stack and keeps release 1.0.1’s “no ordinary owner booking email” doctrine intact.

## Scope

Three independently shippable slices. Slice 1 is the clock proof; copy-link instrumentation waits for slice 2.

### In scope

- Eleven operator inbox + web-push events listed above.
- Unique idempotency on `dashboard_notifications`: `(business_id, event_type, (metadata->>'idempotency_key'))`.
- Once-flags on `business_settings` (or `businesses` if design proves a better home): `booking_link_copied_at`, `onboarding_no_services_notified_at`, `onboarding_no_hours_notified_at`, `onboarding_copy_link_notified_at`, `onboarding_share_day7_notified_at`, `retention_first_public_notified_at`, plus a 7-day-gap re-arm field.
- New privileged RPC fan-out for **clocked** events + Edge Function `operator-lifecycle-pushes` (`verify_jwt = false`, `CRON_KEY` / `x-cron-key` / Bearer) + GitHub workflow `*/15 * * * *`, cloned from `release-expired-booking-holds`.
- SQL triggers for **instant** events #9 and #11 (insert `dashboard_notifications` → existing fail-open push enqueue).
- Extend **latest** SQL `enqueue_web_push_outbox` allowlist and TS `OPERATOR_WEB_PUSH_EVENT_TYPES` together. Do not rewrite the historical create-outbox migration.
- Dashboard inbox union: add the new event types; allow nullable `appointmentId` for scheduled / business-level rows.
- Slice 2 only: persist `booking_link_copied_at` on successful `clipboard.writeText` of the **public booking URL** from home and settings (shared helper). PWA install copy of `window.location.href` is not a booking-link copy.

### Out of scope

- Operator engagement email; client engagement email; client web push.
- Client 2h same-day reminder.
- Extending `appointment-reminders-24h` or `enqueue_appointment_reminders_24h`.
- `pg_cron`.
- Marketing automation, newsletter, CRM, inactivity / `last_seen` re-engagement (`public.users.last_login_at` is dead; do not revive it for this change).
- Changing existing appointment.created / cancelled / rescheduled / reminder push copy except allowlist extension.
- Promoting `deposit.claimed` to web push.
- Deep-link click URLs other than `/dashboard/turnos`.
- Distinguishing cancel actor (no column).
- Email outbox drain for these events.
- Landing, Mercado Pago, inventory, waitlist, marketplace.

## Capabilities

Exact `event_type` strings are locked in spec. Proposal names are the product capabilities.

### New capabilities

- **operator-lifecycle-clock** — privileged RPC + `operator-lifecycle-pushes` Edge Function + ~15 min GitHub cron that evaluates clocked events in the business timezone and inserts idempotent `dashboard_notifications`.
- **operator-ops-pushes** — events 1–4: weekday 08:30 briefing; first remaining turno in 60–90 min once per local day; empty today after a busy yesterday; stale `claim_pending` 15 minutes after `deposit_claimed_at`.
- **operator-onboarding-pushes** — events 5–8: day-N from `businesses.created_at`; no active services; hours only when all weekdays have no enabled interval; copy-link when turnero-ready and uncopied; day-7 zero `client-self-service` bookings. Includes `booking_link_copied_at` instrumentation.
- **operator-retention-pushes** — events 9–11: first public booking trigger; 7-day public gap with live-business gate and re-arm; second cancel for the same `customer_id` once.

### Modified capabilities

- **operator-web-push-allowlist** — latest `enqueue_web_push_outbox` and `OPERATOR_WEB_PUSH_EVENT_TYPES` gain the eleven types; payload `url` stays `/dashboard/turnos`; unknown types remain `skipped` / `unsupported_event_type`.
- **dashboard-notifications-inbox** — TypeScript union and `appointmentId` nullability match SQL (scheduled rows may have null `appointment_id`).
- **durable-dashboard-notify** — still the operator channel of record (release 1.0.1 doctrine). Push enqueue stays fail-open (`EXCEPTION WHEN OTHERS THEN RETURN NEW`). Booking-path atomicity for existing appointment events is unchanged.

## Approach

**Mix (exploration option 3), locked.**

| Kind | Events | Mechanism |
|---|---|---|
| Instant | #9 first public, #11 second cancel | AFTER INSERT/UPDATE SQL triggers write `dashboard_notifications` with period keys `booking:{id}` and `customer:{id}:cancel-2`. Existing `trg_enqueue_web_push_outbox` does the rest. |
| Clocked | #1–8, #10 | New RPC called by `operator-lifecycle-pushes`. GitHub `*/15 * * * *` so #2 and #4 can hit their windows. Morning / day-N / gap no-op unless the local window or once-flag matches. |

Rejected (do not reopen):

1. One true daily cron — misses #2 and timely #4; delays #9/#11 up to 24h.
2. Extend `appointment-reminders-24h` — customer-email 23–25h window, settings flag, no in-repo GitHub invoker, mixes customer mail with owner lifecycle.

Idempotency (anti-spam):

1. Unique `(business_id, event_type, (metadata->>'idempotency_key'))`. Example keys: local date for briefing / empty agenda / first-turno-soon; `booking:{id}` for stale claim and first public; `customer:{id}:cancel-2` for double cancel.
2. Once-flags for onboarding and first-public. Gap uses `LIVE_REARM`: after notify, wait for a later public booking, then the 7-day clock may fire again.
3. Do not rely on `WHERE NOT EXISTS` alone.

Pipeline reuse: `dashboard_notifications` INSERT → `enqueue_web_push_outbox` → `web_push_outbox` (UNIQUE `notification_id`) → `process-web-push-outbox`. Auth for the **processor** stays service_role. Auth for the **new cron function** is `CRON_KEY`, same family as release-expired-holds / purge-elapsed-bookings / account-closure.

Public booking URL in body copy is computed from `businesses.slug` via existing `buildPublicBookingUrl`; it is not stored.

Historical web-push contract tests lock the **create** migration allowlist of three types. Add tests against the **latest** enqueue function; do not “fix” history.

## Slice plan

Delivery: `ask-on-risk`. Review budget **400** changed lines. All three slices packed as one PR: **High** 400-line risk. Do **not** invent `chain_strategy` or `size:exception` here. Tasks MUST forecast size per slice; parent pauses for a human delivery decision if a packed diff would exceed 400 lines.

### Slice 1 — Ops (events 1–4)

Highest operational value; proves the clock without onboarding flags.

- Unique idempotency key on `dashboard_notifications`.
- Allowlist extension (SQL latest enqueue + TS processor) for the four ops types (or for all eleven strings if cheaper to name them once — still only **enqueue** 1–4 in this slice).
- RPC + Edge Function `operator-lifecycle-pushes` + `config.toml` `verify_jwt = false` + GitHub workflow ~15 min.
- Inbox union + nullable `appointmentId`.
- No dashboard copy-link instrumentation.
- No day-N once-flags required except what the unique key already covers.

### Slice 2 — Onboarding (events 5–8)

- Once-flags and day-N from `businesses.created_at`.
- `HOURS_ALL_CLOSED` / `READY_SLUG_SVC_HOURS` predicates.
- Persist `booking_link_copied_at` from home + settings public-URL copy (shared helper). Do not treat PWA install copy as success.

### Slice 3 — Retention (events 9–11)

- Triggers for #9 and #11.
- Cron branch for #10 with `LIVE_REARM`.
- Smallest if the ops RPC already exists.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `supabase/migrations/` (new, additive) | Add | Unique idempotency; once-flags; clocked RPC; triggers #9/#11; latest `enqueue_web_push_outbox` allowlist |
| `supabase/functions/operator-lifecycle-pushes/` | Add | CRON_KEY Edge Function; clone release-expired-holds |
| `supabase/config.toml` | Modify | `[functions.operator-lifecycle-pushes] verify_jwt = false` |
| `.github/workflows/` | Add | `*/15 * * * *` POST with cron secret (same family as `release-expired-booking-holds.yml`) |
| `supabase/functions/_shared/process-web-push-outbox.ts` | Modify | `OPERATOR_WEB_PUSH_EVENT_TYPES` |
| Dashboard notification types / bell mapping | Modify | Union + nullable `appointmentId` |
| `apps/dashboard/.../dashboard-home.page.ts` + `configuracion.page.ts` | Modify (slice 2) | Persist booking-link copy; shared helper |
| `packages/booking/src/domain/public-booking-url.ts` | Keep/reuse | Body copy URL from slug |
| `apps/dashboard/src/orvel-push-sw.js` | Keep | Already defaults click to `/dashboard/turnos` |
| `supabase/functions/appointment-reminders-24h/` | Keep | Do not extend |
| `supabase/functions/process-email-outbox/` | Keep | Unused here |
| Historical create-outbox migration + original 3-type contract | Keep | Do not rewrite; add latest-enqueue tests |
| `apps/landing/` | Keep | Out of scope |

GitHub secrets for slice 1 (ops gate, same as release-expired-holds): function URL + cron secret per env. Missing secrets leave that env without clocked events; triggers #9/#11 still work once migrated.

## Impact

- **Operators**: weekday briefing, in-window first-turno nudge, empty-day ping, stale seña follow-up, capped onboarding, first public booking, 7-day gap, second-cancel once. All clicks land on Turnos.
- **Clients**: no new mail or push.
- **Ops**: one more CRON_KEY workflow. Secrets are an env gate for clocked events.
- **Support / product**: this is not a campaign tool; the catalog is closed at eleven. Default services make #5 rare; default 09–18 means #6 only fires if hours were actually cleared.
- **Inbox**: more durable rows; unique key prevents cron spam.

## Risks

1. **Packed PR vs 400-line budget** — SQL + Deno + workflow + allowlist + inbox types (slice 1) already likely near budget; slices 2–3 add dashboard copy + triggers. *Mitigation*: `ask-on-risk`; forecast per slice; do not invent chaining or `size:exception` in this proposal.
2. **Cron spam without unique key** — `dashboard_notifications` has no unique `(business_id, event_type)` today. *Mitigation*: unique on idempotency_key ships in slice 1 before the workflow is enabled.
3. **Wrong reminder function** — coupling to `appointment-reminders-24h` would mix customer email with owner lifecycle. *Mitigation*: new function only; do not call that RPC.
4. **`pg_cron` drift** — other jobs already forbid it. *Mitigation*: GitHub + CRON_KEY only.
5. **Doctrine leak into email** — release 1.0.1 forbids ordinary owner booking email. *Mitigation*: no email outbox writes for these eleven events.
6. **Allowlist split-brain** — SQL enqueue and TS processor can diverge; unknown types are skipped. *Mitigation*: extend both in the same slice; contract-test the latest enqueue body, not the create migration.
7. **Inbox TS lag** — required `appointmentId` will mis-type business-level rows. *Mitigation*: nullable appointment + union in slice 1.
8. **Copy-link honesty** — without `booking_link_copied_at`, #7/#8 cannot know whether the operator shared the URL. *Mitigation*: instrumentation in slice 2; do not ship #7 on UI-only flags.
9. **Default services / hours** — #5 is the skip/delete path; #6 does not fire on default 09–18. *Mitigation*: product-accepted; do not invent a “never opened settings” heuristic.
10. **Cancel actor unknown** — #11 may notify after two operator cancels. *Mitigation*: accepted limitation `ANY_CANCEL_ONCE`.
11. **New secrets** — clocked events silent until URL + CRON_KEY exist in the env. *Mitigation*: document the gate; triggers still fire for #9/#11.
12. **Marketing-shaped copy** — body text that sounds like a campaign violates the non-goal. *Mitigation*: spec copy as operational/onboarding facts; no digest/newsletter language.

## Rollback Plan

- **Slice 1**: disable the GitHub workflow / stop POSTing the Edge Function. Clocked inserts stop. Unique index and unused RPC may remain (additive). Revert allowlist if new types must not push; existing appointment types stay. Do not run migration repair without Santi approval.
- **Slice 2**: revert copy-link writers; once-flags stop receiving updates. Already-sent onboarding rows remain in the inbox (honest history).
- **Slice 3**: drop or no-op the #9/#11 triggers; gap branch in the RPC becomes a no-op. Re-arm flags stay inert.

No destructive schema rollback. Inbox rows already delivered are not deleted as part of rollback.

## Dependencies

- Existing pipeline: `dashboard_notifications`, `enqueue_web_push_outbox`, `web_push_outbox`, `process-web-push-outbox`.
- Scheduler family: `release-expired-booking-holds` / purge-elapsed-bookings / account-closure (`CRON_KEY`, `verify_jwt = false`).
- Seña claim timestamps from `claim_booking_deposit` (`deposit_claimed_at`, `claim_pending`).
- Public source `client-self-service`; timezone on `businesses`; working hours JSON on `business_settings`.
- Release 1.0.1 doctrine: durable dashboard notify required on booking paths; no ordinary owner booking email.
- No dependency on `appointment-reminders-24h`, email outbox, or `last_login_at`.

## Success Criteria

- [ ] Events 1–4 enqueue at most once per idempotency key and produce operator inbox + web push with click URL `/dashboard/turnos`.
- [ ] Briefing fires only Mon–Fri at local 08:30; first-turno-soon only for the day’s first remaining `booked`/`confirmed` in the 60–90 min window, once per local day.
- [ ] Stale seña fires 15 minutes after `deposit_claimed_at` on `claim_pending` and does not change `deposit.claimed` (still inbox-only, no push).
- [ ] Default 09–18 hours do not fire #6; #6 fires only when no weekday has an enabled interval.
- [ ] Day-N uses `businesses.created_at`; #7 requires slug + ≥1 active service + ≥1 enabled day and unset `booking_link_copied_at`.
- [ ] Public booking means `source = 'client-self-service'` even if later cancelled; #9 fires once on first such INSERT; #8 fires once on day 7 if the count is still zero.
- [ ] #10 only for live businesses (≥1 public booking ever and public turnero not disabled) and re-arms after the next public booking.
- [ ] #11 notifies once when any `cancelled` count for a `customer_id` reaches 2.
- [ ] No operator/client engagement email; no client push; `appointment-reminders-24h` unchanged; no `pg_cron`.
- [ ] Cron without the unique key cannot double-insert; latest enqueue allowlist and `OPERATOR_WEB_PUSH_EVENT_TYPES` stay aligned.
- [ ] Historical create-outbox 3-type contract remains; new tests cover the latest enqueue function.
- [ ] Non-goals above are absent from the diff.
- [ ] Scoped contract tests (SQL/Deno/dashboard allowlist) green; `pnpm run check` or the scoped equivalent before asking to merge.

## Delivery

- Strategy: `ask-on-risk`.
- Review budget: 400 changed lines.
- Intended slices: (1) ops 1–4 → (2) onboarding 5–8 including copy-link persistence → (3) retention 9–11.
- Packed PR: **High** 400-line risk. Pause at tasks for a human delivery decision. Do not invent `chain_strategy` or `size:exception`.

## References

- Exploration: `openspec/changes/operator-lifecycle-pushes/exploration.md`
- Pre-proposal: `openspec/changes/operator-lifecycle-pushes/preproposal.md` (`DEFAULTS`)
- Product: `infra/context/product.md` (turnos-first; marketing automation is a non-goal)
- Doctrine: `openspec/changes/archive/2026-08-12-release-1-0-1/` — durable dashboard notify; no ordinary owner booking email (`envio-email-outbox`, `notificaciones-durables-dashboard`)
- Scheduler pattern: `.github/workflows/release-expired-booking-holds.yml`
- Push allowlist: `supabase/functions/_shared/process-web-push-outbox.ts`, latest `enqueue_web_push_outbox` migration
