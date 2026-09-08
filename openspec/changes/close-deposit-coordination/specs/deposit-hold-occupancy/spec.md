# Deposit Hold Occupancy Specification

## Purpose

Manual seña occupancy on the live `public.bookings` path MUST keep occupying the slot while `deposit_status` is `pending` or `claim_pending`, and MUST free the slot when status is `released`, `abandoned`, or `void` without mutating `bookings.status`. After this change, timeout and operator reject MUST actually reach `released` so occupancy updates without waiting for a lazy availability read. Hold duration and seña percent stay unchanged.

## Requirements

### Requirement: Unpaid Holds Occupy The Slot

Bookings with `deposit_status` `pending` or `claim_pending` MUST occupy the slot. `claim_pending` MUST NOT free the slot. Occupancy MUST NOT require changing `bookings.status`.

#### Scenario: Pending hold occupies

- GIVEN a live booking with `deposit_status` `pending` and a 30-minute hold that has not expired
- WHEN availability is computed for that professional, time, and service duration
- THEN the slot MUST be treated as occupied
- AND another public book MUST NOT take that exact slot

#### Scenario: Claimed hold still occupies

- GIVEN a live booking with `deposit_status` `claim_pending`
- WHEN availability is computed
- THEN the slot MUST remain occupied
- AND claim MUST NOT be treated as releasing the hold

### Requirement: Released Abandoned And Void Free The Slot

`deposit_status` values `released`, `abandoned`, and `void` MUST be excluded from occupancy. Freeing the slot MUST NOT require mutating `bookings.status`. This change MUST NOT alter that exclude list.

#### Scenario: Released hold frees the slot

- GIVEN a booking whose `deposit_status` became `released`
- WHEN availability is computed
- THEN that booking MUST NOT occupy the slot
- AND `bookings.status` MAY remain unchanged

#### Scenario: Exclude list stays released abandoned void

- GIVEN occupancy rules for deposit holds
- WHEN an implementer inspects which deposit statuses free a slot without a status mutation
- THEN the free set MUST be `released`, `abandoned`, and `void`
- AND `pending` and `claim_pending` MUST NOT be in that free set

### Requirement: Timeout And Reject Reach Released Without Lazy Read

Expired-hold timeout and operator **no la veo** MUST set `deposit_status` to `released` so occupancy can free without waiting for an availability query, confirm, or claim. They MUST NOT write `abandoned` for those two events.

#### Scenario: Timeout frees occupancy by writing released

- GIVEN an unpaid hold past the 30-minute expiry
- AND no availability read has run
- WHEN scheduled or other in-scope timeout release runs
- THEN `deposit_status` MUST be `released`
- AND a later availability computation MUST treat the slot as free

#### Scenario: Operator reject frees occupancy by writing released

- GIVEN an unpaid hold (`pending` or `claim_pending`)
- WHEN the operator rejects with **no la veo**
- THEN `deposit_status` MUST be `released` and MUST NOT be `abandoned`
- AND availability MUST treat the slot as free without a prior lazy occupancy read having released it

### Requirement: Hold Duration And Percent Unchanged

The hold MUST remain 30 minutes. Seña percent options MUST remain 25 / 50 / 100. This capability MUST NOT add amount or duration knobs.

#### Scenario: Existing hold length

- GIVEN a public book with deposits on
- WHEN the hold window is evaluated
- THEN occupancy as unpaid MUST last 30 minutes from the existing hold start
- AND the window MUST NOT be a newly configurable duration

#### Scenario: Existing percent options

- GIVEN deposits are enabled for the business
- WHEN a seña amount is derived
- THEN percent MUST still be one of 25, 50, or 100 as already configured
- AND this change MUST NOT introduce a new percent or fixed-amount control

### Requirement: Live Bookings Path Only

Occupancy for this change MUST be evaluated on `public.bookings.deposit_status`. Dual-schema `appointments` / ghost `clients` MUST NOT be required.

#### Scenario: Occupancy does not depend on appointments table

- GIVEN a live unpaid or released booking in `public.bookings`
- WHEN availability is computed
- THEN occupancy MUST follow that booking’s `deposit_status`
- AND the computation MUST NOT require a parallel `appointments` row
