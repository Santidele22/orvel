# Operator Lifecycle Clock Specification

## Purpose

Provide a privileged, timezone-aware clock that evaluates **clocked** operator lifecycle events and inserts idempotent `dashboard_notifications` rows. Instant retention events are out of this domain. This clock is operational plumbing, not a marketing scheduler.

Locked `event_type` strings (dot-namespaced like `appointment.created`):

| Catalog # | Kind | `event_type` |
|---|---|---|
| 1 | Clocked | `lifecycle.briefing` |
| 2 | Clocked | `lifecycle.first_turno_soon` |
| 3 | Clocked | `lifecycle.empty_agenda` |
| 4 | Clocked | `lifecycle.stale_deposit_claim` |
| 5 | Clocked | `onboarding.no_services` |
| 6 | Clocked | `onboarding.no_hours` |
| 7 | Clocked | `onboarding.copy_link` |
| 8 | Clocked | `onboarding.share_day7` |
| 9 | Instant (not this clock) | `retention.first_public_booking` |
| 10 | Clocked | `retention.public_gap_7d` |
| 11 | Instant (not this clock) | `retention.customer_cancelled_twice` |

These eleven strings are stable. This change SHALL NOT invent additional lifecycle `event_type` values.

## Requirements

### Requirement: Privileged Clock RPC And Edge Function

The system MUST expose a privileged RPC that fans out clocked catalog events `#1`–`#8` and `#10`. An Edge Function named `operator-lifecycle-pushes` MUST invoke that RPC. The function MUST set `verify_jwt = false` and MUST authenticate with the same `CRON_KEY` family as `release-expired-booking-holds` (`CRON_KEY` / `x-cron-key` / Bearer). Processor auth for `process-web-push-outbox` MUST remain `service_role` and MUST NOT switch to `CRON_KEY`.

#### Scenario: Authorized cron tick evaluates clocked events

- GIVEN a deployed `operator-lifecycle-pushes` function and a valid cron secret
- WHEN an authorized caller POSTs the function
- THEN the function MUST invoke the privileged clock RPC
- AND the RPC MUST consider clocked events `#1`–`#8` and `#10` for businesses that match each event’s window or once-flag
- AND the RPC MUST NOT be required to insert `retention.first_public_booking` or `retention.customer_cancelled_twice`

#### Scenario: Unauthorized caller is rejected

- GIVEN the Edge Function is reachable
- WHEN a caller POSTs without a valid `CRON_KEY` / `x-cron-key` / Bearer secret
- THEN the function MUST NOT invoke the clock RPC
- AND no new lifecycle `dashboard_notifications` rows MUST be inserted from that request

### Requirement: Fifteen-Minute GitHub Cron

Clocked evaluation MUST be invoked by a checked-in GitHub workflow on cadence `*/15 * * * *`, cloned from the `release-expired-booking-holds` family. The system SHALL NOT use `pg_cron` for this catalog. The system SHALL NOT extend `appointment-reminders-24h` or `enqueue_appointment_reminders_24h`.

#### Scenario: Frequent tick can hit in-window events

- GIVEN the workflow is enabled in an environment that has the function URL and cron secret
- WHEN fifteen minutes elapse
- THEN GitHub MUST POST `operator-lifecycle-pushes`
- AND events whose windows are shorter than a day (`lifecycle.first_turno_soon`, `lifecycle.stale_deposit_claim`) MUST be eligible on that tick

#### Scenario: Missing secrets leave clocked events silent

- GIVEN an environment lacks the function URL or cron secret
- WHEN the workflow cannot POST
- THEN clocked inserts MUST NOT occur in that environment
- AND instant catalog events `#9` and `#11` MUST still be allowed to fire once their triggers are migrated

#### Scenario: pg_cron is not introduced

- GIVEN this change is applied
- WHEN database migrations for the clock are reviewed
- THEN they MUST NOT schedule `pg_cron` jobs for operator lifecycle events

