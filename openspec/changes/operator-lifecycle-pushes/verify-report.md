```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:614f7842262f3dce0fbf09071c126e58aba15feccce4e4ef7d9f73d28fe84373
verdict: fail
blockers: 1
critical_findings: 1
requirements: 20/20
scenarios: 47/47
test_command: deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts && deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/process-web-push-outbox.contract.test.ts && pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts src/app/tests/unit/operator-web-push-send.red.contract.spec.ts
test_exit_code: 0
test_output_hash: sha256:fe2635d9df672694a61617bcfa45667dedfd7eec55259470d7d029f5659ad568
build_command: pnpm run build
build_exit_code: 1
build_output_hash: sha256:852d005c82c1e9100f851395cb9167e55f977df0c308a88e0ae8725d256dac50
```

# Verify report: operator-lifecycle-pushes (slice 1 only)

**Status:** `fail` — independent `pnpm run build` evidence is missing, so a passing verdict cannot be admitted. Slice 1 focused contracts are GREEN. Archive is **not** ready.

Full `pnpm run build` / `pnpm run check` (task 6.1) were **not** executed in this verify, per slice-1-only focused commands. Onboarding and retention specs are **deferred**, not failed.

## Pass / fail

- Slice 1 implementation, TDD evidence, and focused tests: GREEN (not sufficient for admitted `pass` without build evidence)
- Remaining slices 2–3 and cross-slice 6.1: **remaining scope** (archive not ready)
- Full build command: **not run** (`build_exit_code: 1`, output hash is the skipped-build marker `BUILD_SKIPPED\n`)

## Spec coverage (slice 1 totals = 20 requirements / 47 scenarios)

Counts are from the four slice-1 specs only.

| Capability | Requirements | Scenarios | Slice 1 |
|------------|--------------|-----------|---------|
| `operator-lifecycle-clock` | 6 | 13 | complete |
| `operator-ops-pushes` | 5 | 15 | complete |
| `operator-web-push-allowlist` | 5 | 10 | complete |
| `dashboard-notifications-inbox` | 4 | 9 | complete |

Deferred (not in envelope totals, not failed):

- `operator-onboarding-pushes` (events 5–8)
- `operator-retention-pushes` (events 9–11)

Clock requirement text that the RPC “MUST consider” `#1`–`#8` and `#10` is satisfied for slice 1 by inserting only `#1`–`#4`; later clocked types remain deferred.

Checked against implementation:

- Spec `event_type` strings: `lifecycle.briefing`, `lifecycle.first_turno_soon`, `lifecycle.empty_agenda`, `lifecycle.stale_deposit_claim` (RPC inserts); all eleven named on SQL/TS allowlists
- Unique idempotency: `dashboard_notifications_lifecycle_idempotency_uidx` + helper `unique_violation` (not `WHERE NOT EXISTS` alone)
- Edge Function authenticates `CRON_KEY` / `x-cron-key` / Bearer **before** `rpc(`; `verify_jwt = false`; JSON `UNAUTHORIZED` / `SERVER_CONFIGURATION_ERROR` / `OPERATOR_LIFECYCLE_PUSHES_FAILED`
- No `pg_cron`; no `appointment-reminders-24h` edits; no create-outbox rewrite
- `deposit.claimed` not allowlisted; `lifecycle.stale_deposit_claim` is the distinct push type
- Click URL `/dashboard/turnos` on processor payload
- No copy-link instrumentation in slice 1 (`mark_booking_link_copied` / `booking_link_copied_at` not in home/settings)
- Workflow cadence `*/15 * * * *` + `workflow_dispatch`; secrets `OPERATOR_LIFECYCLE_PUSHES_FUNCTION_URL` / `OPERATOR_LIFECYCLE_PUSHES_CRON_SECRET`; Bearer is cron secret, not `SERVICE_ROLE`
- RPC inserts only the four ops types

## Task completion

Slice 1 implementation tasks **1.1–1.4, 2.1–2.6, 3.1–3.7, 6.2** are checked `- [x]`.

No unchecked **slice-1** implementation tasks remain.

Unchecked implementation tasks (remaining scope; archive not ready):

