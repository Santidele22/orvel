# Tasks: operator-lifecycle-pushes

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Slice 1 (ops) ~850–1250; Slice 2 (onboarding) ~320–500; Slice 3 (retention) ~250–420; packed ~1420–2170 |
| 400-line budget risk | High (packed); High (slice 1 alone); Medium–High (slice 2); Medium (slice 3) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (ops 1–4) → PR 2 (onboarding 5–8) → PR 3 (retention 9–11). Slice 1 itself may still exceed 400; do not further invent a chain. |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (Santi). Tracker feat/operator-lifecycle-pushes to origin/dev. Slice 1 still High. |

```text
Decision needed before apply: No (slice 1 size:exception accepted; slices 2-3 still chained)
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High (slice 1)
```

**Delivery locked:** feature-branch-chain. Slice 1 apply may proceed with explicit size:exception (Santi). Slices 2-3 remain chained without exception.

### Per-slice forecast

| Slice | Events | Est. authored lines | 400-line risk | Notes |
|-------|--------|---------------------|---------------|-------|
| 1 Ops | `#1`–`#4` + plumbing | ~850–1250 | High | Unique key + eleven-string allowlist + inbox union + RPC 1–4 + Edge + workflow |
| 2 Onboarding | `#5`–`#8` | ~320–500 | Medium–High | Once-flags, day-N RPC, copy-link helper |
| 3 Retention | `#9`–`#11` | ~250–420 | Medium | Triggers `#9`/`#11` + gap `#10` `LIVE_REARM` |
| Packed | 1+2+3 | ~1420–2170 | High | Pause for human delivery decision |

### Suggested work units

| Unit | Slice | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|-------|------|----------------------|-----------------|-------------------|
| 1a | 1 | Unique idempotency + `_insert_operator_lifecycle_notification` | `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | N/A — no live DB in contract tests | Drop helper + unique index (additive). Do not migration-repair without Santi. |
| 1b | 1 | Latest enqueue + TS allowlist (all 11) + inbox union + nullable `appointmentId` | `deno test --config supabase/functions/deno.json supabase/functions/_shared/process-web-push-outbox.contract.test.ts` and `pnpm --dir apps/dashboard run test -- src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts` | N/A — e2e out of scope | Revert latest `enqueue_web_push_outbox` replace, `OPERATOR_WEB_PUSH_EVENT_TYPES`, inbox types. Keep create-outbox migration. |
| 1c | 1 | RPC branches 1–4 + Edge `operator-lifecycle-pushes` + `*/15` workflow | `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | N/A until per-env `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` + `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET` + function `CRON_KEY` exist | Disable workflow / stop POSTing. Unique index + unused RPC may remain. Do not enable workflow before 1a is migrated. |
| 2 | 2 | Day-N once-flags + copy-link RPC/helper | `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` and `pnpm --dir apps/dashboard run test -- src/app/core/booking/mark-booking-link-copied.contract.spec.ts src/app/features/dashboard-home/pages/dashboard-home-page-mobile-gating.contract.spec.ts src/app/features/pwa-install` | N/A — clipboard is unit/contract | Stop calling `mark_booking_link_copied`; revert helper + home/settings wiring. Inbox rows already sent stay. |
| 3 | 3 | Instant `#9`/`#11` + clock `#10` re-arm | `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` | N/A — triggers work after migrate even without cron secrets | Drop/no-op `#9`/`#11` triggers; `#10` branch no-op. Re-arm columns stay inert. |

Do not start a later slice’s production SQL until that slice’s RED contracts fail for the missing behavior.

## Locked catalog (spec wins)

Apply MUST use these `event_type` strings from `openspec/changes/operator-lifecycle-pushes/specs/` (not the shorter design aliases `ops.*` / `onboarding.zero_public` / `retention.first_public`).

| # | Kind | `event_type` | Slice inserts? |
|---|------|--------------|----------------|
| 1 | Clocked | `lifecycle.briefing` | 1 |
| 2 | Clocked | `lifecycle.first_turno_soon` | 1 |
| 3 | Clocked | `lifecycle.empty_agenda` | 1 |
| 4 | Clocked | `lifecycle.stale_deposit_claim` | 1 |
| 5 | Clocked | `onboarding.no_services` | 2 |
| 6 | Clocked | `onboarding.no_hours` | 2 |
| 7 | Clocked | `onboarding.copy_link` | 2 |
| 8 | Clocked | `onboarding.share_day7` | 2 |
| 9 | Instant | `retention.first_public_booking` | 3 |
| 10 | Clocked | `retention.public_gap_7d` | 3 |
| 11 | Instant | `retention.customer_cancelled_twice` | 3 |

