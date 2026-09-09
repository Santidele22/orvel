# Dashboard Notifications Inbox Specification

## Purpose

Make the dashboard bell TypeScript contract match SQL for lifecycle and business-level rows: the event-type union includes the eleven locked lifecycle types, and `appointmentId` is nullable when no appointment exists.

## Requirements

### Requirement: Event Type Union Includes Lifecycle Catalog

`DashboardNotificationEventType` (or the equivalent inbox union) MUST include the existing appointment types and the eleven locked lifecycle strings:

- `appointment.created`
- `appointment.cancelled`
- `appointment.rescheduled`
- `appointment.reminder`
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

SQL-backed `deposit.claimed` rows MUST still appear in the bell using stored title and body even though that type remains inbox-only for web push.

#### Scenario: Briefing row is a typed inbox event

- GIVEN a `dashboard_notifications` row with `event_type = 'lifecycle.briefing'`
- WHEN the dashboard lists admin notifications
- THEN the client MUST accept the row without dropping it for an unknown event type
- AND the operator MUST see title and body in the bell

#### Scenario: Existing appointment rows still list

- GIVEN an `appointment.cancelled` row
- WHEN the dashboard lists notifications
- THEN the row MUST still appear with its existing event type

#### Scenario: Deposit claimed still lists without web push

- GIVEN a `deposit.claimed` inbox row
- WHEN the dashboard lists notifications
- THEN the operator MUST still see the aviso
- AND listing MUST NOT require that type to be on the web-push allowlist

### Requirement: Nullable Appointment Id For Business-Level Rows

Inbox `appointmentId` MUST be nullable to match SQL `appointment_id`. Scheduled and business-level lifecycle rows MAY have a null appointment. Appointment-scoped rows (stale seña, first public, second cancel when tied to a booking) MAY still populate `appointment_id`.

#### Scenario: Morning briefing has no appointment

- GIVEN a `lifecycle.briefing` row with `appointment_id` null
- WHEN the dashboard maps the row to `DashboardNotification`
- THEN `appointmentId` MUST be null
- AND the row MUST still render in the bell

#### Scenario: Empty agenda and onboarding rows accept null appointment

- GIVEN `lifecycle.empty_agenda` or `onboarding.copy_link` with null `appointment_id`
- WHEN the inbox loads
- THEN the client MUST NOT throw or omit the row for a missing appointment id

#### Scenario: Stale claim may keep the booking id

- GIVEN `lifecycle.stale_deposit_claim` with `appointment_id` set to the booking
- WHEN the inbox loads
- THEN `appointmentId` MAY be that booking id
- AND a null value MUST still be tolerated if SQL stored null

### Requirement: Duplicate Inbox Rows Are Not Shown From Cron Spam

The inbox MUST reflect at most one durable row per `(business_id, event_type, idempotency_key)`. A second cron tick MUST NOT produce a second bell entry for the same key.

#### Scenario: Second tick does not add a second bell row

- GIVEN the operator already has `lifecycle.briefing` for today’s local-date key
- WHEN the next 15-minute clock tick runs
- THEN the inbox MUST still contain a single briefing row for that key

#### Scenario: Distinct keys still appear as distinct avisos

- GIVEN `lifecycle.briefing` for date A and `lifecycle.empty_agenda` for date A
- WHEN the inbox loads
- THEN both rows MUST be listed
- AND they MUST NOT collapse into one event type without their keys

### Requirement: Click Target In The Bell Is Turnos

Following a lifecycle inbox row MUST land on `/dashboard/turnos`. The system SHALL NOT introduce other deep-link click URLs in this change.

#### Scenario: Operator opens an onboarding aviso

- GIVEN an `onboarding.share_day7` inbox row
- WHEN the operator opens it
- THEN navigation MUST go to `/dashboard/turnos`