- [ ] 4.1 RED: extend `operator-lifecycle-pushes-static-contract.test.ts` for `supabase/migrations/<ts>_operator_lifecycle_onboarding.sql`: `business_settings` timestamptz null columns `booking_link_copied_at`, `onboarding_no_services_notified_at`, `onboarding_no_hours_notified_at`, `onboarding_copy_link_notified_at`, `onboarding_share_day7_notified_at`; RPC branches 5–8 insert those four types with idempotency `once`; `#5` zero `services.is_active`, catch-up day ≥ 1; `#6` `HOURS_ALL_CLOSED` = Monday–Friday each have no enabled interval (`(value->>'enabled') = 'true'`), default weekday 09–18 JSON must not match, ignore `professional_hours`; `#7` slug + ≥1 active service + ≥1 enabled day with interval + `booking_link_copied_at` IS NULL, body MAY contain `https://orvel.pro/booking/{slug}` but click stays Turnos; `#8` zero `source = 'client-self-service'` ever (include cancelled); day-N from `businesses.created_at` only. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts`.
- [ ] 4.2 RED: same static file — `mark_booking_link_copied(p_business_id uuid)` `SECURITY DEFINER`, `can_manage_business`, GRANT `authenticated`, set-if-null `booking_link_copied_at = now()`, returns timestamptz; no client `UPDATE` of other `business_settings` columns. Run the Deno command in 4.1.
- [ ] 4.3 GREEN: additive onboarding migration: columns, RPC branches 5–8 (set matching once-flag after successful insert), `mark_booking_link_copied`. Titles/bodies from design mapped to spec types (`Faltan servicios`, `Faltan horarios`, `Compartí tu link`, `Sin reservas públicas`).
- [ ] 4.4 RED: add `apps/dashboard/src/app/core/booking/mark-booking-link-copied.contract.spec.ts` — helper `apps/dashboard/src/app/core/booking/mark-booking-link-copied.ts` is invoked from `copyBookingUrl()` in `dashboard-home.page.ts` and `configuracion.page.ts` after successful `clipboard.writeText` of `buildPublicBookingUrl(slug)`; `copyProfessionalBookingUrl` and `apps/dashboard/src/app/features/pwa-install/pages/pwa-install.page.ts` `copyInstallLink` must not reference `mark_booking_link_copied`. Run `pnpm --dir apps/dashboard run test -- src/app/core/booking/mark-booking-link-copied.contract.spec.ts`.
- [ ] 4.5 GREEN: implement the helper (RPC once after successful writeText) and wire only the two `copyBookingUrl()` methods. Do not store the public URL as a column.
- [ ] 4.6 TRIANGULATE: default 09–18 does not fire `#6`; PWA install copy of `window.location.href` does not set the flag; already-copied `#7` no-op; cancelled public row blocks `#8`; no `last_login_at`. Run 4.1 Deno + 4.4 Vitest commands.
- [ ] 4.7 REFACTOR: one shared helper next to `apps/dashboard/src/app/core/booking/public-booking-url.ts`; pages keep clipboard UX (copied/failed flags).
- [ ] 5.1 RED: extend `operator-lifecycle-pushes-static-contract.test.ts` for `supabase/migrations/<ts>_operator_lifecycle_retention.sql`: columns `retention_first_public_notified_at`, `retention_gap7_notified_at`; `#9` `AFTER INSERT` on `bookings` when `source = 'client-self-service'` and count including `NEW` = 1, type `retention.first_public_booking`, key `booking:{id}`, `appointment_id` = booking, not waiting on cron; later public inserts no-op via once-flag + unique key; cancelled first public still counts. Run `deno test --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts`.
- [ ] 5.2 RED: same file — `#11` trigger on insert/update to `cancelled`, `customer_id` not null, count of `cancelled` for that customer in the business reaches 2, type `retention.customer_cancelled_twice`, key `customer:{id}:cancel-2`, no cancel-actor column; third cancel no-op. Run the Deno command in 5.1.
- [ ] 5.3 RED: same file — RPC branch `#10` `retention.public_gap_7d`: live = ≥1 `client-self-service` ever **and** `public_turnero_disabled_at IS NULL` (same gates as `_assert_business_accepts_public_bookings` without calling that function); last public `created_at` older than 7 days; re-arm `retention_gap7_notified_at IS NULL OR retention_gap7_notified_at < last_public.created_at`; after insert set `retention_gap7_notified_at = now()`; idempotency `booking:{last_public_id}` so a new cycle can insert; zero-public businesses must not use this type (`onboarding.share_day7` remains the zero-public signal). Run the Deno command in 5.1.
- [ ] 5.4 GREEN: additive retention migration: flags, `#9`/`#11` `SECURITY DEFINER` triggers calling the helper, RPC branch `#10`. Copy: `Primera reserva pública`, `7 días sin reservas públicas`, `Mismo cliente canceló dos veces`.
- [ ] 5.5 TRIANGULATE: disabled public turnero does not raise via `_assert_business_accepts_public_bookings`; two operator cancels still notify once; clock RPC still must not insert `#9`/`#11`; no `last_seen` / `last_login_at`. Run the Deno command in 5.1.
- [ ] 5.6 REFACTOR: triggers stay fail-open relative to push enqueue (existing `trg_enqueue_web_push_outbox`); do not grant triggers/helper to `anon`/`authenticated`.
- [ ] 6.1 Scoped green: Deno static + processor contracts above, plus `pnpm --dir apps/dashboard run test -- src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/tests/unit/operator-web-push-send.red.contract.spec.ts src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts` and slice-2 helper specs if that slice shipped. Then `pnpm run check` or the scoped equivalent before asking to merge.

