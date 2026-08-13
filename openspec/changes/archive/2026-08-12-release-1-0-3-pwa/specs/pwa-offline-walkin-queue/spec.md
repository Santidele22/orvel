# pwa-offline-walkin-queue Specification

> **Revision 1**: RPC name corrected to `create_admin_manual_booking` based on design.md D-1 verification at turno.service.ts:211.

## Purpose

Fase 3 offline walk-in queue (proposal §2.2). Buffers walk-in creations only (Q1), per-device storage (Q3).

## Requirements

### REQ-OWQ-1: IndexedDB Persistence

Walk-in intents MUST persist in IndexedDB. Schema: `intentId` (UUID), `customerName`, `serviceId`, `startAt`, `notes?`, `status` ∈ {pending, syncing, synced, failed}, `attempts`, `lastError?`, `createdAt`, `deviceId`. MUST survive reload and SW restart.

### REQ-OWQ-2: Enqueue on Offline Submit

On walk-in submit while `navigator.onLine === false`, MUST persist intent as `pending`, increment queue counter, and MUST NOT POST.

### REQ-OWQ-3: Online Auto-Flush

On `online` event, MUST iterate pending intents by `createdAt`, POST each to `create_admin_manual_booking`, mark `syncing` in-flight, `synced` on 2xx, or apply REQ-OWQ-7 on error.

### REQ-OWQ-4: iOS Manual Flush

"Enviar ahora" button MUST trigger the same flush as REQ-OWQ-3 (shared path for Chrome + iOS).

### REQ-OWQ-5: Idempotency

POSTs MUST include `intent_id` header matching local `intentId`. RPC MAY use for deduplication.

### REQ-OWQ-6: Collision Handling

Per Q2: on 4xx conflict, MUST mark `failed`, toast ("Ese horario ya fue reservado. Cargalo de nuevo si todavía la clienta está."), remove from counter. MUST NOT retry, draft, or inline modal.

### REQ-OWQ-7: Retry Policy

Transient errors (timeout, 5xx) MUST retry with backoff: 1s, 4s, 16s (3 max). Exhaustion → `failed`. MUST NOT retry 4xx.

### REQ-OWQ-8: Queue UI

Screen MUST list pending/failed intents with manual retry (subject to REQ-OWQ-6).

### REQ-OWQ-9: Service Worker Boundary

IndexedDB MUST run from page context only. Trade-off: requires dashboard open.

### REQ-OWQ-10: Privacy

`deviceId` MUST be a stable UUID in `localStorage` with no PII. MUST NOT send to Supabase (not needed per Q3).

## Scenarios

#### Scenario: Offline submit queues walk-in

- GIVEN walk-in form, device offline
- WHEN operator fills fields and submits
- THEN intent persisted as `pending`, counter increments

#### Scenario: Online event auto-flushes

- GIVEN one pending intent
- WHEN `online` event fires
- THEN intent POSTs to `create_admin_manual_booking`; on 2xx marked `synced`, removed from counter

#### Scenario: iOS manual flush

- GIVEN pending intents, device online
- WHEN operator taps "Enviar ahora"
- THEN shared flush executes; synced intents disappear

#### Scenario: Slot collision drops walk-in

- GIVEN pending intent, device comes online
- WHEN POST returns 4xx slot conflict
- THEN intent `failed`, toast appears, NOT retried

#### Scenario: Transient error retries with backoff

- GIVEN pending intent, first two POSTs timeout
- WHEN 4s retry succeeds
- THEN intent marked `synced`

#### Scenario: Retry exhaustion

- GIVEN pending intent, persistent 5xx
- WHEN all 3 attempts fail
- THEN intent `failed`, visible in queue UI

#### Scenario: Intent survives page reload

- GIVEN intent saved as `pending`
- WHEN operator reloads page
- THEN intent present with all fields intact

## Out of Scope

Cross-device sync (Q3), non-walk-in ops (Q1), Web Push (deferred), iOS Background Sync (unsupported), manager shared-queue (Q3).

## Acceptance Criteria

- [ ] Offline submit persists across reload.
- [ ] `online` auto-flushes by `createdAt`.
- [ ] "Enviar ahora" visible and functional.
- [ ] Conflict → toast + drop (no modal/draft).
- [ ] 3 retries: 1s, 4s, 16s.
- [ ] No IndexedDB from SW scope.
- [ ] `deviceId`: UUID, no PII, not sent to Supabase.
