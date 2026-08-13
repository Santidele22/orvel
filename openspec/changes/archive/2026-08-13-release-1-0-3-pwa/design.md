# Design: Release 1.0.3 — PWA Mobile-First (Fase 3 + Fase 4)

## 1. Overview

Fase 3 wraps an IndexedDB-backed offline walk-in queue around the admin walk-in path (`TurnoService.createAdminManualBooking()` → RPC `create_admin_manual_booking`). Fase 4 adds Playwright mobile projects + Lighthouse CI gate. Respects Q1–Q5.

**Spec/code correction**: spec writes `create_public_booking`; the admin walk-in path actually calls `create_admin_manual_booking(uuid, text, text, integer, text, text, text, uuid, text, uuid)` (verified at `turno.service.ts:211` and `20260609142000_fix_admin_manual_booking_manage_token.sql:6`). D-1 applies to `create_admin_manual_booking`. See Q-OWQ-RPC-1.

## 2. Architecture Decisions

### D-1 — Idempotency

| Option | Tradeoff | Decision |
|---|---|---|
| A. New `create_admin_manual_booking(..., p_intent_id)` overload + server `walkin_intents` ledger; idempotent insert inside RPC | Cleanest contract; survives client crash mid-flush; preserves 10-arg overload (zero downtime) | **Chosen** |
| B. App-side `walkin_intents` check before RPC | TOCTOU race; double round-trip | Rejected |
| C. Drop idempotency | Double-booking on retry; violates REQ-OWQ-5 | Rejected |

**Q3 reconciliation**: the ledger is a one-row-per-`intent_id` dedupe record — queue UI never reads it, no manager role implied. Q3 holds.

### D-2 — IndexedDB

Raw IndexedDB in `WalkinQueueStorage` (no `idb` library — matches booking/data-access style). DB `orvel-walkin-queue` v1; store `intents` keyed by `intentId` (UUID v4, client-generated); indexes `status`, `createdAt`, `attempts`. Forward-only `onupgradeneeded`. Attempts cap 3 (REQ-OWQ-7); `storage.estimate() > 80%` warn; graceful `versionchange` close.

### D-3 — Service worker boundary