## Structured status and actionContext

- Native status JSON had `changeName: null` and `verify: blocked` due to ambiguous selection among four active changes.
- Parent/user resolved selection to `operator-lifecycle-pushes` slice 1; `actionContext.mode: repo-local`; workspace `C:/Users/usuario/proyectos/orvel`; allowed edit root for this verify: `openspec/changes/operator-lifecycle-pushes` (write `verify-report.md` only).
- `applyState` from apply-progress: slice 1 complete; slices 2–3 not started; no commit; no push.
- Strict TDD active (`openspec/config.yaml` `strict_tdd: true`).
- Delivery: `ask-on-risk` / `feature-branch-chain` tracker `feat/operator-lifecycle-pushes` → `origin/dev`.
- `size:exception` for slice 1 is explicitly recorded in `tasks.md` and `apply-progress.md`.

## Test / validation commands

All focused commands re-run in this verify (Deno found at `/c/Users/usuario/.deno/bin/deno` after PATH fix).

1. `deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/operator-lifecycle-pushes-static-contract.test.ts` — exit 0 — 7 passed / 0 failed
2. `deno test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/process-web-push-outbox.contract.test.ts` — exit 0 — 12 passed / 0 failed
3. `pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/operator-lifecycle-enqueue-allowlist.contract.spec.ts src/app/core/notifications/dashboard-lifecycle-inbox.contract.spec.ts src/app/core/notifications/dashboard-notifications-once.contract.spec.ts src/app/tests/unit/operator-web-push-send.red.contract.spec.ts` — exit 0 — 20 passed / 0 failed (4 files)

Concatenated focused output hash: `sha256:fe2635d9df672694a61617bcfa45667dedfd7eec55259470d7d029f5659ad568`.

Not run: `pnpm run check` (task 6.1), `pnpm run build` (config verify build_command). Runtime harness N/A until per-env function URL, cron secret, and `CRON_KEY` exist.

## Strict TDD compliance

- `apply-progress.md` contains a `TDD Cycle Evidence` table covering 1.1–3.7 and 6.2.
- Reported test files exist: `operator-lifecycle-pushes-static-contract.test.ts`, `process-web-push-outbox.contract.test.ts`, `operator-lifecycle-enqueue-allowlist.contract.spec.ts`, `dashboard-lifecycle-inbox.contract.spec.ts`, `dashboard-notifications-once.contract.spec.ts`, `operator-web-push-send.red.contract.spec.ts`.
- Focused tests re-run GREEN.
- TDD evidence is present and complete for slice 1 (not CRITICAL).

## Assertion quality

- Static Deno tests scan migration/function/workflow source for unique index, `unique_violation`, GRANT/REVOKE, four ops insert types, briefing `[08:30, 08:45)`, 60–90 first remaining, claim 15m, `*/15`, CRON_KEY-before-rpc — not tautologies.
- Vitest allowlist reads **latest** `enqueue_web_push_outbox` body, not create-outbox; historical red contract still locks three appointment types.
- Inbox contract asserts the eleven spec strings on the TypeScript union and nullable `appointmentId`; once-contract keeps a null `appointmentId` fixture in the list.
- Processor contract asserts eleven types true, `deposit.claimed` false, payload `url` `/dashboard/turnos`.
- No ghost loops, type-only-only suites, or CSS implementation-detail assertions in the slice-1 tests.

## Review workload / PR boundary

- Chain strategy `feature-branch-chain` matches returned boundary (slice 1 ops 1–4 + plumbing only).
- `size:exception` for slice 1 is explicitly recorded; slices 2–3 remain chained without exception.
- No scope creep into onboarding/retention implementation files.
- Authored slice-1 size still High vs 400-line budget; exception already accepted.

## Warnings (non-blocking)

1. Archive must not proceed while 4.x / 5.x / 6.1 remain unchecked.
2. Full build/`pnpm run check` not executed in this verify.
3. Empty-agenda yesterday count in SQL is all rows that started yesterday (any current status), matching task 3.3 parenthetical; ops spec wording says booked/confirmed.
4. Clock stays silent until secrets/`CRON_KEY` are provisioned per environment.
5. First PATH-less `deno` invocation failed (`command not found`); subsequent runs with `~/.deno/bin` succeeded.

## Exact blockers

1. CRITICAL: independent build execution evidence missing — `pnpm run build` was not run in this verify (`build_exit_code: 1`, skipped-build marker hash). A passing envelope cannot be admitted.

Archive is not ready while 4.x / 5.x / 6.1 remain unchecked (remaining scope, not additional envelope blockers).
