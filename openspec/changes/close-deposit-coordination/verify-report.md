```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e8dd09f350f42c40e043db63cb0e8fb98fbad5a468b47e20a91b5b2da8b81f11
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 9/9
test_command: pnpm --dir apps/dashboard exec vitest run src/app/core/dashboard/__tests__/dashboard.service.spec.ts src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts src/app/features/dashboard-home/pages/dashboard-home-page-mobile-summary.contract.spec.ts
test_exit_code: 0
test_output_hash: sha256:fcba303d7d939a4f7b89c094ae63a309cddc25400e4a758899b32e812f29571a
build_command: pnpm --dir apps/dashboard exec tsc -p tsconfig.app.json --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: close-deposit-coordination
**Work unit**: PR 1 of 4 — Turnos confirm + split labels (`feat/close-deposit-coordination-s1`)
**Version**: N/A (delta specs)
**Mode**: Strict TDD
**Spec counted**: `openspec/changes/close-deposit-coordination/specs/deposit-operator-confirm/spec.md` only (5 requirements, 9 scenarios). Other change specs (claim, eager release, occupancy, reject) were not verified.

This report does **not** claim slices 2–4 verified. Archive is **not** ready.

### Completeness

| Metric | Value |
|--------|-------|
| Assigned slice 1 tasks (1.1–1.7) | 7/7 complete |
| Change-wide implementation tasks | 7 complete / 23 remaining |
| Slice 1 unchecked `- [ ]` | none |
| Archive readiness | not ready (remaining slices) |

Phase 1 checkboxes in `tasks.md` are `- [x]` for 1.1–1.7. No unchecked implementation markers remain inside the assigned work unit.

### Remaining scope (not this work unit)

Exact unchecked implementation lines still in `tasks.md` (archive blockers for the **change**, not slice-1 failures):

- [ ] 2.1 RED: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — `claim_booking_deposit` INSERT `dashboard_notifications` `event_type='deposit.claimed'`, `appointment_id`=booking id, no `EXCEPTION WHEN OTHERS`, never `paid`, no `_business` outbox. <!-- sdd-owner: implementation -->
- [ ] 2.2 GREEN: additive `supabase/migrations/<ts>_claim_booking_deposit_notify.sql` (same transaction as status). <!-- sdd-owner: implementation -->
- [ ] 2.3 RED: `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` delegates `claimBookingDeposit({ manageToken, note? })`. <!-- sdd-owner: implementation -->
- [ ] 2.4 GREEN: add claim on `packages/booking/src/gateway-interface.ts`, `packages/booking/src/types.ts`, `packages/booking/src/infrastructure/supabase/real-gateway.ts`, `packages/booking/src/infrastructure/supabase/api-wrapper.ts`, `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`. <!-- sdd-owner: implementation -->
- [ ] 2.5 RED: `apps/dashboard/src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts` — Ya transferí; unlock `No hace falta volver acá`; no `pago recibido`; WhatsApp optional not the aviso. <!-- sdd-owner: implementation -->
- [ ] 2.6 GREEN: CTA in `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts` and `apps/dashboard/src/app/features/booking/pages/public/public-booking.page.{ts,html}` using session `manageToken`. <!-- sdd-owner: implementation -->
- [ ] 2.7 TRIANGULATE: notify insert fail ⇒ claim fails, stay `pending`, no success “avisamos”; no instructions-email manage CTA. <!-- sdd-owner: implementation -->
- [ ] 2.8 REFACTOR: keep WhatsApp helper optional; copy constants only in hold module. <!-- sdd-owner: implementation -->
- [ ] 3.1 RED (threat): `supabase/functions/_shared/release-expired-booking-holds-static-contract.test.ts` — missing/bad `CRON_KEY` → 401 and no RPC; clone `supabase/functions/_shared/purge-elapsed-bookings-static-contract.test.ts` (read-only) / `supabase/functions/purge-elapsed-bookings/index.ts` (read-only). <!-- sdd-owner: implementation -->
- [ ] 3.2 RED (threat): `.github/workflows/release-expired-booking-holds.yml` missing `*_FUNCTION_URL` / `*_CRON_SECRET` fails like `.github/workflows/account-closure.yml` (read-only); env stays lazy. <!-- sdd-owner: implementation -->
- [ ] 3.3 GREEN: `supabase/functions/release-expired-booking-holds/index.ts` POST calls `release_expired_booking_hold(NULL, NULL)`; `supabase/config.toml` `[functions.release-expired-booking-holds]` `verify_jwt = false`. <!-- sdd-owner: implementation -->
- [ ] 3.4 GREEN: `.github/workflows/release-expired-booking-holds.yml` schedule `*/5 * * * *` + `workflow_dispatch`; no `pg_cron`. <!-- sdd-owner: implementation -->
- [ ] 3.5 TRIANGULATE: occupancy exclude `released`/`abandoned`/`void` unchanged in `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts`; timeout writes `released` not `abandoned`; `apps/shared/email-templates/appointment-templates.ts` (read-only) no refund language. <!-- sdd-owner: implementation -->
- [ ] 3.6 GREEN (optional MAY): public countdown 00:00 may RPC-release that booking from `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts`; clearing sessionStorage is not occupancy. <!-- sdd-owner: implementation -->
- [ ] 3.7 REFACTOR: do not rewrite `release_expired_booking_hold` body. <!-- sdd-owner: implementation -->
- [ ] 4.1 RED: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — `reject_booking_deposit_unseen(booking_id, performed_by)` → `released` not `abandoned`/`void`; evidence `operator_reject` not `claim`/`timeout_strike`; `SECURITY DEFINER` + `can_manage_business`; GRANT `authenticated, service_role` not anon. <!-- sdd-owner: implementation -->
- [ ] 4.2 GREEN: additive `supabase/migrations/<ts>_reject_booking_deposit_unseen.sql` (same transaction as status). <!-- sdd-owner: implementation -->
- [ ] 4.3 RED: `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` delegates `rejectBookingDepositUnseen({ bookingId, performedBy })` → `depositStatus: 'released'`. <!-- sdd-owner: implementation -->
- [ ] 4.4 GREEN: reject on `packages/booking/src/gateway-interface.ts`, `packages/booking/src/types.ts`, `packages/booking/src/infrastructure/supabase/real-gateway.ts`, `packages/booking/src/infrastructure/supabase/api-wrapper.ts`, `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`. <!-- sdd-owner: implementation -->
- [ ] 4.5 RED: Turnos/mobile contracts in `apps/dashboard/src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts` — **no la veo** plus Confirmar seña still present. <!-- sdd-owner: implementation -->
- [ ] 4.6 GREEN: reject UI on `apps/dashboard/src/app/features/booking/pages/turnos-list.page.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.component.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.{ts,html}`. <!-- sdd-owner: implementation -->
- [ ] 4.7 TRIANGULATE: unauthenticated reject cannot set `released`; no strike UI; no dual-schema; `apps/shared/email-templates/appointment-templates.ts` (read-only) and `supabase/functions/process-email-outbox/index.ts` (read-only) unchanged, no refund copy. <!-- sdd-owner: implementation -->
- [ ] 4.8 REFACTOR: reject does not replace confirm; occupancy still `isDepositUnpaid`. <!-- sdd-owner: implementation -->

### Structured status and actionContext

Native engine initially reported ambiguous selection (`chore-docs-and-context-align-release-2-0`, `close-deposit-coordination`) with `changeName: null` and `verify: blocked`. Parent/user assigned `close-deposit-coordination` work unit 1. Verification proceeded on that named change.

- `artifactStore`: openspec
- `actionContext.mode`: repo-local
- `workspaceRoot`: `C:\Users\usuario\proyectos\orvel`
- `allowedEditRoots`: repo root (no writes in this phase except this report)
- Implementation ownership for slice 1 is inside the dashboard/booking files listed in apply-progress

### Build & Tests Execution

**Build**: Passed (dashboard `tsc --noEmit`; empty stdout)

```text
pnpm --dir apps/dashboard exec tsc -p tsconfig.app.json --noEmit
exit 0
```

Full config `pnpm run build` / `pnpm run check` were not run (work-unit scoped).

**Tests**: 5 files, 82 passed, 0 failed

```text
pnpm --dir apps/dashboard exec vitest run src/app/core/dashboard/__tests__/dashboard.service.spec.ts src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts src/app/features/dashboard-home/pages/dashboard-home-page-mobile-summary.contract.spec.ts
Test Files  5 passed (5)
     Tests  82 passed (82)
