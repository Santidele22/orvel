# Operator Ops Pushes Specification

## Purpose

Define catalog events `#1`–`#4`: weekday morning briefing, first remaining turno in 60–90 minutes, empty agenda after a busy yesterday, and stale seña claim. Confirmed token `DEFAULTS` (2026-04-09) applies with no overrides. Copy MUST be operational facts. Click URL for all four is `/dashboard/turnos`.

Locked types: `lifecycle.briefing`, `lifecycle.first_turno_soon`, `lifecycle.empty_agenda`, `lifecycle.stale_deposit_claim`.

Remaining booked/confirmed means `bookings.status` in (`booked`, `confirmed`) whose `starts_at` is still in the future relative to the clock instant, unless a scenario names a local-day count instead.

## Requirements

### Requirement: Weekday Morning Briefing

The system MUST insert at most one `lifecycle.briefing` per business per local civil date. Token `0830_WEEKDAYS`: local 08:30, Monday–Friday only, timezone as specified in `operator-lifecycle-clock`. Body copy MUST be an operational briefing of today’s book, not a newsletter or digest campaign.

#### Scenario: Briefing fires once on a weekday morning tick

- GIVEN a business with local timezone set
- AND local time is a weekday in `[08:30, 08:45)`
- AND no `lifecycle.briefing` exists for that business and today’s local-date idempotency key
- WHEN the authorized lifecycle clock runs
- THEN the system MUST insert one `dashboard_notifications` row with `event_type = 'lifecycle.briefing'`
- AND that row’s click URL MUST be `/dashboard/turnos`

#### Scenario: Second cron tick does not duplicate briefing

- GIVEN `lifecycle.briefing` already exists for that business and today’s local-date key
- WHEN a later tick in the same local weekday morning window runs
- THEN the system MUST NOT insert another `lifecycle.briefing` row

#### Scenario: Weekend does not brief

- GIVEN local Saturday or Sunday, including 08:30
- WHEN the clock runs
- THEN the system MUST NOT insert `lifecycle.briefing`

### Requirement: First Remaining Turno Soon

Token `FIRST_REMAINING_ONCE`. The system MUST notify once per local day per business when the day’s first remaining `booked`/`confirmed` turno has `starts_at` in `[now()+60 minutes, now()+90 minutes]`. The system MUST NOT notify for a later turno when the first remaining turno is outside that window.

#### Scenario: First remaining turno is inside the 60–90 minute window

- GIVEN today the earliest remaining `booked` or `confirmed` turno starts 75 minutes from now
- AND no `lifecycle.first_turno_soon` exists for this business and today’s local-date key
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'lifecycle.first_turno_soon'`
- AND the click URL MUST be `/dashboard/turnos`

#### Scenario: First remaining turno is too soon or too far

- GIVEN the day’s first remaining turno starts 30 minutes from now, or 2 hours from now
- WHEN the clock runs
- THEN the system MUST NOT insert `lifecycle.first_turno_soon` for a later turno that happens to sit in the 60–90 minute window

#### Scenario: Second tick the same local day does not duplicate

- GIVEN `lifecycle.first_turno_soon` already exists for this business and today’s local-date key
- WHEN another tick still sees a remaining turno in the 60–90 minute window
- THEN the system MUST NOT insert a second row

### Requirement: Empty Agenda After A Busy Yesterday

The system MUST insert `lifecycle.empty_agenda` when the local today has zero remaining `booked`/`confirmed` turnos **and** the previous local day had at least one `booked` or `confirmed` turno. The insert MUST be at most once per local date per business.

#### Scenario: Quiet today after a busy yesterday

- GIVEN yesterday’s local day had at least one `booked` or `confirmed` turno
- AND today has zero remaining `booked`/`confirmed` turnos
- AND no `lifecycle.empty_agenda` exists for today’s local-date key
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'lifecycle.empty_agenda'`

#### Scenario: Empty today but yesterday was also empty

- GIVEN yesterday’s local day had zero `booked`/`confirmed` turnos
- AND today also has zero remaining `booked`/`confirmed` turnos
- WHEN the clock runs
- THEN the system MUST NOT insert `lifecycle.empty_agenda`

#### Scenario: Today still has a remaining turno

- GIVEN today still has at least one remaining `booked` or `confirmed` turno
- WHEN the clock runs
- THEN the system MUST NOT insert `lifecycle.empty_agenda`

#### Scenario: Second cron tick does not duplicate empty agenda

- GIVEN `lifecycle.empty_agenda` already exists for this business and today’s local-date key
- WHEN a later tick still sees an empty remaining agenda
- THEN the system MUST NOT insert a second row

### Requirement: Stale Seña Claim After Fifteen Minutes

Token `CLAIM_15M`. The system MUST insert `lifecycle.stale_deposit_claim` when a booking has `deposit_status = 'claim_pending'` and `now()` is at least 15 minutes after `deposit_claimed_at`. This event MUST be distinct from inbox-only `deposit.claimed` and MUST NOT share meaning with the 30-minute unpaid hold. Idempotency key MUST be per booking.

#### Scenario: Claim still pending after 15 minutes

- GIVEN a booking in `claim_pending` whose `deposit_claimed_at` is 16 minutes ago
- AND no `lifecycle.stale_deposit_claim` exists for `booking:{id}`
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'lifecycle.stale_deposit_claim'`
- AND `deposit.claimed` MUST remain an earlier inbox-only event and MUST NOT gain web push from this requirement

#### Scenario: Claim resolved before 15 minutes

- GIVEN `deposit_claimed_at` is 16 minutes ago but `deposit_status` is no longer `claim_pending`
- WHEN the clock runs
- THEN the system MUST NOT insert `lifecycle.stale_deposit_claim` for that booking

#### Scenario: Unpaid hold expiry is not this event

- GIVEN a booking still in the unpaid hold path (not `claim_pending`)
- WHEN 30 minutes of unpaid hold elapse
- THEN the system MUST NOT insert `lifecycle.stale_deposit_claim` as a substitute for hold release

#### Scenario: Second cron tick does not duplicate stale claim

- GIVEN `lifecycle.stale_deposit_claim` already exists for that booking key
- WHEN a later tick still sees `claim_pending`
- THEN the system MUST NOT insert a second row for that booking

### Requirement: Ops Copy Is Not Marketing

Ops notification titles and bodies MUST state operational facts (today’s book, first remaining turno, empty day, seña still waiting). They SHALL NOT use newsletter, digest, campaign, or re-engagement language. The public booking URL MAY appear in body copy and MUST NOT be the click target.

#### Scenario: Click lands on Turnos

- GIVEN any of the four ops notifications is opened from inbox or web push
- WHEN the operator follows the notification URL
- THEN the destination MUST be `/dashboard/turnos`
