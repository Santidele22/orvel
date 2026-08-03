# Design: Orvel Email Outbox Cleanup (PR-c2)

## Technical Approach

Deletion-driven cleanup removing every runtime reference to `notification_email_outbox` (table dropped in Phase 2) and its deleted Edge Function `process-email-outbox`. No replacement — c3 owns the signup rewrite. Two sequential work-units: `wu-c2.1` dashboard purge + `wu-c2.2` landing blocks + CI grep guard + skip deletions. Six red-contract tests invert to "outbox absent" semantics; one active boundary test is `git rm`'d; eight `.skip.*` legacy tests deleted; two production modules deleted; two landing endpoints trimmed. New CI grep step enforces zero matches post-merge. Mirror slop at `apps/dashboard/supabase/migrations/20260420121000_booking_core_schema.sql:93` is excluded (separate infra PR).

## Architecture Decisions

| # | Decision | Options (chosen vs rejected) | Rationale |
|---|----------|------------------------------|-----------|
| 1 | Deletion strategy | **A. `git rm` prod + tests** / B. in-place rewrite to no-op / C. preserve with `@deprecated` | Git history records intent; CI grep gets clean view. Spec Req 4. |
| 2 | Test inversion | **A. flip `toMatch` → `not.toMatch`** / B. dual assertions / C. delete test | Dual inflates LOC past 400-line budget. Spec Req 3. |
| 3 | Mirror migration scope | **A. exclude `apps/dashboard/supabase/migrations/*.sql`** / B. inline-fix mirror / C. move to `_legacy/` | Mirror is infra PR concern. Spec Req 5 permits exception. |
| 4 | PR target | **A. `feature/release-2-0-phase2-migrations`** / B. `dev` / C. `main` / D. local merge | `feature-branch-chain` per root `AGENTS.md`; `dev`/`qa`/`main` are protected. |
| 5 | CI grep placement | **A. named step in `booking-regression.yml`** / B. post-merge script / C. commit-time hook | Mirrors battle-tested `supabase/migrations/lint/forbidden-columns.sh`. Spec Req 5. |

**Grep guard** (added to `.github/workflows/booking-regression.yml`):
```
! grep -rn -E 'notification_email_outbox|email_outbox' \
  apps/ supabase/functions/ \
  --include='*.ts' --include='*.tsx' --include='*.astro' \
  --exclude='*.spec.ts' --exclude='*.test.ts' \
  | grep -v 'apps/dashboard/supabase/migrations/'
```
Negation + `set -o pipefail` exits non-zero on any match. The two `--exclude` flags carve out the negative-contract test files so the guard's "runtime code paths" scope matches Spec Req 5 without colliding with the inversion-by-absence pattern.

## Data Flow

Pre-c2 (broken at runtime):
```
POST /api/signup/create-account-business
  → auth.admin.createUser
  → INSERT signup_email_confirmations
  → SELECT notification_email_outbox (existing-row)        [L161-173]
  → INSERT notification_email_outbox (queue confirmation)  [L230-247]
  → 202 signup_confirmation_requested
  → [broken: table dropped → 5xx]
```

Post-c2:
```
POST /api/signup/create-account-business
  → auth.admin.createUser
  → INSERT signup_email_confirmations
  → 202 signup_confirmation_requested
  → [c3 adds supabase.auth.signUp rewrite]
```

Same shape for `pending-signup-handoff.ts` (L308-330 removed). `process-email-outbox` Edge Function is already gone; no caller remains.

## File Changes

