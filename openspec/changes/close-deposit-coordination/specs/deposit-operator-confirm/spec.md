# Deposit Operator Confirm Specification

## Purpose

Operators MUST be able to confirm a manual seña from Turnos as well as Inicio, on both unpaid deposit states, without the system auto-confirming a client claim. Labels MUST distinguish a waiting hold from a claimed hold. Live path is `public.bookings` only.

## Requirements

### Requirement: Confirm Seña On Turnos List And Detail

The system MUST offer **Confirmar seña** on Turnos list and Turnos detail for desktop and mobile, in addition to the existing Inicio confirm action. Removing Inicio confirm is forbidden.

#### Scenario: Operator confirms from Turnos list

- GIVEN an unpaid booking on the live `public.bookings` path with `deposit_status` `pending` or `claim_pending`
- WHEN an authenticated operator chooses **Confirmar seña** from the Turnos list on desktop or mobile
- THEN the system MUST set `deposit_status` to `paid`
- AND the client MUST receive the existing appointment confirmation email
- AND Inicio **Confirmar seña** MUST still be available for other unpaid bookings

#### Scenario: Operator confirms from Turnos detail

- GIVEN an unpaid booking with `deposit_status` `pending` or `claim_pending`
- WHEN an authenticated operator chooses **Confirmar seña** from Turnos detail on desktop or mobile
- THEN the system MUST set `deposit_status` to `paid`
- AND the client MUST receive the appointment confirmation email

### Requirement: Confirm Available On Both Unpaid States

The system MUST accept operator confirm when `deposit_status` is `pending` and when it is `claim_pending`. Confirm MUST NOT be limited to one of those states.

#### Scenario: Confirm a waiting hold

- GIVEN a booking with `deposit_status` `pending`
- WHEN an operator confirms seña from Inicio or Turnos
- THEN the booking MUST become `paid`
- AND the slot MUST remain occupied as a confirmed seña booking

#### Scenario: Confirm a claimed hold

- GIVEN a booking with `deposit_status` `claim_pending`
- WHEN an operator confirms seña from Inicio or Turnos
- THEN the booking MUST become `paid`
- AND the system MUST NOT require any other unpaid state first

### Requirement: Never Auto-Confirm

The system MUST NOT set `deposit_status` to `paid` because the client claimed a transfer. Only an explicit operator confirm MAY move an unpaid hold to `paid`.

#### Scenario: Client claim does not confirm

- GIVEN a booking with `deposit_status` `pending`
- WHEN the client successfully claims they transferred
- THEN `deposit_status` MUST be `claim_pending`
- AND `deposit_status` MUST NOT be `paid`
- AND the appointment confirmation email MUST NOT be sent as a result of the claim alone

### Requirement: Split Unpaid Labels And Highlight Claimed

Turnos list and detail MUST show distinct unpaid labels for a waiting hold (`pending`) versus a claimed hold (`claim_pending`). Claimed holds MUST be visually highlighted relative to waiting holds. Occupancy and confirm eligibility MUST still treat both states as unpaid.

#### Scenario: Waiting hold badge

- GIVEN a Turnos row with `deposit_status` `pending`
- WHEN the operator views list or detail on desktop or mobile
- THEN the unpaid label MUST identify a pending seña
- AND the label MUST NOT imply the client already claimed a transfer

#### Scenario: Claimed hold badge highlighted

- GIVEN a Turnos row with `deposit_status` `claim_pending`
- WHEN the operator views list or detail on desktop or mobile
- THEN the unpaid label MUST identify a claimed seña
- AND the claimed hold MUST be highlighted relative to a pending hold
- AND **Confirmar seña** MUST remain available

#### Scenario: Slice 1 ships before any claimed holds exist

- GIVEN no booking currently has `deposit_status` `claim_pending`
- WHEN Turnos confirm and split unpaid labels are shipped
- THEN **Confirmar seña** MUST still appear for `pending` holds on Turnos list and detail
- AND the claimed highlight MAY have no rows to apply to
- AND the absence of `claim_pending` MUST NOT block Turnos confirm

### Requirement: Live Bookings Path Only

Operator confirm MUST mutate `public.bookings.deposit_status` on the live bookings path. The system MUST NOT require `public.appointments` or ghost `clients` tables for this behavior.

#### Scenario: Confirm does not depend on dual-schema tables

- GIVEN a live unpaid booking in `public.bookings`
- WHEN an operator confirms seña
- THEN the confirm MUST succeed against that booking row
- AND the operation MUST NOT require an `appointments` row
