# Operator Retention Pushes Specification

## Purpose

Define catalog events `#9`–`#11`: first public booking, 7-day public gap with live-business re-arm, and second cancel for the same customer. Confirmed tokens `SELF_SERVICE`, `LIVE_REARM`, and `ANY_CANCEL_ONCE` apply. This domain is capped operator signal, not CRM.

Locked types: `retention.first_public_booking`, `retention.public_gap_7d`, `retention.customer_cancelled_twice`.

Public booking means `bookings.source = 'client-self-service'`, counting the row even if later cancelled.

## Requirements

### Requirement: First Public Booking Is Instant

Token `SELF_SERVICE`. The system MUST insert `retention.first_public_booking` on the first INSERT of a `client-self-service` booking. Delivery MUST be a SQL trigger (or equivalent instant path), not the 15-minute clock. Notify once per business. Idempotency MUST include a per-booking key such as `booking:{id}` plus a business once-flag such as `retention_first_public_notified_at`.

#### Scenario: First public insert notifies immediately

- GIVEN a business with zero prior `client-self-service` bookings
- WHEN the first `client-self-service` booking is inserted
- THEN the system MUST insert `event_type = 'retention.first_public_booking'` in the same success path
- AND the operator MUST NOT have to wait for the lifecycle cron tick
- AND the click URL MUST be `/dashboard/turnos`

#### Scenario: Later public inserts do not notify again

- GIVEN `retention.first_public_booking` already exists or the once-flag is set
- WHEN another `client-self-service` booking is inserted
- THEN the system MUST NOT insert a second first-public notification

#### Scenario: Cancelled first public still counts as first

- GIVEN the first public booking is later cancelled
- WHEN the clock or a later insert runs
- THEN the system MUST NOT insert another `retention.first_public_booking`

#### Scenario: Duplicate trigger or tick does not double-insert

- GIVEN a first-public notification already stored for that booking key
- WHEN the trigger fires again or a cron tick runs
- THEN the system MUST NOT insert a second row for that key

### Requirement: Seven-Day Public Gap With Live Rearm

Token `LIVE_REARM`. The 15-minute clock MUST insert `retention.public_gap_7d` when all of the following hold:

1. Live business: at least one `client-self-service` booking ever **and** the public turnero is not disabled (same accept-public-bookings gate as `_assert_business_accepts_public_bookings`).
2. The last public booking `created_at` is older than 7 days.
3. The current gap cycle has not already been notified.

After a gap notification, the system MUST wait for a **later** public booking before the 7-day clock may fire again. The idempotency key MUST change across re-arm cycles so a new gap can insert a new row without duplicating the previous cycle.

#### Scenario: Live business with a 7-day public drought

- GIVEN the business has at least one historical `client-self-service` booking
- AND the public turnero still accepts public bookings
- AND the latest public `created_at` is older than 7 days
- AND this gap cycle has not been notified
- WHEN the authorized clock runs
- THEN the system MUST insert `event_type = 'retention.public_gap_7d'`

#### Scenario: Not live because public turnero is disabled

- GIVEN at least one historical public booking
- AND the public accept-bookings gate fails (same as `_assert_business_accepts_public_bookings`)
- WHEN the clock runs
- THEN the system MUST NOT insert `retention.public_gap_7d`

#### Scenario: Not live because there was never a public booking

- GIVEN zero `client-self-service` bookings ever
- WHEN the clock runs
- THEN the system MUST NOT insert `retention.public_gap_7d`
- AND day-7 onboarding (`onboarding.share_day7`) remains the zero-public signal

#### Scenario: Second cron tick does not duplicate the same gap cycle

- GIVEN `retention.public_gap_7d` already exists for the current cycle key
- AND no newer public booking has arrived
- WHEN a later tick runs
- THEN the system MUST NOT insert a second row for that cycle

#### Scenario: Re-arm after the next public booking

- GIVEN a gap notification was already stored
- AND a newer `client-self-service` booking is then inserted
- AND 7 days pass with no further public booking
- WHEN the clock runs
- THEN the system MUST be allowed to insert a new `retention.public_gap_7d` for the new cycle
- AND MUST NOT reuse the previous cycle’s idempotency key

### Requirement: Same Customer Cancelled Twice Once

Token `ANY_CANCEL_ONCE`. The system MUST notify once when the count of `cancelled` rows for the same `customer_id` (within the business) reaches 2. Delivery MUST be an instant SQL trigger on insert/update of cancelled bookings, not the clock. The system SHALL NOT distinguish client vs operator cancel (no cancel-actor column). Idempotency key MUST be per customer, such as `customer:{id}:cancel-2`.

#### Scenario: Second cancelled row notifies once

- GIVEN a customer already has one `cancelled` booking in the business
- WHEN a second booking for that `customer_id` becomes `cancelled`
- THEN the system MUST insert `event_type = 'retention.customer_cancelled_twice'`
- AND the operator MUST NOT wait for the lifecycle cron
- AND the click URL MUST be `/dashboard/turnos`

#### Scenario: Two operator cancels still notify

- GIVEN both cancelled rows were cancelled by the operator
- WHEN the count reaches 2
- THEN the system MUST still insert `retention.customer_cancelled_twice`
- AND the system MUST NOT require a client-actor column that does not exist

#### Scenario: Third cancel does not notify again

- GIVEN `retention.customer_cancelled_twice` already exists for `customer:{id}:cancel-2`
- WHEN a third booking for that customer is cancelled
- THEN the system MUST NOT insert another row for that customer

#### Scenario: Duplicate trigger does not double-insert

- GIVEN the cancel-2 notification already exists for that customer key
- WHEN the trigger fires again
- THEN the system MUST NOT insert a second row

### Requirement: Retention Copy Is Not CRM

Retention titles and bodies MUST state facts (first public booking, no public bookings for 7 days, same customer cancelled twice). They SHALL NOT use campaign, win-back, or newsletter language. This change SHALL NOT add inactivity / `last_seen` re-engagement.

#### Scenario: Catalog stays closed at these three retention types

- GIVEN this change is applied
- WHEN event types are reviewed
- THEN only `retention.first_public_booking`, `retention.public_gap_7d`, and `retention.customer_cancelled_twice` MUST be added in this domain