| Path | Action | WU |
|------|--------|----|
| `apps/dashboard/src/app/core/notifications/notification-sender.ts` | `git rm` | c2.1 |
| `apps/dashboard/src/app/core/notifications/outbox-email-sender.ts` | `git rm` | c2.1 |
| `apps/dashboard/src/app/tests/unit/outbox-dashboard-boundary.contract.spec.skip.ts` | `git rm` (renamed from active spec) | c2.1 |
| `apps/dashboard/src/app/tests/integration/supabase-db-rpc-red.contract.spec.ts` | MODIFY (invert test; add `readActiveSqlFiles`) | c2.1 |
| `apps/dashboard/src/app/tests/integration/kb001-supabase-connection-guard.red.contract.spec.ts` | MODIFY (KB-001.2.5 inverted; KB-001.5 list drops entry) | c2.1 |
| `apps/dashboard/src/app/tests/integration/orvel-real-appointment-notification-flows.red.contract.spec.ts` | MODIFY (`expectEmailPath` → `expectNoOutboxPath`; rename 3; skip 1) | c2.1 |
| `apps/dashboard/src/app/tests/integration/orvel-notifications-system.red.contract.spec.ts` | MODIFY (loader returns null; invert 1; remove 1) | c2.1 |
| `apps/dashboard/src/app/tests/unit/typescript-compile-fix.red.contract.spec.ts` | MODIFY (replace positive with `fs.existsSync(...).toBe(false)`) | c2.1 |
| `apps/dashboard/src/app/core/api/supabase-booking/core-slice3-runtime-lockdown.red.contract.spec.ts` | NO CHANGE (already inverted at L294) | c2.1 |
| `apps/landing/src/lib/server/pending-signup-handoff.ts` | MODIFY (remove L308-330) | c2.2 |
| `apps/landing/src/pages/api/signup/create-account-business.ts` | MODIFY (remove L161-173 + L230-247) | c2.2 |
| `apps/landing/src/tests/create-account-business-free-only.contract.spec.ts` | MODIFY (drop outbox mock + assertions) | c2.2 |
| `apps/landing/src/tests/signup-email-confirmation-flow.red.contract.spec.ts` | MODIFY (invert 6 outbox assertions) | c2.2 |
| `supabase/functions/_shared/{p0-mvp-static-contracts,signup-email-confirmation-flow.red.contract,public-booking-reliability-regression,appointment-email-rendering}.test.skip.ts` | `git rm` | c2.2 |
| `apps/dashboard/src/app/tests/integration/booking-email-lifecycle.contract.spec.skip.ts` | `git rm` | c2.2 |
| `.github/workflows/booking-regression.yml` | MODIFY (add `Outbox grep guard` step) | c2.2 |

Net ~−300 LOC (within 400 budget). Other `.skip.*` files referenced in spec scenario 4 carry no outbox references; orchestrator reconciles final skip count at apply.

## Work Units

**wu-c2.1 — Dashboard purge**: `git rm` 2 prod + 1 skip-renamed test; modify 5 contract tests; validate with Vitest + `tsc -p tsconfig.app.json --noEmit`.

**wu-c2.2 — Landing + CI**: MODIFY 2 landing prod (L308-330 + L161-173 + L230-247) + 2 landing tests; `git rm` all `.skip.*` files; add grep guard; validate with Vitest + grep run + `pnpm --dir apps/landing run build`.

**Sequencing**: c2.1 first (smaller, focused). c2.2 adds grep guard AFTER all outbox refs removed — adding earlier would fail the build.

## Test Strategy

- **Spec**: `specs/email-outbox-cleanup/spec.md` — 6 Requirements, 8 Scenarios.
- **Red → Green**: Each modified contract inverts from positive to negative outbox assertion. `git rm` removes dead code that triggered failures.
- **No new tests** — inversion of existing red contracts only.
- **Validation**: Vitest per app + grep guard manual run + dual `pnpm run build`.

## Threat Matrix

**Not Applicable.** Pure code/test cleanup. No routing, shell, subprocess, VCS automation, executable-file classification, or process integration changes. The new CI step mirrors `supabase/migrations/lint/forbidden-columns.sh`.

## Migration / Rollout

No schema migration (table dropped in Phase 2 #207). Accepted intermediate outage window per spec Req 6: signup endpoints may return 5xx between c2 and c3 merge (zero expected traffic; single-tenant MVP). Rollback = `git revert` of the squash merge.

## Open Questions

None.
