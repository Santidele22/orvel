# Archive: PWA offline walk-in queue (Fase 3 deferred post-MVP)

## Why archived

The diagrams in this folder describe the PWA offline walk-in queue flow (Fase 3 of release 1.0.3) and the corresponding IndexedDB state machine. Per maintainer decision 2026-08-13, PWA offline capabilities were deferred post-MVP. The corresponding change folder was archived at `openspec/changes/archive/2026-08-13-release-1-0-3-pwa/` on the same date.

The diagrams are kept here as a historical reference for any future re-proposal of offline-first booking. They are accurate against the original spec (release-1-0-3-pwa/specs/pwa-offline-walkin-queue/spec.md, archived) but do **not** reflect the MVP target state of `dev`.

## What it shows

- `04-pwa-offline-walkin-queue.mmd`: sequence diagram of the offline walk-in path (operator enqueues → IDB persist → `online` event auto-flush / manual "Enviar ahora" button on iOS → `create_admin_manual_booking` with `p_intent_id` overload → conflict toast + drop on `SLOT_CONFLICT`).
- `04-pwa-offline-walkin-queue-state.mmd`: state diagram of the per-intent state machine (`pending` → `syncing` → `synced` | `failed`, with bounded retry 1s/4s/16s and exhaustion after 3 attempts).

## Precedent

Archive convention follows the same pattern as `openspec/changes/archive/2026-08-13-release-1-0-3-pwa/` (commit context).

## Date

2026-08-13
