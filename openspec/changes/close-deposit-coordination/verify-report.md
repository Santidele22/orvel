```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:aeda57f818c860100017ab4701ab83a263b45a28021cebb6628a1e64f37fea28
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 9/9
test_command: ~/.deno/bin/deno.exe test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts && pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts && pnpm --dir packages/booking exec vitest run src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts
test_exit_code: 0
test_output_hash: sha256:32f695934422b01eddbd5471d2c2b6dbc8ba2835da6169ff5bbd33c32fa9a4a4
build_command: pnpm --dir apps/dashboard exec tsc -p tsconfig.app.json --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: close-deposit-coordination
**Work unit**: PR 2 of 4 — Ya transferí + atomic dashboard notify (`feat/close-deposit-coordination-s2`)
**Version**: N/A (delta specs)
**Mode**: Strict TDD
**Spec counted**: `openspec/changes/close-deposit-coordination/specs/deposit-claim-coordination/spec.md` only (5 requirements, 9 scenarios). Other change specs (operator confirm, eager release, occupancy, reject) were not re-counted for this envelope.

This report does **not** claim slices 3–4 verified. Archive is **not** ready.

Slice 1 evidence is preserved below. Slice 1 remains previously verified; this envelope is for work unit 2.

### Completeness

| Metric | Value |
|--------|-------|
| Assigned slice 2 tasks (2.1–2.8) | 8/8 complete |
| Change-wide implementation tasks | 15 complete / 15 remaining |
| Slice 2 unchecked `- [ ]` | none |
| Archive readiness | not ready (remaining slices 3–4) |

Phase 2 checkboxes in `tasks.md` are `- [x]` for 2.1–2.8. No unchecked implementation markers remain inside the assigned work unit.

### Remaining scope (not this work unit)

Exact unchecked implementation lines still in `tasks.md` (archive blockers for the **change**, not slice-2 failures):

- [ ] 3.1 RED (threat): `supabase/functions/_shared/release-expired-booking-holds-static-contract.test.ts` — missing/bad `CRON_KEY` → 401 and no RPC; clone `supabase/functions/_shared/purge-elapsed-bookings-static-contract.test.ts` (read-only) / `supabase/functions/purge-elapsed-bookings/index.ts` (read-only). <!-- sdd-owner: implementation -->
- [ ] 3.2 RED (threat): `.github/workflows/release-expired-booking-holds.yml` missing `*_FUNCTION_URL` / `*_CRON_SECRET` fails like `.github/workflows/account-closure.yml` (read-only); env stays lazy. <!-- sdd-owner: implementation -->
- [ ] 3.3 GREEN: `supabase/functions/release-expired-booking-holds/index.ts` POST calls `release_expired_booking_hold(NULL, NULL)`; `supabase/config.toml` `[functions.release-expired-booking-holds]` `verify_jwt = false`. <!-- sdd-owner: implementation -->
- [ ] 3.4 GREEN: `.github/workflows/release-expired-booking-holds.yml` schedule `*/5 * * * *` + `workflow_dispatch`; no `pg_cron`. <!-- sdd-owner: implementation -->
- [ ] 3.5 TRIANGULATE: occupancy exclude `released`/`abandoned`/`void` unchanged in `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts`; timeout writes `released` not `abandoned`; `apps/shared/email-templates/appointment-templates.ts` (read-only) no refund language. <!-- sdd-owner: implementation -->
- [ ] 3.6 GREEN (optional MAY): public countdown 00:00 may RPC-release that booking from `apps/dashboard/src/app/features/booking/pages/public/public-booking-deposit-hold.ts`; clearing sessionStorage is not occupancy. <!-- sdd-owner: implementation -->
- [ ] 3.7 REFACTOR: do not rewrite `release_expired_booking_hold` body. <!-- sdd-owner: implementation -->
- [ ] 4.1 RED: `supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts` — `reject_booking_deposit_unseen(booking_id, performed_by)` → `released` not `abandoned`/`void`; evidence `operator_reject` not `claim`/`timeout_strike`; `SECURITY DEFINER` + `can_manage_business`; GRANT `authenticated, service_role` not anon. <!-- sdd-owner: implementation -->
- [ ] 4.2 GREEN: additive `supabase/migrations/<ts>_reject_booking_deposit_unseen.sql` (lazy-release first like confirm). <!-- sdd-owner: implementation -->
- [ ] 4.3 RED: `packages/booking/src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts` delegates `rejectBookingDepositUnseen({ bookingId, performedBy })` → `depositStatus: 'released'`. <!-- sdd-owner: implementation -->
- [ ] 4.4 GREEN: reject on `packages/booking/src/gateway-interface.ts`, `packages/booking/src/types.ts`, `packages/booking/src/infrastructure/supabase/real-gateway.ts`, `packages/booking/src/infrastructure/supabase/api-wrapper.ts`, `apps/dashboard/src/app/core/dashboard/dashboard.service.ts`. <!-- sdd-owner: implementation -->
- [ ] 4.5 RED: Turnos/mobile contracts in `apps/dashboard/src/app/features/booking/pages/turnos-list.consumer.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.contract.spec.ts`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts` — **no la veo** plus Confirmar seña still present. <!-- sdd-owner: implementation -->
- [ ] 4.6 GREEN: reject UI on `apps/dashboard/src/app/features/booking/pages/turnos-list.page.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-appointment-card/mobile-appointment-card.component.{ts,html}`, `apps/dashboard/src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.{ts,html}`. <!-- sdd-owner: implementation -->
- [ ] 4.7 TRIANGULATE: unauthenticated reject cannot set `released`; no strike UI; no dual-schema; `apps/shared/email-templates/appointment-templates.ts` (read-only) and `supabase/functions/process-email-outbox/index.ts` (read-only) unchanged, no refund copy. <!-- sdd-owner: implementation -->
- [ ] 4.8 REFACTOR: reject does not replace confirm; occupancy still `isDepositUnpaid`. <!-- sdd-owner: implementation -->

