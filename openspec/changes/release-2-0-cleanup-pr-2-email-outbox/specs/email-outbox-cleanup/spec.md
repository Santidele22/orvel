# Email Outbox Cleanup Specification

## Purpose

Release 2.0 phase 2 dropped the `notification_email_outbox` table and deleted the Edge Function `process-email-outbox`. This spec codifies the remaining cleanup: every runtime reference in active dashboard or landing code, plus stale test fixtures, must vanish so the post-2.0 signup path is stable.

## Requirements

### Requirement: Outbox Producer Code Removed From Dashboard

The active 2.0 codebase MUST NOT contain the dashboard outbox producer modules, and no source file in `apps/` SHALL import from them.

#### Scenario: Notification Sender Modules Deleted

- GIVEN the legacy `apps/dashboard/src/app/core/notifications/notification-sender.ts` and `outbox-email-sender.ts` files
- WHEN PR-c2 is applied
- THEN both files MUST be deleted from the repository tree
- AND no source file in `apps/` SHALL import from either path

### Requirement: Outbox Blocks Removed From Landing Signup Endpoints

The landing signup endpoints MUST NOT reference `notification_email_outbox` or `email_outbox` at runtime.

#### Scenario: Pending Signup Handoff Outbox Block Removed

- GIVEN `apps/landing/src/lib/server/pending-signup-handoff.ts` contains an outbox INSERT at L308-330
- WHEN PR-c2 is applied
- THEN that block MUST be removed
- AND the file MUST NOT reference `notification_email_outbox`

#### Scenario: Create Account Business Outbox Blocks Removed

- GIVEN `apps/landing/src/pages/api/signup/create-account-business.ts` contains outbox SELECT at L161-173 and outbox INSERT at L230-247
- WHEN PR-c2 is applied
- THEN both blocks MUST be removed
- AND the endpoint MUST handle signup FREE through the post-2.0 path without legacy outbox enqueue (PR-c3 owns the working rewrite)

### Requirement: Tests Assert Outbox-Absent Semantics

The 7 affected test files MUST encode inverted expectations so the suite fails if outbox code is reintroduced.

#### Scenario: Contract And Unit Contracts Pin Outbox Absence

- GIVEN the 7 files: `apps/dashboard/src/app/tests/integration/supabase-db-rpc-red.contract.spec.ts`, `apps/dashboard/src/app/tests/integration/kb001-supabase-connection-guard.red.contract.spec.ts`, `apps/dashboard/src/app/tests/integration/orvel-real-appointment-notification-flows.red.contract.spec.ts`, `apps/dashboard/src/app/tests/integration/orvel-notifications-system.red.contract.spec.ts`, `apps/dashboard/src/app/tests/unit/typescript-compile-fix.red.contract.spec.ts`, `apps/dashboard/src/app/core/api/supabase-booking/core-slice3-runtime-lockdown.red.contract.spec.ts`, and `apps/landing/src/tests/create-account-business-free-only.contract.spec.ts`
- WHEN the suite runs
- THEN each contract MUST assert that `notification_email_outbox` is NOT referenced at runtime in active 2.0 code
- AND none of the 7 MAY continue to assert outbox presence

### Requirement: Stale Outbox Test Files Removed

Legacy skip-flagged tests and the dashboard boundary contract MUST be deleted; each deletion MUST be recorded as a git rename, not a content rewrite.

#### Scenario: Skip Tests And Dashboard Boundary Contract Deleted

- GIVEN the 8 `.skip.*` test files referencing `process-email-outbox` or `notification_email_outbox` AND the active `apps/dashboard/src/app/tests/unit/outbox-dashboard-boundary.contract.spec.ts`
- WHEN PR-c2 is applied
- THEN all 9 files MUST be deleted from the tree
- AND the deletions MUST be committed via `git rm` so renames are recorded rather than rewritten in place

### Requirement: Repository Search Guard Passes

A scoped repository grep MUST return zero matches for both outbox names across production runtime code paths. Test files (`.spec.ts`, `.test.ts`) MAY name the identifiers inside `not.toMatch` assertions (negative-contract semantics) without triggering the guard, because the inversion-by-absence pattern is the spec's prescribed encoding.

#### Scenario: Grep Returns Zero Hits In Runtime Code

- GIVEN the search target `grep -rn -E 'notification_email_outbox|email_outbox' apps/ supabase/functions/ --include='*.ts' --include='*.tsx' --include='*.astro' --exclude='*.spec.ts' --exclude='*.test.ts'`
- WHEN the guard runs on the post-PR-c2 tree
- THEN the grep MUST return zero matches
- AND the only permissible exception SHALL be `apps/dashboard/supabase/migrations/*.sql` (mirror slop, slated for a separate infra PR)

### Requirement: Signup Temporary Breakage Documented As Accepted Tradeoff

The intermediate state between PR-c2 and PR-c3 SHALL be acknowledged as an accepted outage window with explicit bound and owner.

#### Scenario: Signup FREE Endpoint Temporarily Non-Functional Between c2 And c3

- GIVEN PR-c2 is merged and PR-c3 is not yet merged
- WHEN a real signup FREE is attempted via `POST /api/signup/create-account-business`
- THEN the endpoint MAY return a 5xx error (the `supabase.auth.signUp` rewrite lives in PR-c3)
- AND this is ACCEPTED because Orvel is single-tenant MVP with zero traffic during the merge window
- AND PR-c3 SHALL restore the endpoint to a working state