### Requirement: Business Timezone

Clock math MUST use `businesses.timezone`, defaulting to `America/Argentina/Buenos_Aires` when unset. Local weekday, local date, day-N, and the 08:30 briefing window MUST be computed in that timezone.

#### Scenario: Default timezone when unset

- GIVEN a business with a null timezone
- WHEN the clock evaluates that business
- THEN local civil time MUST be interpreted as `America/Argentina/Buenos_Aires`

#### Scenario: Explicit timezone is honored

- GIVEN a business whose timezone is not the default
- WHEN the clock decides whether local Monday 08:30 has arrived
- THEN the decision MUST use that business timezone
- AND MUST NOT use UTC civil time as a substitute for local weekday or local 08:30

### Requirement: Weekday 08:30 Briefing Window On The Clock

The clock MUST treat the morning briefing window as local 08:30, Monday–Friday only, on the 15-minute tick that lands in the local `[08:30, 08:45)` interval. Saturday, Sunday, and weekday ticks outside that interval MUST no-op for `lifecycle.briefing`.

#### Scenario: Weekday tick inside the window

- GIVEN a business whose local time is Wednesday 08:37
- AND the briefing predicate for that local date is otherwise satisfied
- WHEN the authorized cron tick runs
- THEN the clock MUST be allowed to insert `lifecycle.briefing` for that local date

#### Scenario: Weekend or off-window tick no-ops briefing

- GIVEN a business whose local time is Saturday 08:30 or Wednesday 12:00
- WHEN the authorized cron tick runs
- THEN the clock MUST NOT insert `lifecycle.briefing` for that tick

### Requirement: Unique Idempotency Key

Each lifecycle `dashboard_notifications` insert MUST carry `metadata.idempotency_key`. The database MUST enforce uniqueness on `(business_id, event_type, (metadata->>'idempotency_key'))`. The clock MUST NOT rely on `WHERE NOT EXISTS` alone. A uniqueness conflict MUST leave a single inbox row for that key.

Suggested keys (stable meaning, not a required literal prefix beyond uniqueness):

- local civil date for `lifecycle.briefing`, `lifecycle.empty_agenda`, and `lifecycle.first_turno_soon`
- `booking:{id}` for `lifecycle.stale_deposit_claim` and `retention.first_public_booking`
- `customer:{id}:cancel-2` for `retention.customer_cancelled_twice`
- a cycle key that can change after re-arm for `retention.public_gap_7d`

#### Scenario: Second cron tick does not duplicate

- GIVEN a business already has `lifecycle.briefing` for today’s local date idempotency key
- WHEN the next 15-minute authorized tick runs in the same local day
- THEN the system MUST NOT insert a second `dashboard_notifications` row for that business, event type, and key
- AND MUST NOT enqueue a second web-push outbox row for a duplicate notification

#### Scenario: Uniqueness is stronger than a not-exists check

- GIVEN two overlapping authorized ticks for the same business and key
- WHEN both attempt to insert the same event type
- THEN at most one `dashboard_notifications` row MUST exist for that triple
- AND the second attempt MUST NOT create a second durable inbox aviso

### Requirement: No Engagement Email And No Customer Reminder Coupling

The clock MUST NOT write email-outbox rows for these eleven events. The clock MUST NOT call `enqueue_appointment_reminders_24h`. The system SHALL NOT add operator engagement email, client engagement email, or client web push as part of this change.

#### Scenario: Clock success does not enqueue owner or client mail

- GIVEN an authorized tick inserts a clocked lifecycle notification
- WHEN the insert commits
- THEN no email-outbox intent MUST be created for that lifecycle event
- AND `appointment-reminders-24h` MUST remain unchanged

#### Scenario: Client channels stay untouched

- GIVEN a clocked lifecycle notification is stored
- WHEN web push is considered
- THEN only operator web push through the existing outbox MAY fire
- AND the system MUST NOT send client web push for that event
