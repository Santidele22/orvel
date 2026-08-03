# Tasks: Orvel Email Outbox Cleanup (PR-c2)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280-330 (fits 400 budget) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (c2.1 + c2.2 sequential) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| wu-c2.1 | Dashboard outbox purge | PR 1 | `pnpm --dir apps/dashboard exec vitest run` (6 files) | `pnpm --dir apps/dashboard run build` | `git revert` deletes + test mods; no schema change |
| wu-c2.2 | Landing blocks + CI grep guard + skip deletions | PR 1 | `pnpm --dir apps/landing exec vitest run` (2 files) | `pnpm --dir apps/landing run build` + manual grep guard run | `git revert` landing edits + skip deletions + CI step |

## Phase 1: Dashboard Purge (wu-c2.1)

- [x] 1.1 `git rm apps/dashboard/src/app/core/notifications/notification-sender.ts` + `outbox-email-sender.ts`
- [x] 1.2 `git rm apps/dashboard/src/app/tests/unit/outbox-dashboard-boundary.contract.spec.skip.ts`
- [x] 1.3 Invert `supabase-db-rpc-red.contract.spec.ts`: L27-29 table-exists → NOT exists; L51 regex positive → `not.toMatch`
- [x] 1.4 Invert `kb001-supabase-connection-guard.red.contract.spec.ts`: L340-349 RPC check inverted; L702 list drops `notification_email_outbox` entry
- [x] 1.5 Invert `orvel-real-appointment-notification-flows.red.contract.spec.ts`: 2 positive-outbox → `expectNoOutboxPath`; keep 3 negative-browser assertions
- [x] 1.6 Invert `orvel-notifications-system.red.contract.spec.ts`: remove L108 TODO; L233 regex `not.toMatch`; L251-254 strengthen `typeof === 'undefined'`
- [x] 1.7 Invert `typescript-compile-fix.red.contract.spec.ts`: `toMatch` → `fs.existsSync(...).toBe(false)`
- [x] 1.8 DO NOT modify `core-slice3-runtime-lockdown.red.contract.spec.ts` (already inverted at L294)
- [x] 1.9 Validate: `tsc --noEmit -p tsconfig.app.json` + `tsc --noEmit -p tsconfig.spec.json` + Vitest (6 files) + dashboard build (run; baseline caveats in apply report)

## Phase 2: Landing + CI + Skip Deletions (wu-c2.2)

- [x] 2.1 Reconcile skip-file list: `find supabase/functions/_shared -name '*.test.skip.ts' -exec grep -l 'notification_email_outbox\|process-email-outbox' {} \;`; add `booking-email-lifecycle.contract.spec.skip.ts`
- [x] 2.2 Remove outbox INSERT L308-330 + `confirmationEmailInsert` var + related imports from `apps/landing/src/lib/server/pending-signup-handoff.ts`
- [x] 2.3 Remove outbox SELECT L161-173 + INSERT L230-247 + related vars/imports from `apps/landing/src/pages/api/signup/create-account-business.ts`
- [x] 2.4 `git rm` all skip files from step 2.1 reconciliation
- [x] 2.5 Invert `create-account-business-free-only.contract.spec.ts`: drop outbox mock; assert `signup_email_confirmations` alone queued
- [x] 2.6 Invert `signup-email-confirmation-flow.red.contract.spec.ts`: 6 outbox assertions positive → negative; remove `business_welcome` negative
- [x] 2.7 Add `Outbox grep guard` CI step to `.github/workflows/booking-regression.yml`: grep `notification_email_outbox|email_outbox` across `apps/ supabase/functions/` excluding `apps/dashboard/supabase/migrations/`; `set -o pipefail`; exit 1 on match (amended: `--exclude='*.spec.ts' --exclude='*.test.ts'` — see apply report, guard-vs-inversion contradiction)
- [x] 2.8 Validate: landing `tsc --noEmit` (app + spec), Vitest (2 files), landing build, manual grep guard (0 hits expected)

## Sequencing

c2.1 must complete first — c2.2 adds CI grep guard that would fail if run before all outbox refs are removed.

## Apply Contract

`sdd-apply` implements both phases sequentially, validates each locally, reports `git status` + green results back to orchestrator. Commits and PR are orchestrator-owned. Apply MUST NOT commit, push, or open PR.