**Page context only**, per REQ-OWQ-9. iOS Background Sync API absent (roadmap #6), so SW-side flush adds no iOS benefit. Trade-off: iOS users keep the PWA foregrounded for auto-flush; "Enviar ahora" (REQ-OWQ-4) is the documented UX.

### D-4 — Playwright mobile CI

Add `iPhone 13` and `Pixel 5` projects to root `playwright.config.ts`. New `.github/workflows/dashboard-mobile-regressions.yml` mirrors `booking-regression.yml` (Ubuntu, `pnpm@11.0.8`, Node 24, branches `dev`+`main`); job `dashboard-mobile-regressions` matches the protected-branch required-check pattern.

### D-5 — Lighthouse CI

`treosh/lighthouse-ci-action@v12` + pinned `@lhci/cli@0.13.x`. New `lighthouse-pwa-gate` job: build, 3 runs, median; `assert.categories.pwa >= 0.90` blocks (Q4); others advisory. Baselines **TBD** — sdd-apply records after one local dry run.

## 3. Components

All under `apps/dashboard/src/app/core/offline/`: `WalkinQueueStorage` (raw IDB wrapper), `WalkinQueueFlushService` (`online` + manual listener → `TurnoService.createAdminManualBooking(...,{intentId})` with REQ-OWQ-6/7 transitions), `WalkinQueueService` (public API: `enqueue`, `observeQueue`, `flushNow`), `WalkinDeviceIdService` (REQ-OWQ-10, never sent). UI: `apps/dashboard/src/app/features/turnos/queue/walkin-queue.component.{ts,html,scss}` (pill + "Enviar ahora", test-id `walkin-queue-pill`). Migration + check: `supabase/migrations/20260807000000_walkin_intent_idempotency.sql` + `supabase/checks/...contract.test.mjs`. CI: `.github/workflows/dashboard-mobile-regressions.yml` (Playwright iPhone+Pixel + Lighthouse).

## 4. Data Model

### IndexedDB `intents` store (D-2)

| Field | Type | Notes |
|---|---|---|
| `intentId` | string UUID v4 | keyPath; client-generated |
| `customerName`, `serviceId`, `startAt`, `notes?` | string | walk-in payload |
| `status` | `pending\|syncing\|synced\|failed` | indexed |
| `attempts` | number ≤ 3 | indexed |
| `lastError?` | string | populated on `failed` |
| `createdAt` | ISO 8601 | indexed; flush order |
| `deviceId` | string UUID | REQ-OWQ-10; never sent |

### Server ledger + RPC overload (D-1 option A)

```sql
CREATE TABLE public.walkin_intents (
  intent_id uuid PRIMARY KEY, business_id uuid NOT NULL,
  appointment_id uuid, status text NOT NULL CHECK (status IN ('pending','processed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.walkin_intents DISABLE ROW LEVEL SECURITY;

-- New additive overload (preserves existing 10-arg signature):
CREATE OR REPLACE FUNCTION public.create_admin_manual_booking(
  business_id uuid, branch_id text, service_id text, starts_at_iso text,
  duration_minutes integer, client_id text, walk_in_name text,
  professional_id text, performed_by text, notes text,
  p_intent_id uuid DEFAULT NULL
) RETURNS TABLE (booking_id uuid, status text) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_existing uuid; v_booking uuid;
BEGIN
  IF p_intent_id IS NOT NULL THEN
    SELECT appointment_id INTO v_existing FROM public.walkin_intents
      WHERE intent_id = p_intent_id AND status = 'processed';
    IF v_existing IS NOT NULL THEN RETURN QUERY SELECT v_existing, 'confirmed'::text; RETURN; END IF;
  END IF;
  -- [existing 10-arg body unchanged] → v_booking
  IF p_intent_id IS NOT NULL THEN
    INSERT INTO public.walkin_intents (intent_id, business_id, appointment_id, status)
      VALUES (p_intent_id, business_id, v_booking, 'processed')
      ON CONFLICT (intent_id) DO NOTHING;
  END IF;
  RETURN QUERY SELECT v_booking, 'confirmed'::text;
END $$;
GRANT EXECUTE ON FUNCTION public.create_admin_manual_booking(
  uuid, text, text, text, integer, text, text, text, text, text, uuid
) TO authenticated, service_role;
```

Contract test follows `supabase/checks/20260724012000_booking_respects_knobs.contract.test.mjs`: regex-assert overload signature, idempotent branch, GRANT.

## 5. Sequence (text)

```
OFFLINE → SYNCED:   submit → enqueue(pending) → IDB.persist()
  online event → flush iterates by createdAt → syncing
  → create_admin_manual_booking(..., p_intent_id) → walkin_intents upsert (atomic)
  → 2xx → synced → counter--

OFFLINE → COLLISION (REQ-OWQ-6, Q2):  POST 4xx SLOT_CONFLICT
  → failed → counter-- → toast('Ese horario ya fue reservado...')  → MUST NOT retry, draft, or modal

OFFLINE SHELL (REQ-MV-4c):  /dashboard/turnos offline → SW intercepts → cache:app
  → shell renders (bottom-nav, FAB, queue pill shows cached count)
```

## 6. Testing Strategy

Strict TDD: RED `.red.contract.spec.ts` lands before each GREEN (matches `turno-m2-admin-new-turno-ux.red.contract.spec.ts` pattern).

- **Unit RED** — `walkin-queue-storage` (IDB round-trip, keyPath, indexes, status filter), `walkin-queue-flush` (online trigger, retry 1s/4s/16s, exhaustion→failed, collision→toast+drop, shared manual path), `walkin-device-id` (UUID stable, no PII, never sent).
- **Contract RED** — `walkin-queue-ui` (pill renders, "Enviar ahora" wired, lg:hidden), `pwa-mobile-offline-shell` (SW registers, offline nav renders cached shell).
- **Migration contract** — `supabase/checks/...walkin_intent_idempotency.contract.test.mjs` regex-asserts D-1 SQL.
- **E2E** — `tests/e2e/walkin-offline.spec.ts` on iPhone 13 + Pixel 5: nav, pill, offline persist, online flush, collision toast.
- **Lighthouse** — workflow `lighthouse-pwa-gate` job: PWA ≥ 90 blocks; others advisory.

## 7. Rollout / Migration

1. **Migration**: `supabase/migrations/20260807000000_walkin_intent_idempotency.sql` (D-1 additive overload) + RED contract.
2. **Fase 3 PR 1** (~350 lines): storage + flush + services + RED specs.
3. **Fase 3 PR 2** (~250 lines): UI component + nav badge + TurnoFormPage integration.
4. **Fase 4 PR** (~200 lines): Playwright projects + new CI workflow + Lighthouse baseline (TBD dry-run recorded in workflow file).

**No PWA feature flag in MVP** (per proposal §Rollback). D-1 migration is forward-compatible (additive overload). Any PR over 400 lines → `sdd-tasks` splits before apply.

## 8. Risks

- **IDB eviction** — attempts cap (REQ-OWQ-7); `storage.estimate()` warn at 80%; pill shows eviction error.
- **iOS storage limits** (~1 GB iOS 17+) — documented in code; attempt cap covers worst case.
- **Multi-device race** — `intentId` per-device; server ledger dedupes; two devices → two `intent_id`s, at most one wins the slot, the other goes `failed` (Q2).
- **Spec/code mismatch** (`create_public_booking` vs `create_admin_manual_booking`) — Q-OWQ-RPC-1.
- **400-line budget** — each phase forecast ≤ 350; sdd-tasks splits if needed.

## 9. Open Questions for sdd-tasks

- **Q-OWQ-RPC-1** — Confirm idempotency on `create_admin_manual_booking`; update spec REQ-OWQ-3/5 wording.
- **Q-OWQ-UI-1** — Bottom-nav badge vs 6th nav item for the queue screen.
- **Q-OWQ-LH-1** — Record baseline Lighthouse scores from one local dry run; pin exact `@lhci/cli` version.
- **Q-OWQ-CI-1** — Confirm `dashboard-mobile-regressions` joins the protected-branch required-check list (Q5 + AGENTS.md §3-environment promotion).
