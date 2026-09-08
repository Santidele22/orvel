# Deposit Operator Reject Specification

## Purpose

An authenticated operator MUST be able to reject a seña they do not see (**no la veo**) on an unpaid live booking. Reject MUST set `deposit_status` to `released` (not `abandoned`) so the existing hold-released client email fires, MUST write distinct evidence, and MUST leave operator confirm available on the same unpaid states. Strike UI is out of scope. No refund language.

## Requirements

### Requirement: Operator Can Reject Unpaid Holds

The system MUST let an authenticated operator reject a seña from Turnos when `deposit_status` is `pending` or `claim_pending`. Unauthenticated callers MUST NOT be able to perform this reject.

#### Scenario: Reject a waiting hold from Turnos

- GIVEN a booking on `public.bookings` with `deposit_status` `pending`
- AND an authenticated operator on Turnos list or detail (desktop or mobile)
- WHEN the operator chooses **no la veo**
- THEN `deposit_status` MUST become `released`
- AND the slot MUST become free for occupancy

#### Scenario: Reject a claimed hold from Turnos

- GIVEN a booking with `deposit_status` `claim_pending`
- WHEN an authenticated operator chooses **no la veo**
- THEN `deposit_status` MUST become `released`
- AND confirm MUST no longer apply to that booking

#### Scenario: Unauthenticated reject is rejected

- GIVEN an unpaid hold
- WHEN an unauthenticated caller attempts operator reject
- THEN the booking MUST remain in its current unpaid state
- AND `deposit_status` MUST NOT become `released` from that attempt

### Requirement: Reject Writes Released Not Abandoned

Operator reject MUST set `deposit_status` to `released`. It MUST NOT set `abandoned` or `void`. The hold-released email trigger MUST be able to run because the new value is `released`.

#### Scenario: Reject reuses hold-released mail

- GIVEN an unpaid hold (`pending` or `claim_pending`)
- WHEN the operator rejects with **no la veo**
- THEN `deposit_status` MUST be `released`
- AND `deposit_status` MUST NOT be `abandoned`
- AND the client MUST receive the existing hold-released email
- AND that email MUST NOT use refund language

### Requirement: Distinct Reject Evidence

A successful reject MUST write an evidence row that is distinct from client claim evidence and from timeout evidence. Confirm MAY continue to write no evidence. Strike UI MUST NOT be required for reject to succeed.

#### Scenario: Reject evidence is not claim or timeout

- GIVEN an unpaid hold
- WHEN the operator successfully rejects
- THEN an evidence record for that reject MUST exist
- AND that evidence MUST NOT be recorded as a client `claim`
- AND that evidence MUST NOT be recorded as a timeout strike
- AND no strike-management UI MUST be required

### Requirement: Confirm Remains Available On Unpaid States

While a booking is still `pending` or `claim_pending`, **Confirmar seña** MUST remain available on the same Turnos surfaces. Reject MUST NOT replace confirm.

#### Scenario: Unpaid hold offers confirm and reject

- GIVEN a Turnos unpaid booking with `deposit_status` `pending` or `claim_pending`
- WHEN the operator views list or detail
- THEN **Confirmar seña** MUST be available
- AND **no la veo** MUST be available
- AND choosing confirm MUST still set `paid` rather than `released`

### Requirement: Live Bookings Path And Non-Goals

Reject MUST mutate `public.bookings.deposit_status`. The system MUST NOT require dual-schema tables, Mercado Pago, refunds, or strike UI for this capability.

#### Scenario: Reject stays on live bookings

- GIVEN a live unpaid booking in `public.bookings`
- WHEN the operator rejects
- THEN the update MUST be on that booking row
- AND the operation MUST NOT require `public.appointments` or ghost `clients` tables
