# Deposit Hold Eager Release Specification

## Purpose

Expired unpaid seña holds MUST be released on a schedule so the slot frees and the hold-released client email can send without waiting for an availability read, confirm, or claim. Timeout MUST write `deposit_status` `released` (not `abandoned`). Hold-released copy MUST stay honest and MUST NOT use refund language.

## Requirements

### Requirement: Scheduled Release Without Traffic

The system MUST release expired unpaid holds (`pending` or `claim_pending` past the existing 30-minute hold) even when no operator views availability and no client claims or confirms. A quiet business MUST NOT keep an expired hold occupying the slot solely because nobody read the agenda.

#### Scenario: Expired hold releases without an availability read

- GIVEN a booking on `public.bookings` with `deposit_status` `pending` or `claim_pending`
- AND the hold expiry is in the past
- AND no availability query, confirm, or claim runs against that booking
- WHEN the scheduled release runs
- THEN `deposit_status` MUST become `released`
- AND the slot MUST become free for occupancy
- AND `bookings.status` MUST NOT need to change for the slot to free

#### Scenario: Unexpired hold is not released by the clock

- GIVEN a booking with `deposit_status` `pending` or `claim_pending`
- AND the 30-minute hold has not expired
- WHEN the scheduled release runs
- THEN `deposit_status` MUST remain unpaid
- AND the slot MUST remain occupied

### Requirement: Timeout Writes Released Not Abandoned

Hold timeout MUST set `deposit_status` to `released`. Timeout MUST NOT set `abandoned` or `void`. The existing hold-released email path MUST fire only because the row became `released`.

#### Scenario: Timeout uses released so hold-released mail can send

- GIVEN an expired unpaid hold
- WHEN scheduled (or other in-scope) release updates the booking
- THEN `deposit_status` MUST be `released`
- AND `deposit_status` MUST NOT be `abandoned`
- AND the client MUST be sent the existing hold-released email
- AND that email copy MUST NOT include refund language

### Requirement: Hold Duration Unchanged

The hold length MUST remain 30 minutes. This capability MUST NOT introduce a configurable hold duration.

#### Scenario: Clock still uses the existing 30-minute hold

- GIVEN a public book with deposits on created at time T
- WHEN T+30 minutes has passed and scheduled release runs
- THEN the hold is eligible for release
- AND a hold younger than 30 minutes MUST NOT be released by expiry

### Requirement: Optional Public Countdown Release

When the public hold countdown reaches 00:00, the system MAY also release that specific unpaid booking. Clearing local session storage alone MUST NOT be treated as having released the slot on the server.

#### Scenario: Countdown expiry may release the open hold

- GIVEN the public hold card is still open on an unpaid booking whose hold has expired
- WHEN the countdown reaches 00:00
- THEN the system MAY release that booking to `released`
- AND if it does, the hold-released email MUST be able to fire from that update

#### Scenario: Local countdown clear is not occupancy release

- GIVEN the public hold card countdown reaches 00:00
- WHEN the client session only clears local hold storage and no server release runs
- THEN occupancy MUST still follow `public.bookings.deposit_status`
- AND the slot MUST remain occupied until a server update sets a free deposit status

### Requirement: Lazy Release May Remain As Belt

Existing lazy release on availability / confirm / claim MAY remain. It MUST NOT be the only release path once eager scheduled release is deployed for an environment. An environment without a working scheduled caller MAY still be lazy; that MUST NOT be described as eager release succeeding.

#### Scenario: Scheduled path is the eager clock

- GIVEN an environment where the scheduled release caller is deployed and authorized
- WHEN unpaid holds expire with no dashboard traffic
- THEN those holds MUST still reach `released` via the scheduled path

### Requirement: No Refund Language And No Dual-Schema

Hold-released client copy MUST remain honest (the seña was not accredited in time; the slot is available). Copy MUST NOT promise a refund. Release MUST run on `public.bookings` only.

#### Scenario: Released copy stays honest

- GIVEN a hold that timed out to `released`
- WHEN the client receives hold-released mail
- THEN the copy MUST NOT mention refunds, reimbursements, or returning money
- AND the copy MAY state that the slot is available again