### Structured status and actionContext

Native engine reported `changeName: null` and `verify: blocked` because two active changes exist (`chore-docs-and-context-align-release-2-0`, `close-deposit-coordination`). Parent/user assigned `close-deposit-coordination` work unit 2. Verification proceeded on that named change only. Status was treated as authoritative for store/mode, not as a stop after explicit selection.

- `artifactStore`: openspec
- `actionContext.mode`: repo-local
- `workspaceRoot`: `C:\Users\usuario\proyectos\orvel`
- `allowedEditRoots`: repo root (no production writes in this phase except this report)
- Branch: `feat/close-deposit-coordination-s2`
- Implementation ownership for slice 2 is inside dashboard/booking/supabase files listed in apply-progress, including untracked `supabase/migrations/20260909120000_claim_booking_deposit_notify.sql`

### Build & Tests Execution

**Build**: Passed (dashboard `tsc --noEmit`; empty stdout)

```text
pnpm --dir apps/dashboard exec tsc -p tsconfig.app.json --noEmit
exit 0
```

Full config `pnpm run build` / `pnpm run check` were not run (work-unit scoped).

**Tests** (re-run this verify; all exit 0):

```text
~/.deno/bin/deno.exe test --allow-read --config supabase/functions/deno.json supabase/functions/_shared/manual-booking-deposits-static-contract.test.ts
ok | 26 passed | 0 failed
exit 0
```

```text
pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/public-booking-deposit-hold.contract.spec.ts
Test Files  1 passed (1)
     Tests  15 passed (15)
exit 0
```

```text
pnpm --dir packages/booking exec vitest run src/infrastructure/supabase/__tests__/api-wrapper.contract.spec.ts
Test Files  1 passed (1)
     Tests  5 passed (5)
exit 0
```

`test_output_hash` is SHA-256 of the concatenated captured stdout/stderr of those three commands.

**Coverage**: skipped — no coverage tool run for this work unit

### Spec Compliance Matrix

Counted spec: `deposit-claim-coordination` (slice 2).

