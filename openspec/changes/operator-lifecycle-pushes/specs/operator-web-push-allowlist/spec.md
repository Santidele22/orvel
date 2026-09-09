# Operator Web Push Allowlist Specification

## Purpose

Keep SQL `enqueue_web_push_outbox` (latest function body) and TypeScript `OPERATOR_WEB_PUSH_EVENT_TYPES` aligned so allowed operator events enqueue web push with click URL `/dashboard/turnos`, while unknown types stay skipped. This change extends the allowlist; it does not rewrite history or promote `deposit.claimed`.

## Requirements

### Requirement: Latest Enqueue And Processor Gain The Eleven Types

The **latest** `enqueue_web_push_outbox` body and `OPERATOR_WEB_PUSH_EVENT_TYPES` MUST both include the eleven locked lifecycle types:

- `lifecycle.briefing`
- `lifecycle.first_turno_soon`
- `lifecycle.empty_agenda`
- `lifecycle.stale_deposit_claim`
- `onboarding.no_services`
- `onboarding.no_hours`
- `onboarding.copy_link`
- `onboarding.share_day7`
- `retention.first_public_booking`
- `retention.public_gap_7d`
- `retention.customer_cancelled_twice`

Existing allowed types `appointment.created`, `appointment.cancelled`, `appointment.rescheduled`, and `appointment.reminder` MUST remain allowed. The historical create-outbox migration that locked the original three appointment types MUST remain unchanged. New tests MUST cover the latest enqueue function, not rewrite that create migration.

#### Scenario: A new lifecycle inbox row enqueues operator push

- GIVEN the latest enqueue function and processor allowlist include `lifecycle.briefing`
- WHEN a `dashboard_notifications` row with that `event_type` is inserted
- THEN `enqueue_web_push_outbox` MUST insert a `web_push_outbox` row for that `notification_id`
- AND `process-web-push-outbox` MUST treat the type as supported

#### Scenario: Appointment types still enqueue

- GIVEN an `appointment.created` durable notification
- WHEN enqueue runs
- THEN operator web push MUST still be enqueued as before this change

#### Scenario: Historical create-outbox contract stays three types

- GIVEN the original create-outbox migration file
- WHEN contract tests for that file run
- THEN they MUST still observe only the original three appointment types in that file
- AND this change MUST NOT edit that migration to add lifecycle types

### Requirement: Click URL Remains Turnos

Operator web-push payload `url` MUST remain `/dashboard/turnos` for appointment types and for all eleven lifecycle types. The system SHALL NOT add deep-link click URLs other than `/dashboard/turnos`. The public booking URL MAY appear in notification body copy and MUST NOT replace payload `url`.

#### Scenario: Lifecycle push opens Turnos

- GIVEN an enqueued outbox row for `onboarding.copy_link`
- WHEN the processor builds the web-push payload
- THEN `url` MUST be `/dashboard/turnos`

#### Scenario: Existing appointment push URL unchanged

- GIVEN an enqueued outbox row for `appointment.reminder`
- WHEN the processor builds the payload
- THEN `url` MUST still be `/dashboard/turnos`

### Requirement: Deposit Claimed Stays Inbox-Only

`deposit.claimed` MUST NOT be added to the latest SQL enqueue allowlist or to `OPERATOR_WEB_PUSH_EVENT_TYPES`. Stale seña (`lifecycle.stale_deposit_claim`) is the distinct later event that MAY push.

#### Scenario: Immediate claim aviso does not push

- GIVEN `claim_booking_deposit` inserts `deposit.claimed` into `dashboard_notifications`
- WHEN enqueue runs
- THEN the system MUST NOT create a `web_push_outbox` row for that notification
- AND the inbox row MUST still exist

#### Scenario: Stale claim is a different allowlisted type

- GIVEN a `lifecycle.stale_deposit_claim` notification
- WHEN enqueue runs
- THEN operator web push MUST be allowed for that type
- AND MUST NOT be implemented by promoting `deposit.claimed`

### Requirement: Unknown Types Remain Skipped

Event types absent from the allowlist MUST remain `skipped` / `unsupported_event_type`. Push enqueue MUST stay fail-open: a push enqueue exception MUST NOT fail the `dashboard_notifications` insert (`EXCEPTION WHEN OTHERS THEN RETURN NEW` or equivalent).

#### Scenario: Unknown type is skipped by the processor

- GIVEN an outbox or notification `event_type` that is not on the allowlist
- WHEN `process-web-push-outbox` handles it
- THEN the row MUST be marked skipped with `unsupported_event_type` (or equivalent)
- AND the processor MUST NOT send a web push

#### Scenario: Enqueue failure does not drop the inbox row

- GIVEN a new allowed lifecycle notification insert
- WHEN `enqueue_web_push_outbox` raises an exception
- THEN the `dashboard_notifications` row MUST still commit
- AND the operator inbox MUST still show the aviso

### Requirement: No Client Push And No Email Drain

The allowlist extension MUST apply only to operator web push through `web_push_outbox` → `process-web-push-outbox`. The system SHALL NOT add client web push. The system SHALL NOT drain these eleven events through `process-email-outbox`.

#### Scenario: Lifecycle event does not write email outbox

- GIVEN a `retention.first_public_booking` notification is inserted
- WHEN outbox drains run
- THEN no email-outbox row MUST be required for that event
- AND only operator web push MAY be enqueued
