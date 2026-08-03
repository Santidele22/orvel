# Proposal: Orvel Phase 2 Cleanup — Email Outbox Removal (PR-c2)

## Assumptions (Binding — from Interactive Question Round)

1. **Signup FREE broken between c2 and c3 merge**: Accepted. Zero traffic expected — Orvel is single-tenant MVP with no real users. c2 to c3 merge interval is hours to 1 day.
2. **No real traffic between c2 and c3**: Confirmed. No production load exists during the merge window.
3. **Outbox revival (Mercado Pago) is undecided**: PR-c2 must be agnostic but removes all runtime outbox code. `.skip.*` tests are DELETED, not preserved with `@deprecated` stubs.
4. **8 outbox `.skip.*` test files deleted**: No stubs, no revival markers. Pure removal.

## Intent

Phase 2 of Release 2.0 dropped the `notification_email_outbox` table and deleted the Edge Function `process-email-outbox`. Several dashboard and landing code paths still reference the dead table, causing runtime failures on signup endpoints (`/api/signup/create-account-business`, `/api/signup/pending-intent/protect`). This PR removes all remaining outbox runtime code and stale tests, restoring signup endpoint stability.

## Scope

### In Scope
- Delete `notification-sender.ts` and `outbox-email-sender.ts` (dashboard outbox producers, dead code).
- Remove outbox INSERT/SELECT blocks from `pending-signup-handoff.ts` and `create-account-business.ts` (landing signup endpoints).
- Update 7 test files to assert "outbox absent" semantics instead of outbox behaviors.
- Delete 8 `.skip.*` test files referencing `process-email-outbox` or `notification_email_outbox`.
- Delete `outbox-dashboard-boundary.contract.spec.ts` (dashboard-side outbox test, concept dead).

### Out of Scope

- `supabase.auth.signUp()` migration and Edge Function `confirm-email.ts`, `create-account-business.ts`, `pending-signup-handoff.ts` deletion — deferred to PR-c3.
- Supabase mirror migration that still creates `notification_email_outbox` — separate doc/infra PR.
- `docs/runbooks/supabase-migrations.md` (outdated processor instructions) — docs PR.
- Billing functions (Mercado Pago), account-closure — untouched, already out of MVP.
- `supabase/migrations/_legacy/*` — already archived via #207, untouched.

## Capabilities

> Contract for `sdd-spec`. No existing `openspec/specs/` — this is a new capability.

### New Capabilities
- `email-outbox-cleanup`: Remove all remaining runtime references to the `notification_email_outbox` table and its deleted Edge Function `process-email-outbox`, including dead code, stale test assertions, and `.skip.*` legacy files. No replacement behavior — the outbox concept is fully removed.

### Modified Capabilities
- None. No existing `openspec/specs/` parent to modify.

## Approach

Delete dead producer code, strip outbox blocks from signup endpoints, and update tests to verify "outbox absent" semantics. No schema changes — the table was already dropped in Phase 2. No new dependencies.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/dashboard/src/app/core/notifications/` | Removed | Delete `notification-sender.ts`, `outbox-email-sender.ts` |
| `apps/landing/src/lib/server/pending-signup-handoff.ts` | Modified | Remove outbox INSERT block L308-330 |
| `apps/landing/src/pages/api/signup/create-account-business.ts` | Modified | Remove L161-173 (outbox SELECT check) + L230-247 (outbox INSERT) |
| `apps/landing/src/tests/` | Modified | Update `create-account-business-free-only.contract.spec.ts` |
| `apps/dashboard/src/app/tests/` | Modified/Removed | 7 test files updated, 1 deleted, `.skip.*` files deleted |
| `supabase/functions/_shared/` | Removed | Delete `.skip.*` test files |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Signup FREE broken between c2 and c3 merge | Medium | Accepted tradeoff. Zero traffic, single-tenant MVP. Merge interval is hours. |
| `email_outbox` vs `notification_email_outbox` name discrepancy (migration vs. runtime) | Low | Both names reference dead code. Grep target covers both; resolve during apply. |
| Deleted `.skip.*` tests may mask latent issues in remaining test files | Low | Tests were already excluded from CI. Remaining tests independently cover signup paths. |
| Undiscovered outbox references in `.astro` or `.tsx` files | Low | Success criterion is `grep`-based; any missed reference surfaces in CI. |

## Rollback Plan

`git revert` the merge commit for PR-c2. No schema migration to reverse — the table was already dropped in Phase 2 and is not re-created.

## Dependencies

- Phase 2 table drop + Edge Function deletion (already merged: #207 for migrations, #208 for functions).

## Success Criteria

- CI green on all affected test suites.
- `grep -rn 'notification_email_outbox' apps/ supabase/ --include='*.ts' --include='*.tsx' --include='*.astro' | wc -l` returns 0.
- `POST /api/signup/create-account-business` and `POST /api/signup/pending-intent/protect` no longer reference the dead table at runtime.