exit 0
```

**Coverage**: skipped — no coverage tool run for this work unit

### Spec Compliance Matrix

Counted spec: `deposit-operator-confirm` (slice 1).

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Confirm Seña On Turnos List And Detail | Operator confirms from Turnos list | `turnos-list.consumer.contract.spec.ts` + `mobile-appointment-card.contract.spec.ts` Confirmar seña via `DashboardService.confirmDepositReceived` | COMPLIANT |
| Confirm Seña On Turnos List And Detail | Operator confirms from Turnos detail | `mobile-turno-detail.consumer.contract.spec.ts` Confirmar seña via `confirmDepositReceived` | COMPLIANT |
| Confirm Available On Both Unpaid States | Confirm a waiting hold | `dashboard.service.spec.ts` pending → `Pendiente de seña` + `depositPending: true`; UI gated by `isDepositUnpaid` / `depositPending` | COMPLIANT |
| Confirm Available On Both Unpaid States | Confirm a claimed hold | `dashboard.service.spec.ts` claim_pending → `Seña avisada` + `depositPending: true`; confirm still gated by `isDepositUnpaid` | COMPLIANT |
| Never Auto-Confirm | Client claim does not confirm | Turnos + Inicio contracts forbid `claimBookingDeposit`; no claim CTA in slice 1 surfaces | COMPLIANT (negative lock; claim RPC not in this slice) |
| Split Unpaid Labels And Highlight Claimed | Waiting hold badge | pending label `Pendiente de seña`; must not imply claimed | COMPLIANT |
| Split Unpaid Labels And Highlight Claimed | Claimed hold badge highlighted | `Seña avisada` + `data-testid="deposit-claimed-highlight"` on list, card, detail | COMPLIANT |
| Split Unpaid Labels And Highlight Claimed | Slice 1 ships before any claimed holds exist | Confirm appears for pending; highlight is source-present and may have no rows | COMPLIANT |
| Live Bookings Path Only | Confirm does not depend on dual-schema tables | Reuses existing `DashboardService.confirmDepositReceived` → `confirmBookingDepositReceived`; `dashboard.service.ts` unmodified | COMPLIANT (reuse; email side-effect not re-executed in focused suite) |

**Compliance summary**: 9/9 scenarios on the assigned spec for this work unit.

### Correctness (Static Evidence)

| Check | Status | Notes |
|-------|--------|-------|
| Confirmar seña on Turnos list | Implemented | `turnos-list.page.html` button; `turnos-list.page.ts` calls `dashboardService.confirmDepositReceived` |
| Confirmar seña on mobile card | Implemented | `mobile-appointment-card` with `stopPropagation` |
| Confirmar seña on mobile detail | Implemented | `mobile-turno-detail.component` |
| Labels pending / claim_pending | Implemented | `appointmentStatusLabel`: `Pendiente de seña` / `Seña avisada` |
| `isDepositUnpaid` gates both | Implemented | `pending \|\| claim_pending`; UI uses `depositPending` / `isDepositUnpaid` |
| Inicio confirm kept | Implemented | `dashboard-home.page.{ts,html}` not in git diff; contract still requires Confirmar seña |
| No auto-confirm | Implemented | No claim CTA; `claimBookingDeposit` absent on slice 1 surfaces |
| No reject | Implemented | No `no la veo` / `rejectBookingDepositUnseen` in slice 1 files |
| No migrations | Implemented | No SQL/migration files in slice 1 diff |
| Authored size | Under budget | `12 files, 173 insertions, 13 deletions` (OpenSpec excluded) |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Reuse `DashboardService.confirmDepositReceived` | Yes | No second confirm client |
| Split labels; keep `isDepositUnpaid` | Yes | `booking-record.ts` one-line split; `index.ts` not edited |
| Inicio confirm stays | Yes | Home pages untouched |
| Slice 1 highlight may be a no-op until slice 2 | Yes | `deposit-claimed-highlight` present |
| Claim notify / reject / cron | Out of scope | Not implemented (correct for PR 1) |

### Review Workload / PR Boundary

- Forecast: chained PRs, `ask-on-risk`, `stacked-to-main`, High 400-line risk
- Slice 1 assigned and implemented only
- `size:exception` not used
- Authored production+test diff 173/13 under 400
- No scope creep into slices 2–4 (no claim CTA, reject, migrations, cron)
- Did not commit (per apply-progress and this verify)

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | `TDD Cycle Evidence` table in apply-progress |
| All slice-1 tasks have tests | Yes | 7/7 rows name test files that exist |
| RED confirmed (tests exist) | Yes | Named contract/unit files exist on disk |
| GREEN confirmed (tests pass) | Yes | Focused vitest 82/82 exit 0 |
| Triangulation adequate | Yes | pending vs claim_pending; list + card + detail; Inicio lock |
| Safety Net for modified files | Yes | Apply-progress records 75/75 focused before production edits |

**TDD Compliance**: 6/6 checks passed for slice 1

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 19 (file total; 2 new label cases) | 1 | vitest |
| Integration | 0 new | 0 | vitest + testing-library (not used here) |
| E2E | 0 | 0 | playwright not in this work unit |
| Contract | 63 across 4 files (new cases mixed with existing) | 4 | vitest + source read |
| **Total focused run** | **82** | **5** | |

### Changed File Coverage

Coverage analysis skipped — no coverage tool run.

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `mobile-appointment-card.contract.spec.ts` | ~93 | `toMatch(/bg-warning/)` | Pre-existing CSS-class lock; behavior also covered by label text | WARNING |
| Turnos/mobile contract specs | new cases | `readFileSync` + `toContain` | Contract-layer source locks, not RPC execution; matches repo `.contract.spec.ts` pattern | WARNING |

No tautologies, ghost loops, type-only-only assertions, or smoke-only new tests. New slice-1 cases assert labels, `isDepositUnpaid`, `confirmDepositReceived`, and `data-testid="deposit-claimed-highlight"`.

**Assertion quality**: 0 CRITICAL, 2 WARNING

### Quality Metrics

**Linter**: skipped — not run
**Type Checker**: no errors (`tsc -p tsconfig.app.json --noEmit` exit 0)

### Issues Found

**CRITICAL**: None for work unit 1.

**WARNING**:
- Remaining phases 2–4 are unchecked; this is remaining scope. Archive is not ready.
- Confirm email and live `public.bookings` mutation are inherited from existing `confirmDepositReceived`; focused suite did not re-run gateway/SQL tests.
- Some contract tests still lock Tailwind classes (`bg-warning`).
- Native status listed a second active change; this report is only `close-deposit-coordination` slice 1.

**SUGGESTION**: None.

### Verdict

PASS WITH WARNINGS for work unit 1 (PR 1 of 4). Slice 1 tasks 1.1–1.7 are complete; focused tests 82 passed; authored diff under 400. Slices 2–4 are not verified. Archive is not ready.