| Requirement | Scenario | Test / evidence | Result |
|-------------|----------|-----------------|--------|
| Public Ya Transferí On The Hold Card | Client claims transfer during the hold session | Hold CTA `Ya transferí` + `claimBookingDeposit({ manageToken })`; SQL `deposit_status = 'claim_pending'` and never `'paid'` | COMPLIANT |
| Public Ya Transferí On The Hold Card | Claim without a manage token in this session | Template CTA only if `hold.manageToken && !depositClaimed()`; instructions email has no manage CTA | COMPLIANT |
| Honest Claim Copy | Success copy after claim | `DEPOSIT_HOLD_CLAIMED_COPY` = `Avisamos al negocio...`; no `pago recibido`; no `No hace falta volver acá` | COMPLIANT |
| Honest Claim Copy | Copy is not a payment acknowledgement | Claimed copy defers confirmation to the business; operator confirm remains separate | COMPLIANT |
| Dashboard Notification Atomic With Claim | Claim persists notify and state together | Migration INSERT `dashboard_notifications` `event_type='deposit.claimed'`, `appointment_id=v_booking.id` after `claim_pending` | COMPLIANT |
| Dashboard Notification Atomic With Claim | Notify insert failure rolls back the claim | No `EXCEPTION WHEN OTHERS`; page sets `depositClaimed` true only on HTTP 200 | COMPLIANT |
| WhatsApp Is Optional And Not The Aviso | Claim succeeds without WhatsApp | WhatsApp link is optional via `receiptWhatsAppUrl`; claim path does not call WhatsApp | COMPLIANT |
| WhatsApp Is Optional And Not The Aviso | WhatsApp without claim is not the structured aviso | WhatsApp remains a separate optional `<a>`; status change only via claim RPC | COMPLIANT |
| Live Bookings Path And Non-Goals | Claim stays on live bookings | RPC updates `public.bookings`; no Mercado Pago / dual-schema / email manage CTA | COMPLIANT |

**Compliance summary**: 9/9 scenarios on the assigned spec for this work unit.

### Correctness (Static Evidence)

| Check | Status | Notes |
|-------|--------|-------|
| Ya transferí CTA | Implemented | `public-booking.page.html` `data-testid="booking-deposit-claim"` gated on session `hold.manageToken` |
| manageToken source | Implemented | `readPublicDepositHold` stores token; persist/restore via sessionStorage; `claimDepositTransfer` uses `this.depositHold()?.manageToken` |
| claim RPC never paid | Implemented | Migration sets `claim_pending` only; Deno contract forbids `deposit_status = 'paid'` |
| dashboard_notifications | Implemented | `event_type='deposit.claimed'`, `appointment_id=v_booking.id` |
| No EXCEPTION WHEN OTHERS | Implemented | Migration function body has none; Deno asserts absence |
| Honest copy | Implemented | `Avisamos al negocio...`; combined UI forbids `pago recibido` and `No hace falta volver acá` |
| WhatsApp optional | Implemented | Helper unchanged; receipt link only when phone maps to wa.me |
| Gateway claim | Implemented | types, gateway-interface, real-gateway RPC `claim_booking_deposit`, api-wrapper, dashboard.service wrapper, infrastructure barrel |
| Untracked migration counted | Yes | `supabase/migrations/20260909120000_claim_booking_deposit_notify.sql` (87 lines) in-scope |
| Authored size | Under budget | Tracked 12 files, 225 insertions, 8 deletions plus 87-line untracked migration (~312 lines) |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Notify INSERT inside `claim_booking_deposit`, no swallow | Yes | Additive migration, same function/transaction |
| Hold card uses session `manageToken` | Yes | Public page calls `claimBookingDeposit` from `@orvel/booking/infrastructure` |
| WhatsApp optional, not the aviso | Yes | |
| Flip locked stay-away copy | Yes | Combined UI no longer contains `No hace falta volver acá` |
| Claim never `paid` | Yes | |
| Barrel export of `claimBookingDeposit` | Deviation (recorded) | `packages/booking/src/infrastructure/index.ts` required so dashboard can import |
| `DashboardService.claimBookingDeposit` | Wired but unused by public CTA | Public page uses infrastructure directly; service wrapper exists for 2.4 |

### Review Workload / PR Boundary