`deposit.claimed` stays inbox-only (not on the push allowlist). Click URL for all eleven is `/dashboard/turnos`. Briefing local window is `[08:30, 08:45)` Monday–Friday (clock spec). Body copy is the operational Spanish in `design.md`, keyed by the spec strings above.

Out of scope for every unit: engagement email, client push, `pg_cron`, `appointment-reminders-24h`, rewrite of `20260824231000_create_web_push_outbox.sql`, landing, copy-link in slice 1.

---

## Slice 1 — Ops (events 1–4)

Highest operational value. Proves the clock. Names all eleven allowlist strings. Inserts only `#1`–`#4`. No `booking_link_copied_at` instrumentation.

### 1. Unique idempotency helper

- [x] 1.1 RED: create `supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` that scans the newest `supabase/migrations/*_operator_lifecycle_ops.sql` for `dashboard_notifications_lifecycle_idempotency_uidx` on `(business_id, event_type, (metadata->>'idempotency_key'))` with `WHERE coalesce(metadata->>'idempotency_key', '') <> ''`; helper `_insert_operator_lifecycle_notification` catching `unique_violation`; no GRANT of the helper to `anon`/`authenticated`. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts`. <!-- sdd-owner: implementation -->
- [x] 1.2 GREEN: add `supabase/migrations/<ts>_operator_lifecycle_ops.sql` with that unique index and helper (merge `idempotency_key` into metadata; return boolean). Do not enable a workflow in this unit. <!-- sdd-owner: implementation -->
- [x] 1.3 TRIANGULATE: overlapping insert of the same `(business_id, event_type, key)` leaves one row (static assertion of `unique_violation` handler, not `WHERE NOT EXISTS` alone). Run the Deno command in 1.1. <!-- sdd-owner: implementation -->
- [x] 1.4 REFACTOR: keep helper `SECURITY DEFINER` + `search_path` consistent with sibling notify helpers; no extra metadata columns. <!-- sdd-owner: implementation -->

Rollback 1: drop helper + unique index only. Inbox rows without the key stay valid.

### 2. Allowlist eleven + inbox union

- [x] 2.1 RED: add `apps/dashboard/src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts` that reads the **latest** `enqueue_web_push_outbox` body (new ops migration or later replace — not `*_create_web_push_outbox.sql`) and asserts the eleven spec strings plus existing `appointment.created|cancelled|rescheduled|reminder`; asserts `deposit.claimed` and `system.welcome` absent. Keep `apps/dashboard/src/app/tests/unit/operator-web-push-send.red.contract.spec.ts` locking create-outbox to the original three appointment types. Run `pnpm --dir apps/dashboard run test -- src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/tests/unit/operator-web-push-send.red.contract.spec.ts`. <!-- sdd-owner: implementation -->
- [x] 2.2 RED: extend `supabase/functions/_shared/process-web-push-outbox.contract.test.ts` so `isOperatorWebPushEventType` is true for the eleven spec strings and false for `deposit.claimed` / `system.welcome`; `buildOperatorWebPushPayload` `url` stays `/dashboard/turnos`. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/process-web-push-outbox.contract.test.ts`. <!-- sdd-owner: implementation -->
- [x] 2.3 RED: add `apps/dashboard/src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts` locking `DashboardNotificationEventType` in `apps/dashboard/src/app/core/notifications/internal-dashboard-notifications.api.ts` to appointment types + the eleven spec strings (not `deposit.claimed` on the union if it is not there today — listing still uses stored title/body); `appointmentId: string | null`. Extend `apps/dashboard/src/app/core/notifications/dashboard-notifications-once.contract.spec.ts` fixtures to allow null `appointmentId`. Run `pnpm --dir apps/dashboard run test -- src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts`. <!-- sdd-owner: implementation -->
- [x] 2.4 GREEN: `CREATE OR REPLACE` `enqueue_web_push_outbox` in the slice-1 migration (keep `EXCEPTION WHEN OTHERS THEN RETURN NEW`); add the eleven strings to `supabase/functions/_shared/process-web-push-outbox.ts` `OPERATOR_WEB_PUSH_EVENT_TYPES`; widen the inbox union and `appointmentId` in `internal-dashboard-notifications.api.ts`. Do not edit `supabase/migrations/20260824231000_create_web_push_outbox.sql`. <!-- sdd-owner: implementation -->
- [x] 2.5 TRIANGULATE: historical create-outbox contract still green; `deposit.claimed` still not in latest enqueue or TS allowlist; fail-open `EXCEPTION` remains. Run 2.1 + 2.2 dashboard/Deno commands. <!-- sdd-owner: implementation -->
- [x] 2.6 REFACTOR: one allowlist source of truth per layer (SQL IN-list, TS const). No processor auth change (`service_role` / `verify_jwt = true` on `process-web-push-outbox`). <!-- sdd-owner: implementation -->

