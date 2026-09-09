# Operator Onboarding Pushes Specification

## Purpose

Define catalog events `#5`–`#8`: day-N onboarding prompts from `businesses.created_at`. Confirmed token `DEFAULTS` applies. These are capped once-per-business (or once-per-flag) operator facts, not a drip campaign.

Locked types: `onboarding.no_services`, `onboarding.no_hours`, `onboarding.copy_link`, `onboarding.share_day7`.

Day N is the Nth local civil date in the business timezone, counting the local date of `businesses.created_at` as day 1.

## Requirements

### Requirement: Day-N Clock Is Created At

Token `CREATED_AT`. Onboarding day-N MUST use `businesses.created_at`. The system SHALL NOT use `public.users.last_login_at` or any `last_seen` heuristic.

#### Scenario: Day 1 is the local date of creation

- GIVEN a business created on local Monday
- WHEN the clock evaluates onboarding on that same local Monday
- THEN that evaluation MUST count as day 1

#### Scenario: Dead last-login is not revived

- GIVEN `public.users.last_login_at` is unset or stale
- WHEN the clock decides day N
- THEN day N MUST still be derived from `businesses.created_at` only

### Requirement: Day 1 No Active Services

The system MUST insert `onboarding.no_services` once if, on day 1, the business has no active service. Default provisioned services mean the happy path SHALL NOT fire. A once-flag such as `onboarding_no_services_notified_at` MUST prevent repeats.

#### Scenario: Operator has no active service on day 1

- GIVEN day 1 in the business timezone
- AND the business has zero active services
- AND the once-flag is unset
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'onboarding.no_services'`
- AND subsequent ticks MUST NOT insert another row for that business

#### Scenario: Default services skip day 1

- GIVEN day 1
- AND at least one active service exists
- WHEN the clock runs
- THEN the system MUST NOT insert `onboarding.no_services`

#### Scenario: Second cron tick does not duplicate day 1

- GIVEN `onboarding.no_services` already exists or the once-flag is set
- WHEN another tick on day 1 or later runs
- THEN the system MUST NOT insert a second `onboarding.no_services` row

### Requirement: Day 2 Hours Only When All Weekdays Closed

Token `HOURS_ALL_CLOSED`. The system MUST insert `onboarding.no_hours` once on day 2 only when **no weekday (Monday–Friday) has an enabled interval**. Default weekday 09:00–18:00 JSON MUST NOT fire. The system SHALL NOT invent a “never opened settings” heuristic.

#### Scenario: All weekdays have no enabled interval

- GIVEN day 2
- AND Monday through Friday each have no enabled working-hours interval
- AND the once-flag is unset
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'onboarding.no_hours'`

#### Scenario: Default 09–18 does not fire

- GIVEN day 2
- AND weekday working hours are the default 09:00–18:00 JSON
- WHEN the clock runs
- THEN the system MUST NOT insert `onboarding.no_hours`

#### Scenario: Second cron tick does not duplicate day 2

- GIVEN `onboarding.no_hours` already exists or the once-flag is set
- WHEN a later tick runs
- THEN the system MUST NOT insert a second row

### Requirement: Day 3 Copy Link When Turnero Ready And Uncopied

Token `READY_SLUG_SVC_HOURS`. The system MUST insert `onboarding.copy_link` once on day 3 when all of the following hold: a public slug exists, at least one active service exists, at least one enabled day has intervals, and `booking_link_copied_at` is null. Click URL MUST remain `/dashboard/turnos`. The public booking URL MAY appear in body copy and MUST NOT be the click target.

#### Scenario: Turnero ready and link never copied

- GIVEN day 3
- AND the business has a slug, ≥1 active service, and ≥1 enabled day with intervals
- AND `booking_link_copied_at` is null
- AND the once-flag is unset
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'onboarding.copy_link'`

#### Scenario: Missing slug, services, or enabled hours

- GIVEN day 3 and `booking_link_copied_at` is null
- AND the business lacks a slug, or has zero active services, or has no enabled day with intervals
- WHEN the clock runs
- THEN the system MUST NOT insert `onboarding.copy_link`

#### Scenario: Already copied booking URL

- GIVEN day 3 and the business is otherwise turnero-ready
- AND `booking_link_copied_at` is set
- WHEN the clock runs
- THEN the system MUST NOT insert `onboarding.copy_link`

#### Scenario: Second cron tick does not duplicate copy-link

- GIVEN `onboarding.copy_link` already exists or the once-flag is set
- WHEN a later tick runs
- THEN the system MUST NOT insert a second row

### Requirement: Booking Link Copy Instrumentation

The dashboard MUST persist `booking_link_copied_at` on successful `clipboard.writeText` of the **public booking URL** from home and settings through a shared helper. Copy of `window.location.href` during PWA install MUST NOT set the flag. The public booking URL MUST be computed from `businesses.slug` (existing `buildPublicBookingUrl`) and MUST NOT be stored as a separate URL column for this change.

#### Scenario: Home or settings copies the public booking URL

- GIVEN the operator copies the public booking URL from dashboard home or settings
- AND `clipboard.writeText` succeeds
- WHEN the shared helper finishes
- THEN `booking_link_copied_at` MUST be set
- AND home and settings MUST share that helper

#### Scenario: PWA install copy is not a booking-link copy

- GIVEN the PWA install flow copies `window.location.href`
- WHEN that copy succeeds
- THEN `booking_link_copied_at` MUST remain unchanged

### Requirement: Day 7 Zero Public Bookings

Token `SELF_SERVICE`. The system MUST insert `onboarding.share_day7` once on day 7 if the business has zero bookings with `source = 'client-self-service'` ever, counting rows even if later cancelled. Admin-manual bookings MUST NOT count as public.

#### Scenario: No public booking by day 7

- GIVEN day 7
- AND count of `source = 'client-self-service'` bookings is zero
- AND the once-flag is unset
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'onboarding.share_day7'`

#### Scenario: A later-cancelled public booking still counts

- GIVEN day 7
- AND one `client-self-service` booking exists with status `cancelled`
- WHEN the clock runs
- THEN the system MUST NOT insert `onboarding.share_day7`

#### Scenario: Second cron tick does not duplicate day 7

- GIVEN `onboarding.share_day7` already exists or the once-flag is set
- WHEN a later tick runs
- THEN the system MUST NOT insert a second row

### Requirement: Onboarding Copy Is Not A Drip Campaign

Onboarding titles and bodies MUST state onboarding facts (no services, hours closed, copy the link, no public bookings yet). They SHALL NOT use marketing automation, newsletter, or inactivity re-engagement language. The catalog of onboarding event types SHALL NOT grow beyond these four in this change.

#### Scenario: Click still lands on Turnos

- GIVEN any of the four onboarding notifications
- WHEN the operator follows the notification URL
- THEN the destination MUST be `/dashboard/turnos`
