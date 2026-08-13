# Proposal: chore-docs-and-context-align-release-2-0

## Intent

`infra/context/*`, `docs/adr/0001-*.md`, and `docs/runbooks/*` describe a pre-release-2.0 state (MP billing source-of-truth, MVP date 2026-06-25, dead `feat/import-orvel-repos` branch, trial-reminder cron, 2-Supabase architecture, no 3-branch promotion), while all release-2.0 work (ADRs 0001-0004, `migration-inventory/`, `_legacy/`, MP+outbox purges via PR #204-#209) lives **only** on `origin/feature/release-2-0-*` branches. Dev HEAD `6e604ce` still carries 14 Edge Functions including MP + outbox. This change realigns docs to the post-release-2.0 target, resolves the `0001-*.md` filename collision with release-2.0 `0001-schema-principles.md`, archives four stale `openspec/changes/` folders per the proven `archive/2026-08-XX-<name>/` convention (precedent: commit `d554317`, `email-outbox-cleanup`), and refreshes runbooks so docs do not lie about current code.

## Pre-Approved Decisions (Santi, not re-litigated)

1. Rename dev ADR `docs/adr/0001-orvel-monorepo-architecture.md` → `docs/adr/0001-orvel-monorepo-architecture-dev.md`; leave slot open for release-2.0 `0001-schema-principles.md` to land on merge.
2. Do NOT import release-2.0 ADRs 0001-0004 here. Wait for the release branch to merge to dev.
3. Archive stale OpenSpec changes per commit `d554317`: each folder moved into `openspec/changes/archive/2026-08-XX-<name>/` with `archive-report.md`; surviving REQs promoted to `openspec/specs/<capability>/spec.md`.
4. `docs/diagrams/` is **out of scope** for this change; stays untracked.
5. `docs/runbooks/trial-user-activation-reminder.md` is **DELETED** (the cron function exists on dev but is removed in target; `release-2-0` purges it; conflicting docs are worse than no docs).

## What Changes

### WU1 — `infra/context/` rewrite
Rewrite `product.md` (drop MP source-of-truth, drop "MVP June 2026", drop M1-M8; Mobile app stays non-goal but reframed as mobile-first PWA per release-1.0.3 §Scope desktop-only). Rewrite `supabase.md` to point at the new `orvel-qa-dev` ref with a `_legacy_` note. Rewrite `deployment.md` + `environments.md` to describe the 3-env promotion (`dev`/`qa`/`main`) and the CI gate `dashboard-booking-regressions`. Affected: `infra/context/product.md`, `infra/context/supabase.md`, `infra/context/deployment.md`, `infra/context/environments.md`.

### WU2 — ADR collision + 3-branch promotion
Rename ADR per Decision 1. Extend `infra/context/operational-rules.md` with the full `feature → dev → qa → main` pipeline (currently only in root `AGENTS.md`): required CI check, linear history, admin-only merge workaround gated on Santi approval. Affected: `docs/adr/0001-orvel-monorepo-architecture.md` → renamed, `infra/context/operational-rules.md`.

### WU3 — runbook refresh
Archive `account-closure.md` (target = 501 stub per release-2.0-cleanup). Mark `monorepo-migration.md` historical (migration done). Trim `supabase-migrations.md` (outbox recovery, MP migration, old ref). DELETE `trial-user-activation-reminder.md` (cron purged in target; conflict dev-vs-target is worse than no doc). Affected: `docs/runbooks/account-closure.md`, `docs/runbooks/monorepo-migration.md`, `docs/runbooks/supabase-migrations.md`, `docs/runbooks/trial-user-activation-reminder.md` (deleted).

### WU4 — OpenSpec stale-change archive
Move four pre-release-2.0 folders into `openspec/changes/archive/2026-08-12-<name>/`: `chore-repo-public-ready` (largely done; promote survivors to `openspec/specs/`), `release-1-0-1` (outbox spec invalidated by target), `release-1-0-2-cleanup` (email-templates limited), `release-1-0-3-pwa` (Fase 1+2 shipped retroactively; Fase 3+4 status TBD — read proposal + tasks to split live vs historical). Each gets `archive-report.md` citing precedent `d554317` (`email-outbox-cleanup`).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `infra/context/product.md` | Rewritten | Mobile-first PWA; drop MP, MVP date, M1-M8 |
| `infra/context/supabase.md` | Rewritten | New `orvel-qa-dev` ref + `_legacy_` note |
| `infra/context/deployment.md` | Rewritten | 3-env promotion + `dashboard-booking-regressions` CI gate |
| `infra/context/environments.md` | Rewritten | dev/qa/main sections |
| `infra/context/operational-rules.md` | Modified | Add full `feature→dev→qa→main` pipeline |
| `docs/adr/0001-orvel-monorepo-architecture.md` → `-dev.md` | Renamed | Resolves 0001 collision |
| `docs/runbooks/account-closure.md` | Archived | Function is 501 stub in target |
| `docs/runbooks/monorepo-migration.md` | Marked historical | Migration complete |
| `docs/runbooks/supabase-migrations.md` | Trimmed | Outbox + MP + old ref sections removed |
| `docs/runbooks/trial-user-activation-reminder.md` | Deleted | Conflict dev vs target; release-2.0 purges cron |
| `openspec/changes/chore-repo-public-ready/` → `archive/2026-08-12-*/` | Archived | Pre-release-2.0 chore |
| `openspec/changes/release-1-0-1/` → `archive/2026-08-12-*/` | Archived | Outbox spec invalidated |
| `openspec/changes/release-1-0-2-cleanup/` → `archive/2026-08-12-*/` | Archived | Email-templates limited |
| `openspec/changes/release-1-0-3-pwa/` → `archive/2026-08-12-*/` | Partially archived | Fase 3+4 status TBD; Fase 1+2 already shipped |

## Impact

- **Humans (Santi)**: source-of-truth docs that match the post-release-2.0 world; no more reading MP-billing copy in `product.md` while the code has been purged.
- **Sub-agents (R2-D2, D-O, QA)**: load-bearing context that does not contradict runtime — `deployment.md` names the actual CI gate; `operational-rules.md` documents the actual promotion flow; ADRs no longer collide with the release-branch numbering.
- **Archive becomes canonical**: `openspec/changes/archive/2026-08-12-*/` is the historical record of pre-release-2.0 work, parallel to `release-2-0-cleanup-pr-2-email-outbox` already archived.
- **Promoted specs (if any)**: surviving REQs from `chore-repo-public-ready` etc. land in `openspec/specs/<capability>/spec.md`.

## Capabilities

### New Capabilities
None at spec level. This is a docs-only chore; no new product/spec surface.

### Modified Capabilities
None. No spec-level behavior changes.

## Approach

Docs-only refresh. Each WU is one PR slice under the 800-line budget. Phase A = WU1+WU2; Phase B = WU3; Phase C = WU4. Strict TDD: docs change needs no new tests, but `pnpm run check` must still pass (CI gate on protected branches). Per `openspec/config.yaml` `rules.proposal`: aligned with the public roadmap `openspec/changes/release-1-0-1/roadmap.md`.

## Risks

1. **Deviation from release-2.0 branches** — release ADRs 0001-0004 and `migration-inventory/` are NOT imported; if those branches mutate before merge, our docs may lag. *Mitigation*: Decision 2 defers; WU1+WU2 describe only what is true on dev.
2. **Archive-report inaccuracy** — `release-1-0-3-pwa` Fase 3+4 status is TBD until tasks.md is read in Phase C; misclassifying live work as historical would orphan scope. *Mitigation*: WU4 reads `proposal.md`+`tasks.md` before deciding; orchestrator asks on ambiguity.
3. **Archive-folder convention drift** — `openspec/changes/archive/` is empty on dev HEAD; only commit `d554317` shows the precedent. *Mitigation*: follow the precedent verbatim (`archive/YYYY-MM-DD-<name>/<files>` + `archive-report.md` + promote survivors to `openspec/specs/`).
4. **Scope creep into code** — `infra/context/architecture.md` is partially rewritten in working tree (uncommitted); this change must not commit it. *Mitigation*: Affected Areas lists only the 4 files explicitly; `architecture.md` belongs to a separate change.
5. **ADR 0001 filename race** — if release-2.0 merges between Phase A and Phase C, renamed dev ADR slot is correct; if it merges during Phase A, git merge conflict. *Mitigation*: orchestrator pauses Phase A on conflict; rename is local to dev so conflict is recoverable.

## Rollback Plan

Per PR: revert the merge commit on `dev`. WU1+WU2+WU3 are markdown edits — `git revert <merge-sha>` restores prior bytes verbatim. WU4 archive moves are reversible by moving folders back from `archive/2026-08-12-*/` to `<name>/`. ADR rename is reversible: `git mv` back. Worst case (release-2.0 already merged with conflict): revert this PR, re-apply only the WU4 moves against the post-merge tree.

## Dependencies

- None external. release-2.0 branch state is informational only; we do not depend on its merge timing (Decision 2).

## Success Criteria

- [ ] `rg "MercadoPago" infra/context/product.md` returns 0 hits; `rg "M1|MVP.*June" infra/context/product.md` returns 0 hits.
- [ ] `ls docs/adr/0001-*.md` shows `-dev.md` (renamed); `-schema-principles.md` arrives only after release-2.0 merges.
- [ ] `ls docs/runbooks/trial-user-activation-reminder.md` returns "No such file".
- [ ] `openspec/changes/` root contains only `archive/` and the active change folders.
- [ ] `infra/context/operational-rules.md` contains `feature → dev → qa → main` (or ASCII equivalent) and references `dashboard-booking-regressions`.
- [ ] `pnpm run check` exits 0 on `dev` after WU1+WU2 PR merges.

## References

- Exploration: `openspec/changes/chore-docs-and-context-align-release-2-0/exploration.md`
- Engram: `sdd/chore-docs-and-context-align-release-2-0/explore` (#153)
- Precedent for archive convention: commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`)
- Roadmap alignment: `openspec/changes/release-1-0-1/roadmap.md` (post-1.0.3 simplification)
- Project context: Engram `sdd-init/orvel` (#3)
- `openspec/config.yaml` `rules.proposal` (align with public roadmap)
