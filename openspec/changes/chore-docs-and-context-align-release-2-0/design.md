# Design: chore-docs-and-context-align-release-2-0

## Overview

Docs-only chore, no runtime surface change. 4 WUs (infra/context rewrite, ADR + operational-rules, runbook refresh, OpenSpec archive) implemented as 3 PR slices on `dev` (Phase A = WU1+WU2, Phase B = WU3, Phase C = WU4). Base HEAD `d215bc0` on `dev` is 3 commits ahead of `origin/dev` (per Engram #155). Strict TDD: no new product tests; docs-only edits must keep `pnpm run check` and `dashboard-booking-regressions` green on protected branches per root `AGENTS.md` §3.

## Strategy

Three PR slices under the 800-line review budget (PR slice 1 ≈ 300, PR slice 2 ≈ 100, PR slice 3 ≈ 250). Each PR targets `dev` only (3-branch promotion: `feature → dev → qa → main`); each runs `pnpm run check` + the `dashboard-booking-regressions` job before merge (merge requires explicit Santi approval per PR per root `AGENTS.md`). Force-chained slices are NOT required — each PR is independently revertible. Per openspec/config.yaml rules, all artifacts are committed under the working branch; no destructive or admin-protected operations.

## Tools and Conventions

| Tool | When | Note |
|------|------|------|
| `git mv <old> <new>` | ADR rename (WU2) + folder moves (WU3 archive, WU4 archive) | Preserves history so `git log --follow` works. Plain `mv` then `git add` produces a delete + add and breaks rename detection. |
| `git rm <path>` | `trial-user-activation-reminder.md` deletion (WU3) | Single file removal, history preserved. |
| `git mv` archive folder | WU3 `account-closure.md` → `docs/runbooks/archive/2026-08-12-account-closure.md` + WU4 stale changes | Tracked rename; preserves prior change authorship. |
| `rg` (ripgrep) | Verification per REQ | Single-line patterns from the spec files; OR-patterns joined with `\|`. |
| `git log --follow` | REQ-AOR-1 verification | Proves `git mv` preserved history for the ADR rename. |
| `git show d554317:openspec/changes/archive/...` | Template source for WU4 archive-report.md | Precedent structure from email-outbox-cleanup archive. |

Commit messages follow the repo's conventional-commits style (no `Co-Authored-By`, no AI attribution) per root `AGENTS.md` + `openspec/config.yaml` rules. Each WU is one PR with one squash-merge commit per slice.

## Architecture Decisions

### Decision: PR slicing

| Option | Tradeoff | Decision |
|--------|----------|----------|
| One mega-PR (all 4 WUs) | Single review, larger blast radius; blows the 800-line budget | Rejected |
| Per-WU PR (4 slices) | Tighter scope per review, but 4 review cycles | Rejected (W1+WU2 share `infra/context/` thematic) |
| 3 PR slices (Phase A/B/C) | Matches budget per slice, splits by reviewer focus area (docs → runbooks → archive), each independently revertible | **Chosen** |

### Decision: ADR 0001 rename vs slot-reservation

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Renumber dev ADR to 0000 | Breaks historical references; `openspec/changes/release-1-0-1/roadmap.md` cites `ADR-015` style numbers | Rejected |
| Rename dev ADR to `-dev` suffix | Keeps dev ADR intact, free slot for release-2.0 `0001-schema-principles.md` on merge | **Chosen** (Decision 1 from proposal) |

### Decision: `release-1-0-3-pwa/` partial archive

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Archive entire folder | Orphans Fase 3 (offline walk-in queue) and Fase 4 (mobile verification) — both open work per `tasks.md` §2-§4 | Rejected (REQ-OSA-3 contradicts) |
| Keep entire folder | Fails to archive shipped Fase 1+2 retroactively documented in `proposal.md` §2.1 (PR #180 `c1127a0`) | Rejected (REQ-OSA-3 contradicts) |
| Split: Fase 1+2 → archive; Fase 3+4 → live folder edited to remove historical content | Honors REQ-OSA-3 split; archive-report.md documents the boundary | **Chosen** (REQ-OSA-3 explicit) |

The split uses **inline section removal** in `proposal.md` + `tasks.md` (drop §2.1 and PR-#1 references, keep §2.2 Fase 3+4 as the live scope). Archive folder gets the historical Fase 1+2 content via `git mv` of proposal excerpts captured in `archive-report.md`. This avoids splitting the live folder into a new path.

### Decision: `chore-repo-public-ready` survivors

Per `proposal.md` Tasks §1-10, the OSS boilerplate tasks (LICENSE, CONTRIBUTING.md, SECURITY.md, CODEOWNERS, badges, .gitignore) and the tzqgwziyiospmvpdgbnt purge are checkable as generic-repo-readiness REQs. Promote to `openspec/specs/repo-public-readiness/spec.md` (new capability). Decision left to sdd-tasks to confirm capability name; placeholder in design is `repo-public-readiness`.

## Data Flow

This change has no runtime data flow — docs only. The logical "flow" is the review/merge sequence:

```
Phase A PR (WU1 + WU2)
  infra/context/{product,supabase,deployment,environments}.md  (rewrite)
  infra/context/operational-rules.md                          (append pipeline section)
  docs/adr/0001-orvel-monorepo-architecture.md                 (git mv)
  docs/adr/0001-orvel-monorepo-architecture-dev.md             (Status note added)
       │
       ▼ pnpm run check + dashboard-booking-regressions
       ▼ merge to dev (Santi approval)
       ▼
Phase B PR (WU3)
  docs/runbooks/account-closure.md                             (git mv → archive/)
  docs/runbooks/archive/2026-08-12-account-closure.md          (prepend status: archived)
  docs/runbooks/monorepo-migration.md                          (prepend status: historical)
  docs/runbooks/supabase-migrations.md                        (drop §Incident + §Outbox + ref)
  docs/runbooks/trial-user-activation-reminder.md              (git rm)
       │
       ▼ pnpm run check
       ▼ merge to dev
       ▼
Phase C PR (WU4)
  openspec/changes/{chore-repo-public-ready,release-1-0-1,release-1-0-2-cleanup}/
                                                                  (git mv → archive/2026-08-12-*/)
  openspec/changes/archive/2026-08-12-*/archive-report.md        (4 new files)
  openspec/changes/release-1-0-3-pwa/{proposal,tasks}.md          (edited: drop §2.1 Fase 1+2)
  openspec/changes/archive/2026-08-12-release-1-0-3-pwa/          (new folder for historical excerpt)
  openspec/specs/repo-public-readiness/spec.md                   (new — promoted survivors)
       │
       ▼ pnpm run check
       ▼ merge to dev
```

## File Changes

| File | Action | WU / PR | Description |
|------|--------|---------|-------------|
| `infra/context/product.md` | Rewrite | WU1 / Phase A | Drop MP, MVP date, M1-M8; reframe as mobile-first PWA with desktop-only carve-out; cite `docs/diagrams/01-monorepo-architecture.md` and `openspec/changes/release-1-0-3-pwa/proposal.md` §Out-of-Scope. Target ~80 lines. |
| `infra/context/supabase.md` | Rewrite | WU1 / Phase A | Replace dead-branch + incident + MP migration blocks. Active ref `orvel-qa-dev`; archived migrations live under `supabase/migrations/_legacy/`; safety constraints section preserved verbatim. |
| `infra/context/deployment.md` | Rewrite | WU1 / Phase A | Document `feature → dev → qa → main` promotion; reference `dashboard-booking-regressions` required check from `.github/workflows/booking-regression.yml` line 18; mirror root `AGENTS.md` §3 admin-workaround policy. |
| `infra/context/environments.md` | Rewrite | WU1 / Phase A | Four distinct sections: Local development, dev, qa, main. Env var names only (never values). |
| `infra/context/operational-rules.md` | Modify | WU2 / Phase A | Append new section: "Branch Promotion (3-env)" mirroring `AGENTS.md` lines 43-65. |
| `docs/adr/0001-orvel-monorepo-architecture.md` | Rename | WU2 / Phase A | `git mv` → `0001-orvel-monorepo-architecture-dev.md`. |
| `docs/adr/0001-orvel-monorepo-architecture-dev.md` | Modify | WU2 / Phase A | `## Status` block note: "renamed for release-2.0 collision; slot reserved for `0001-schema-principles.md`". |
| `docs/runbooks/account-closure.md` | Move | WU3 / Phase B | `git mv` → `archive/2026-08-12-account-closure.md`; prepend header `status: archived, function → 501 stub per release-2.0`. |
| `docs/runbooks/monorepo-migration.md` | Modify | WU3 / Phase B | Prepend `status: historical, migration complete`; remove imperative active-workflow prose. |
| `docs/runbooks/supabase-migrations.md` | Modify | WU3 / Phase B | Drop §"Migration History Incident" (outbox recovery), §"Booking Lifecycle Email Outbox Deploy and Recovery" (MP+email purged in target), §"Current Known State" ref `tzqgwziyiospmvpdgbnt`. Keep §"Safety Constraints" + §"Forward-migration ordering" verbatim. |
| `docs/runbooks/trial-user-activation-reminder.md` | Delete | WU3 / Phase B | `git rm` per Decision 5 (cron purged in target; dev-vs-target conflict is worse than no doc). |
| `openspec/changes/release-1-0-1/` | Move | WU4 / Phase C | `git mv` → `openspec/changes/archive/2026-08-12-release-1-0-1/`; add `archive-report.md` citing commit `d554317`. |
| `openspec/changes/release-1-0-2-cleanup/` | Move | WU4 / Phase C | Same pattern; `archive-report.md` notes email-templates limited in target. |
| `openspec/changes/release-1-0-3-pwa/{proposal,tasks}.md` | Modify | WU4 / Phase C | Edit `proposal.md` to drop §2.1 "Already Shipped" block (Fase 1+2, PR #180 `c1127a0`); edit `tasks.md` to drop §2 PR #1 references; keep Fase 3+4 live. |
| `openspec/changes/archive/2026-08-12-release-1-0-3-pwa/` | Create | WU4 / Phase C | New folder with `archive-report.md` + historical excerpt of §2.1 captured from `proposal.md` before edit. |
| `openspec/changes/chore-repo-public-ready/` | Move | WU4 / Phase C | `git mv` → `archive/2026-08-12-chore-repo-public-ready/`; promote survivors to `openspec/specs/repo-public-readiness/spec.md`. |
| `openspec/changes/archive/2026-08-12-{release-1-0-1,release-1-0-2-cleanup,release-1-0-3-pwa,chore-repo-public-ready}/archive-report.md` | Create | WU4 / Phase C | 4 files; each cites commit `d554317` precedent; template below. |
| `openspec/specs/repo-public-readiness/spec.md` | Create | WU4 / Phase C | Promoted REQs from `chore-repo-public-ready/proposal.md` Tasks §1-10. |

## Interfaces / Contracts

No runtime contracts change. The only "contract" surfaces are:

### `archive-report.md` template (WU4, 4 instances)

```markdown
## Why archived
{1-2 sentences from proposal §Why or change context — what was true and why it no longer is}

## Precedent (commit d554317)
Follows the `openspec/changes/archive/YYYY-MM-DD-<name>/` convention first established by
commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`).
See `openspec/changes/archive/2026-08-02-release-2-0-cleanup-pr-2-email-outbox/archive-report.md`.

## Where it lives now
{path to `openspec/specs/<capability>/spec.md` if any REQs were promoted; otherwise "no promotion"}

## What survives
- {promoted REQ-1}
- {promoted REQ-2}
{or "none — entirely invalidated by target state"}

## Archive contents
- proposal.md
- design.md
- tasks.md
- specs/... (if present)
- archive-report.md (this file)
```

### `infra/context/deployment.md` shape (WU1 target, ~40 lines)

```markdown
# Deployment Context

## Branch Promotion (3-env)
- Sequence: `feature → dev → qa → main`. Skip no step.
- Per-branch protection: linear history, 1 approving review,
  required CI check `dashboard-booking-regressions`, `enforce_admins: true`,
  no force-pushes, no deletions.
- Required CI gate: `dashboard-booking-regressions`
  (defined in `.github/workflows/booking-regression.yml`).
- Admin workaround (relax protection → `--admin --squash` → restore) is gated
  on explicit Santi approval per PR; never direct-push to `main`.

## Environments
- `dev` — integration. Receives feature PRs.
- `qa` — pre-release smoke. Receives dev → qa PRs.
- `main` — production. Receives qa → main PRs only.

## Source-of-truth
- Promotion flow + admin-workaround policy: root `AGENTS.md` §3.
- Operational rules: `infra/context/operational-rules.md`.
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Docs verification (every REQ) | `rg`/`ls`/`git log --follow` per spec file | Single command per REQ, executable on the working branch |
| CI gate (every PR) | `pnpm run check` + `dashboard-booking-regressions` | Already required on protected branches; no new test surface |
| No new unit/integration/e2e | Docs-only chore | Explicit per proposal |

## Threat Matrix

N/A — this change introduces no new routing, shell commands, subprocess invocations, VCS/PR automation logic, executable-file classification, or process integration. Per sdd-design §2a, only verification commands (`rg`, `ls`, `git log/show/mv/rm`) are run, all read-only against the working tree or against history.

## Risks

| # | Risk | Mitigation in design |
|---|------|---------------------|
| 1 | **Deviation from release-2.0 branches** — release ADRs 0001-0004 + `migration-inventory/` NOT imported; docs may lag if those branches mutate. | Decision 2 (defer) honored; WU1+WU2 describe only dev truth. |
| 2 | **Archive-report inaccuracy** — `release-1-0-3-pwa` Fase 3+4 status misclassification. | WU4 reads `proposal.md` §2.1/§2.2 + `tasks.md` §2-§4 before splitting; archive-report.md documents the boundary explicitly. |
| 3 | **Archive-folder convention drift** — `openspec/changes/archive/` is empty on dev HEAD; only `d554317` shows precedent. | WU4 follows `d554317` precedent verbatim (`archive/YYYY-MM-DD-<name>/<files>` + `archive-report.md`); REQ-OSA-5 mandates `d554317` citation in all four reports. |
| 4 | **Scope creep into `infra/context/architecture.md`** — already partially rewritten in working tree (uncommitted); must NOT commit it. | File not in File Changes table; WU1 scope is explicit and limited to product.md / supabase.md / deployment.md / environments.md. |
| 5 | **ADR 0001 filename race** — if release-2.0 merges between Phase A and Phase C, conflict. | Rename is local to dev; `git mv` preserves history; orchestrator pauses Phase A on conflict; rollback is reversible. |
| 6 (new) | **`chore-repo-public-ready` capability slug ambiguity** — promoted-survivor capability name is TBD. | Open Question 4 surfaced for sdd-tasks; placeholder `repo-public-readiness` used in File Changes. |

## Migration / Rollout

No data migration. Per-PR rollback via `git revert <merge-sha>` on `dev`:

| PR | Rollback action |
|----|----------------|
| Phase A | `git revert` restores prior `infra/context/*.md` bytes and ADR filename. ADR rename reversible via `git mv` back. |
| Phase B | `git revert` restores runbook bytes; archive folder reversible via `git mv` back to `docs/runbooks/`. `trial-user-activation-reminder.md` resurrection via `git revert`. |
| Phase C | `git revert` reverses archive moves; `openspec/changes/<name>/` restored from `archive/2026-08-12-*/`. Promoted `openspec/specs/repo-public-readiness/spec.md` deletable. |

## Verification Matrix

| REQ | WU / PR | Verification command |
|-----|---------|---------------------|
| REQ-ICR-1 | WU1 / Phase A | `rg -i "Mercado\s?Pago\|MP preapproval" infra/context/product.md` → 0 hits |
| REQ-ICR-2 | WU1 / Phase A | `rg -i "mobile-first PWA\|desktop-only" infra/context/product.md` → ≥1 hit each |
| REQ-ICR-3 | WU1 / Phase A | `rg "MVP.*June\|M1\|M2\|M3\|M4\|M5\|M6\|M7\|M8" infra/context/product.md` → 0 hits; no "Mobile app" non-goal line |
| REQ-ICR-4 | WU1 / Phase A | `rg "orvel-qa-dev" infra/context/supabase.md` ≥1 hit; `rg "feat/import-orvel-repos\|2026-07-12\|20260508000000_mp_preapproval_plan_sprint1" infra/context/supabase.md` → 0 hits |
| REQ-ICR-5 | WU1 / Phase A | `rg "feature.*dev.*qa.*main\|dashboard-booking-regressions" infra/context/deployment.md` ≥1 hit each |
| REQ-ICR-6 | WU1 / Phase A | `grep -E "^## (Local development\|dev\|qa\|main)" infra/context/environments.md` lists ≥4 sections; `rg "no environment names verified" infra/context/environments.md` → 0 hits |
| REQ-AOR-1 | WU2 / Phase A | `ls docs/adr/0001-*.md` shows only `-dev.md`; `git log --follow docs/adr/0001-orvel-monorepo-architecture-dev.md` shows pre-rename history; file `## Status` block contains `0001-schema-principles.md` |
| REQ-AOR-2 | WU2 / Phase A | `rg "feature.*dev.*qa.*main\|dashboard-booking-regressions" infra/context/operational-rules.md` ≥1 hit each |
| REQ-RR-1 | WU3 / Phase B | `ls docs/runbooks/archive/2026-08-12-account-closure.md` exists; header contains `status: archived` + `501 stub`; `ls docs/runbooks/account-closure.md` → "No such file" |
| REQ-RR-2 | WU3 / Phase B | Header of `docs/runbooks/monorepo-migration.md` contains `status: historical, migration complete`; no imperative active source-repo steps |
| REQ-RR-3 | WU3 / Phase B | `rg -i "outbox\|Mercado\s?Pago\|tzqgwziyiospmvpdgbnt" docs/runbooks/supabase-migrations.md` → 0 hits |
| REQ-RR-4 | WU3 / Phase B | `ls docs/runbooks/trial-user-activation-reminder.md` → "No such file" |
| REQ-OSA-1 | WU4 / Phase C | `ls openspec/changes/archive/2026-08-12-release-1-0-1/` shows files + `archive-report.md`; `ls openspec/changes/release-1-0-1/` → "No such file" |
| REQ-OSA-2 | WU4 / Phase C | Same pattern for `2026-08-12-release-1-0-2-cleanup/` |
| REQ-OSA-3 | WU4 / Phase C | `archive/2026-08-12-release-1-0-3-pwa/archive-report.md` explains split; `openspec/changes/release-1-0-3-pwa/` still contains Fase 3+4 in `proposal.md` + `tasks.md` |
| REQ-OSA-4 | WU4 / Phase C | `archive/2026-08-12-chore-repo-public-ready/archive-report.md` exists; `openspec/specs/repo-public-readiness/spec.md` lists promoted REQs |
| REQ-OSA-5 | WU4 / Phase C | `rg "d554317" openspec/changes/archive/2026-08-12-*/archive-report.md` → 4 hits |
| REQ-OSA-6 | WU4 / Phase C | `ls openspec/changes/` shows `archive/`, `release-1-0-3-pwa/`, `chore-docs-and-context-align-release-2-0/` only; `ls openspec/changes/archive/` shows exactly four `2026-08-12-*` folders |

## Open Questions for sdd-tasks

1. **WU1 PR slicing** — should Phase A be split into one PR per `infra/context/` file (4 small PRs ≈ 75 lines each) or kept as a single PR per folder (1 PR ≈ 300 lines)? Recommendation: single PR per WU; per-file splits add review overhead without changing blast radius.
2. **`supabase-migrations.md` trim granularity** — should the WU3 trim of §Outbox/§MP/§Incident land in its own commit (cleaner history) or roll into the runbook-header commit (fewer commits)? Recommendation: separate commit titled `docs(runbooks): trim supabase-migrations stale sections`.
3. **`release-1-0-3-pwa/` split mechanics** — keep live folder at `openspec/changes/release-1-0-3-pwa/` and only edit `proposal.md`/`tasks.md` to remove Fase 1+2 content (chosen here), or split into `release-1-0-3-pwa-fase-3-4/` (live) + `archive/2026-08-12-release-1-0-3-pwa-fase-1-2/` (historical)? Recommendation: keep the live folder name; the proposal's tasks already address Fase 3+4 as the only live scope, and the current name is the public roadmap reference in `openspec/changes/release-1-0-1/roadmap.md` lines 92-93.
4. **`openspec/specs/repo-public-readiness/` capability name** — placeholder; sdd-tasks must confirm the capability slug before promoting survivors.