- Forecast: chained PRs, `ask-on-risk`, `stacked-to-main`, High 400-line risk
- Slice 2 assigned and implemented only (PR 2 of 4)
- `size:exception` not used
- Authored production+test diff under 400 including untracked notify migration
- No scope creep into slices 3–4 (no reject RPC, no eager-release function/workflow)
- Did not commit (per apply-progress and this verify)

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | `TDD Cycle Evidence (work unit 2)` table in apply-progress |
| All slice-2 tasks have tests | Yes | 8/8 rows name test files that exist |
| RED confirmed (tests exist) | Yes | Deno static, api-wrapper contract, hold contract exist on disk |
| GREEN confirmed (tests pass) | Yes | Deno 26/26, dashboard 15/15, booking 5/5 |
| Triangulation adequate | Yes | with/without note; notify after claim_pending; copy + WhatsApp optional; no email manage CTA |
| Safety Net for modified files | Yes | Apply-progress records hold 12/12, wrapper 4/4, Deno existing 25/25 before production edits |

**TDD Compliance**: 6/6 checks passed for slice 2

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 0 new isolated pure-function-only files | 0 | — |
| Integration | 0 | 0 | not used |
| E2E | 0 | 0 | playwright not in this work unit |
| Contract / SQL static | Deno 26 (file total; notify cases added), dashboard 15, booking 5 | 3 | deno test, vitest |
| **Total focused re-run** | **46** | **3** | |

### Changed File Coverage

Coverage analysis skipped — no coverage tool run.

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `public-booking-deposit-hold.contract.spec.ts` | new claim cases | `readFileSync` + `toContain` / `toMatch` | Contract-layer source locks, not live RPC execution; matches repo `.contract.spec.ts` pattern | WARNING |
| `manual-booking-deposits-static-contract.test.ts` | WU2 notify test | regex over concatenated migrations | Static SQL lock, not a live INSERT failure; rollback is inferred from no EXCEPTION swallow | WARNING |
| `public-booking-deposit-hold.contract.spec.ts` | countdown suite | `toContain('#F59E0B')` / `'#7C3AED'` | Pre-existing CSS-token lock | WARNING |

No tautologies, ghost loops, type-only-only assertions, or smoke-only new tests. New slice-2 cases assert CTA copy, `claimBookingDeposit`, `deposit.claimed`, `appointment_id` = booking id, and withheld success copy unless status 200.

**Assertion quality**: 0 CRITICAL, 3 WARNING

### Quality Metrics

**Linter**: skipped — not run
**Type Checker**: no errors (`tsc -p tsconfig.app.json --noEmit` exit 0)

### Issues Found

**CRITICAL**: None for work unit 2.

**WARNING**:
- Remaining phases 3–4 are unchecked; this is remaining scope. Archive is not ready.
- Notify rollback is proven by static SQL (no EXCEPTION swallow) plus UI withholding `depositClaimed` unless HTTP 200; no live Postgres insert-failure test.
- `claimDepositError` is set on failed claim but is not rendered in `public-booking.page.html` (success copy is still withheld).
- Public CTA does not call `DashboardService.claimBookingDeposit` (infrastructure import instead).
- Native status listed a second active change; this report is only `close-deposit-coordination` slice 2.
- Some hold-card contract tests still lock hex color tokens.

**SUGGESTION**: None.

### Verdict

PASS WITH WARNINGS for work unit 2 (PR 2 of 4). Slice 2 tasks 2.1–2.8 are complete; focused tests Deno 26, dashboard 15, booking 5 all passed; authored diff under 400 including untracked notify migration. Slices 3–4 are not verified. Archive is not ready.

---

## Work unit 1 evidence (preserved)

Previous envelope (slice 1, not this verify's counts):

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

**Work unit**: PR 1 of 4 — Turnos confirm + split labels (`feat/close-deposit-coordination-s1`)
**Spec counted then**: `deposit-operator-confirm` (5 requirements, 9 scenarios)

Slice 1 tasks 1.1–1.7 were complete. Focused vitest 5 files / 82 passed. Authored production+test diff 12 files, 173 insertions, 13 deletions under 400. Confirm reuses `DashboardService.confirmDepositReceived`. Labels: pending `Pendiente de seña`, claim_pending `Seña avisada`. Inicio confirm kept. No claim CTA, reject, migrations, or cron in that slice.

Slice 1 TDD evidence table and 82-pass command remain valid historical evidence and were not re-executed in this work-unit-2 verify.
