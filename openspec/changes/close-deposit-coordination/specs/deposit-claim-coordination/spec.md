# Deposit Claim Coordination Specification

## Purpose

A client on the public hold card MUST be able to declare **Ya transferí**. That claim MUST move the live booking to `claim_pending` (never `paid`), tell the client the business was notified (never that payment was received), and persist a durable dashboard notification in the same success path as the state change. WhatsApp remains optional. Instructions-email CTA / manage links are out of scope.

## Requirements

### Requirement: Public Ya Transferí On The Hold Card

While the public deposit hold card is open with a persistable manage token, the system MUST offer **Ya transferí**. A successful claim MUST set `public.bookings.deposit_status` to `claim_pending` and MUST NOT set it to `paid`.

#### Scenario: Client claims transfer during the hold session

- GIVEN a public booking with deposits on and `deposit_status` `pending`
- AND the hold card still has the manage token from create-public-booking (session-scoped storage MAY hold it)
- WHEN the client chooses **Ya transferí**
- THEN `deposit_status` MUST become `claim_pending`
- AND `deposit_status` MUST NOT become `paid`
- AND the system MUST NOT send the appointment confirmation email as a result of the claim alone

#### Scenario: Claim without a manage token in this session

- GIVEN the client left the hold card and no manage token remains in this tab
- AND instructions email has no manage CTA (out of scope for this change)
- WHEN the client cannot reach **Ya transferí**
- THEN the booking MUST remain `pending` until another in-scope path changes it
- AND this change MUST NOT add an email manage link to satisfy the claim

### Requirement: Honest Claim Copy

After a successful claim, client-facing copy MUST say the business was notified. Copy MUST NEVER say payment was received (`pago recibido` or equivalent). The hold card MUST NOT tell the client they do not need to return (`No hace falta volver acá`).

#### Scenario: Success copy after claim

- GIVEN a successful **Ya transferí**
- WHEN the hold card shows the next-steps / success copy
- THEN the copy MUST state that the business was notified
- AND the copy MUST NOT contain `pago recibido` or equivalent “payment received” language
- AND the copy MUST NOT contain `No hace falta volver acá`

#### Scenario: Copy is not a payment acknowledgement

- GIVEN an unpaid hold that the client has claimed
- WHEN the client reads public hold copy
- THEN the copy MUST NOT imply Orvel received, captured, or confirmed the money
- AND confirmation of the seña MUST remain an operator action

### Requirement: Dashboard Notification Atomic With Claim

A successful claim MUST insert a durable owner notification in `dashboard_notifications`. The structured aviso MUST NOT be a business email or `_business` outbox message. If the notification insert fails, the claim MUST fail and `deposit_status` MUST NOT remain `claim_pending` from that attempt.

#### Scenario: Claim persists notify and state together

- GIVEN a `pending` hold and a valid manage token
- WHEN the client successfully claims
- THEN the booking MUST be `claim_pending`
- AND a `dashboard_notifications` row for that booking MUST exist
- AND no business-email aviso MUST be required for the copy to be true

#### Scenario: Notify insert failure rolls back the claim

- GIVEN a `pending` hold
- WHEN the client claims but inserting `dashboard_notifications` fails
- THEN the claim MUST fail to the caller
- AND `deposit_status` MUST remain `pending`
- AND the client MUST NOT be shown “we notified the business” as a success

### Requirement: WhatsApp Is Optional And Not The Aviso

The hold card MAY keep an optional WhatsApp receipt action. WhatsApp MUST NOT be required for the structured business aviso. The dashboard notification is the aviso.

#### Scenario: Claim succeeds without WhatsApp

- GIVEN a `pending` hold and a valid manage token
- AND the client does not use WhatsApp
- WHEN the client chooses **Ya transferí**
- THEN the claim MUST succeed if notify + state change succeed
- AND the operator MUST still receive the dashboard notification

#### Scenario: WhatsApp without claim is not the structured aviso

- GIVEN a `pending` hold
- WHEN the client only uses the optional WhatsApp action and does not claim
- THEN `deposit_status` MUST remain `pending`
- AND the system MUST NOT treat WhatsApp as having notified the dashboard

### Requirement: Live Bookings Path And Non-Goals

Claim coordination MUST run on `public.bookings.deposit_status`. The system MUST NOT introduce Mercado Pago, checkout, escrow, refunds, refund copy, or an instructions-email CTA as part of this capability.

#### Scenario: Claim stays on live bookings

- GIVEN a public unpaid booking in `public.bookings`
- WHEN the client claims
- THEN the state change MUST be on that booking
- AND the operation MUST NOT require `public.appointments` or ghost `clients` tables