Rollback 2: revert latest enqueue replace, TS allowlist, inbox types. Appointment push types stay.

### 3. Clock RPC 1–4 + Edge Function + workflow

- [x] 3.1 RED: extend `operator-lifecycle-pushes-static-contract.test.ts` for `enqueue_operator_lifecycle_pushes()`: `RETURNS integer`; GRANT `service_role` only (REVOKE PUBLIC/anon/authenticated); skip `businesses.account_closed_at IS NOT NULL`; timezone `COALESCE(businesses.timezone, 'America/Argentina/Buenos_Aires')`; no `pg_cron`; no `enqueue_appointment_reminders_24h`; no email-outbox insert; RPC body inserts only the four ops types (`lifecycle.briefing`, `lifecycle.first_turno_soon`, `lifecycle.empty_agenda`, `lifecycle.stale_deposit_claim`) even though allowlist names eleven. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts`. <!-- sdd-owner: implementation -->
- [x] 3.2 RED: same static file — clone `supabase/functions/_shared/release-expired-booking-holds-static-contract.test.ts` (read-only) for `supabase/functions/operator-lifecycle-pushes/index.ts` + `supabase/config.toml` + `.github/workflows/operator-lifecycle-pushes.yml`: missing/bad `CRON_KEY` → 401 **before** `rpc(`; `verify_jwt = false`; no `isPrivilegedWebPushAuthorization`; cadence `*/15 * * * *` + `workflow_dispatch`; secrets `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` / `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET`; missing secrets `exit 1`; curl `--output /dev/null`; Bearer is cron secret name not `SERVICE_ROLE`; function gate reads `CRON_KEY` only; JSON errors `UNAUTHORIZED` / `SERVER_CONFIGURATION_ERROR` / `OPERATOR_LIFECYCLE_PUSHES_FAILED`; response has no `service_role` / key material. Run the Deno command in 3.1. <!-- sdd-owner: implementation -->
- [x] 3.3 RED: static SQL predicates for ops: `#1` Mon–Fri local `[08:30, 08:45)`, idempotency `{local_date}`, `appointment_id` null, title `Resumen de hoy`; `#2` day’s first remaining `booked`/`confirmed` by `starts_at` in `[now()+60m, now()+90m]`, once per local date, `appointment_id` that booking; `#3` remaining today = 0 and yesterday’s local day had ≥1 `booked`/`confirmed` (rows that started yesterday, any current status), `{local_date}`, `appointment_id` null; `#4` `deposit_status = 'claim_pending'` and `now() >= deposit_claimed_at + 15 minutes`, key `booking:{id}`, not the 30-minute unpaid hold, not `deposit.claimed`. Run the Deno command in 3.1. <!-- sdd-owner: implementation -->
- [x] 3.4 GREEN: implement RPC branches 1–4 in `supabase/migrations/<ts>_operator_lifecycle_ops.sql` via `_insert_operator_lifecycle_notification`. Copy must stay operational (no digest/newsletter). Public booking URL must not be the click target. <!-- sdd-owner: implementation -->
- [x] 3.5 GREEN: add `supabase/functions/operator-lifecycle-pushes/index.ts` (clone `supabase/functions/release-expired-booking-holds/index.ts`, RPC `enqueue_operator_lifecycle_pushes` with no params); `[functions.operator-lifecycle-pushes] verify_jwt = false` plus CRON_KEY comment in `supabase/config.toml`; `.github/workflows/operator-lifecycle-pushes.yml` cloned from `.github/workflows/release-expired-booking-holds.yml` with `*/15 * * * *`. Comment that SQL unique index must be migrated before the workflow is enabled; secrets are an env gate. <!-- sdd-owner: implementation -->
- [x] 3.6 TRIANGULATE: weekend / off-window briefing no-op; later remaining turno in 60–90 must not fire `#2` if the first remaining is outside; empty today after empty yesterday no-op; resolved claim / unpaid hold no-op for `#4`; slice-1 diff does not call `mark_booking_link_copied` or write `booking_link_copied_at` from `apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.ts` or `apps/dashboard/src/app/features/settings/pages/configuracion.page.ts`; `apps/dashboard/src/orvel-push-sw.js` and `supabase/functions/appointment-reminders-24h/` unchanged. Run 3.1 Deno command. <!-- sdd-owner: implementation -->
- [x] 3.7 REFACTOR: Edge Function remains an auth shell (clock math stays in SQL). Do not accept `service_role` as the caller secret. <!-- sdd-owner: implementation -->

Rollback 3: disable `.github/workflows/operator-lifecycle-pushes.yml`. Unique index + RPC may remain. Revert allowlist only if new types must not push.

---

## Slice 2 — Onboarding (events 5–8)

Depends on slice 1 helper + clock RPC + allowlist. Day-N = local date of `businesses.created_at` as day 1 (catch-up allowed if predicate + once-flag still hold). Do not revive `public.users.last_login_at`.

- [x] 4.1 RED: extend `operator-lifecycle-pushes-static-contract.test.ts` for `supabase/migrations/<ts>_operator_lifecycle_onboarding.sql`: `business_settings` timestamptz null columns `booking_link_copied_at`, `onboarding_no_services_notified_at`, `onboarding_no_hours_notified_at`, `onboarding_copy_link_notified_at`, `onboarding_share_day7_notified_at`; RPC branches 5–8 insert those four types with idempotency `once`; `#5` zero `services.is_active`, catch-up day ≥ 1; `#6` `HOURS_ALL_CLOSED` = Monday–Friday each have no enabled interval (`(value->>'enabled') = 'true'`), default weekday 09–18 JSON must not match, ignore `professional_hours`; `#7` slug + ≥1 active service + ≥1 enabled day with interval + `booking_link_copied_at` IS NULL, body MAY contain `https://orvel.pro/booking/{slug}` but click stays Turnos; `#8` zero `source = 'client-self-service'` ever (include cancelled); day-N from `businesses.created_at` only. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts`. <!-- sdd-owner: implementation -->
- [x] 4.2 RED: same static file — `mark_booking_link_copied(p_business_id uuid)` `SECURITY DEFINER`, `can_manage_business`, GRANT `authenticated`, set-if-null `booking_link_copied_at = now()`, returns timestamptz; no client `UPDATE` of other `business_settings` columns. Run the Deno command in 4.1. <!-- sdd-owner: implementation -->
- [x] 4.3 GREEN: additive onboarding migration: columns, RPC branches 5–8 (set matching once-flag after successful insert), `mark_booking_link_copied`. Titles/bodies from design mapped to spec types (`Faltan servicios`, `Faltan horarios`, `Compartí tu link`, `Sin reservas públicas`). <!-- sdd-owner: implementation -->
- [x] 4.4 RED: add `apps/dashboard/src/app/core/booking/mark-booking-link-copied.contract.spec.ts` — helper `apps/dashboard/src/app/core/booking/mark-booking-link-copied.ts` is invoked from `copyBookingUrl()` in `dashboard-home.page.ts` and `configuracion.page.ts` after successful `clipboard.writeText` of `buildPublicBookingUrl(slug)`; `copyProfessionalBookingUrl` and `apps/dashboard/src/app/features/pwa-install/pages/pwa-install.page.ts` `copyInstallLink` must not reference `mark_booking_link_copied`. Run `pnpm --dir apps/dashboard run test -- src/app/core/booking/mark-booking-link-copied.contract.spec.ts`. <!-- sdd-owner: implementation -->
- [x] 4.5 GREEN: implement the helper (RPC once after successful writeText) and wire only the two `copyBookingUrl()` methods. Do not store the public URL as a column. <!-- sdd-owner: implementation -->
- [x] 4.6 TRIANGULATE: default 09–18 does not fire `#6`; PWA install copy of `window.location.href` does not set the flag; already-copied `#7` no-op; cancelled public row blocks `#8`; no `last_login_at`. Run 4.1 Deno + 4.4 Vitest commands. <!-- sdd-owner: implementation -->
- [x] 4.7 REFACTOR: one shared helper next to `apps/dashboard/src/app/core/booking/public-booking-url.ts`; pages keep clipboard UX (copied/failed flags). <!-- sdd-owner: implementation -->

Rollback 4: revert helper + page wiring + onboarding migration usage. Sent onboarding inbox rows stay.

---

## Slice 3 — Retention (events 9–11)

Depends on slice 1 helper + allowlist. Triggers work without cron secrets. `#10` uses the clock RPC.

- [ ] 5.1 RED: extend `operator-lifecycle-pushes-static-contract.test.ts` for `supabase/migrations/<ts>_operator_lifecycle_retention.sql`: columns `retention_first_public_notified_at`, `retention_gap7_notified_at`; `#9` `AFTER INSERT` on `bookings` when `source = 'client-self-service'` and count including `NEW` = 1, type `retention.first_public_booking`, key `booking:{id}`, `appointment_id` = booking, not waiting on cron; later public inserts no-op via once-flag + unique key; cancelled first public still counts. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts`. <!-- sdd-owner: implementation -->
- [ ] 5.2 RED: same file — `#11` trigger on insert/update to `cancelled`, `customer_id` not null, count of `cancelled` for that customer in the business reaches 2, type `retention.customer_cancelled_twice`, key `customer:{id}:cancel-2`, no cancel-actor column; third cancel no-op. Run the Deno command in 5.1. <!-- sdd-owner: implementation -->
- [ ] 5.3 RED: same file — RPC branch `#10` `retention.public_gap_7d`: live = ≥1 `client-self-service` ever **and** `public_turnero_disabled_at IS NULL` (same gates as `_assert_business_accepts_public_bookings` without calling that function); last public `created_at` older than 7 days; re-arm `retention_gap7_notified_at IS NULL OR retention_gap7_notified_at < last_public.created_at`; after insert set `retention_gap7_notified_at = now()`; idempotency `booking:{last_public_id}` so a new cycle can insert; zero-public businesses must not use this type (`onboarding.share_day7` remains the zero-public signal). Run the Deno command in 5.1. <!-- sdd-owner: implementation -->
- [ ] 5.4 GREEN: additive retention migration: flags, `#9`/`#11` `SECURITY DEFINER` triggers calling the helper, RPC branch `#10`. Copy: `Primera reserva pública`, `7 días sin reservas públicas`, `Mismo cliente canceló dos veces`. <!-- sdd-owner: implementation -->
- [ ] 5.5 TRIANGULATE: disabled public turnero does not raise via `_assert_business_accepts_public_bookings`; two operator cancels still notify once; clock RPC still must not insert `#9`/`#11`; no `last_seen` / `last_login_at`. Run the Deno command in 5.1. <!-- sdd-owner: implementation -->
- [ ] 5.6 REFACTOR: triggers stay fail-open relative to push enqueue (existing `trg_enqueue_web_push_outbox`); do not grant triggers/helper to `anon`/`authenticated`. <!-- sdd-owner: implementation -->

Rollback 5: drop/no-op `#9`/`#11` triggers; `#10` branch no-op. Re-arm columns stay inert.

---

## Cross-slice verification (after the chosen delivery slice)

Not a fourth product slice. Run only on the slices Santi authorizes after the ask-on-risk decision.

- [ ] 6.1 Scoped green: Deno static + processor contracts above, plus `pnpm --dir apps/dashboard run test -- src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/tests/unit/operator-web-push-send.red.contract.spec.ts src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts` and slice-2 helper specs if that slice shipped. Then `pnpm run check` or the scoped equivalent before asking to merge. <!-- sdd-owner: implementation -->
- [x] 6.2 Diff hygiene: no `appointment-reminders-24h` edits, no `process-email-outbox` drain for these events, no `pg_cron`, no create-outbox rewrite, no client push, no extra click URLs, no copy-link writes in a slice-1-only diff. <!-- sdd-owner: implementation -->
