# Tasks: chore-docs-and-context-align-release-2-0

Docs-only alignment to post-release-2.0 target. 4 WUs → 3 independent PR slices on `dev` (Phase A = WU1+WU2, Phase B = WU3, Phase C = WU4). No runtime surface, no new tests: the 18 spec REQs ARE the verification contract.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines — Slice 1 (WU1+WU2) | ~300 |
| Estimated changed lines — Slice 2 (WU3) | ~100 |
| Estimated changed lines — Slice 3 (WU4) | ~250 |
| Total changed lines | ~650 (under the 800-line session budget) |
| 400-line budget risk per slice | Low / Low / Low |
| Chained PRs recommended | No |
| Suggested split | PR 1 → PR 2 → PR 3 (independent, any order) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending — force-chaining NOT required; each slice is independent and under the per-slice 400-line budget |

```text
Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low
```

`Decision needed before apply: Yes` — cached delivery strategy is `ask-on-risk`; orchestrator asks Santi before sdd-apply. Nothing flipped from the design's pre-alignment.

## Suggested Work Units

Runtime harness: **N/A for all units** — docs-only chore, no code, no services, no e2e; verification is the `rg`/`ls`/`git log` contract below (no runtime boundary exists).

| Unit | Goal | Slice | REQ(s) | Verification command | Rollback boundary |
|------|------|-------|--------|----------------------|-------------------|
| 1 | Rewrite `infra/context/{product,supabase,deployment,environments}.md` | PR 1 (Phase A) | REQ-ICR-1..6 | `rg` patterns per REQ (below) on each file | `git revert <merge-sha>` restores prior bytes; files revert independently |
| 2 | Rename ADR 0001 → `-dev.md`; extend `operational-rules.md` | PR 1 (Phase A) | REQ-AOR-1..2 | `ls docs/adr/0001-*.md`; `git log --follow`; `rg` on operational-rules | `git revert`; ADR reversible via `git mv` back |
| 3 | Refresh 4 runbooks (archive / historical / trim / delete) | PR 2 (Phase B) | REQ-RR-1..4 | `ls` archive target + source absence; `rg -i` trim check | `git revert`; archive folder `git mv` back; deleted file resurrects via revert |
| 4 | Archive 4 stale OpenSpec changes + promote survivors | PR 3 (Phase C) | REQ-OSA-1..6 | `ls` archive targets + source absence; `rg "d554317"` → 4 hits; final layout `ls` | `git revert` moves folders back; promoted spec.md deletable |

## Slice 1 — Phase A: infra/context rewrite + ADR collision (WU1 + WU2)

Branch: `chore/infra-context-and-adr-align-v2` from `dev` HEAD `d215bc0` → PR against `dev`. DoD: all 8 REQs verified, `pnpm run check` exit 0.

- [ ] A0 — Commit the change's own SDD artifacts so the stack is self-contained on dev (per `openspec/config.yaml` rules: "all artifacts are committed under the working branch"). Files: `openspec/changes/chore-docs-and-context-align-release-2-0/{exploration,proposal}.md`, `specs/*/spec.md`, `design.md`, `tasks.md`. Verify: `git ls-files openspec/changes/chore-docs-and-context-align-release-2-0/` lists all 8 files. Commit: `chore(openspec): add chore-docs-and-context-align-release-2-0 SDD artifacts`
- [x] A1 — Rewrite `infra/context/product.md` (~80 lines): remove §Billing Rules (MercadoPago L58-64), §MVP Scope MVP date (L17) + M1–M8 must-haves (L33-42), "Mobile app" non-goal (L52); describe Orvel as mobile-first PWA with explicit desktop-only carve-out citing `docs/diagrams/01-monorepo-architecture.md` and `openspec/changes/release-1-0-3-pwa/proposal.md` §Out of Scope. REQ-ICR-1, -2, -3. Verify: `rg -i "Mercado\s?Pago|MP preapproval" infra/context/product.md` → 0; `rg -i "mobile-first PWA|desktop-only" infra/context/product.md` → ≥1 each; `rg "MVP.*June|M1|M2|M3|M4|M5|M6|M7|M8" infra/context/product.md` → 0. Commit: `chore(infra): rewrite product.md for release-2.0 (drop MP, mobile-first PWA)`
- [x] A2 — Rewrite `infra/context/supabase.md`: replace dead-branch block (L12), incident block (L14), MP-preapproval migration (L29) with active ref `orvel-qa-dev` + note that archived migrations live under `supabase/migrations/_legacy/`; keep §Safety Constraints verbatim. REQ-ICR-4. Verify: `rg "orvel-qa-dev" infra/context/supabase.md` → ≥1; `rg "feat/import-orvel-repos|2026-07-12|20260508000000_mp_preapproval_plan_sprint1" infra/context/supabase.md` → 0. Commit: `chore(infra): rewrite supabase.md for orvel-qa-dev ref + _legacy_ note`
- [x] A3 — Rewrite `infra/context/deployment.md` (~40 lines, design shape §Interfaces): §Branch Promotion (3-env) `feature → dev → qa → main` with per-branch protection (linear history, 1 review, required CI `dashboard-booking-regressions` from `.github/workflows/booking-regression.yml`, `enforce_admins: true`), admin-workaround gated on Santi approval; §Environments dev/qa/main roles; §Source-of-truth → root `AGENTS.md` §3 + `operational-rules.md`. REQ-ICR-5. Verify: `rg "feature.*dev.*qa.*main|dashboard-booking-regressions" infra/context/deployment.md` → ≥1 each. Commit: `chore(infra): document 3-env promotion and CI gate in deployment.md`
- [x] A4 — Rewrite `infra/context/environments.md`: four distinct sections `## Local development`, `## dev`, `## qa`, `## main` (env var names only, never values); delete the "No environment names verified" line. REQ-ICR-6. Verify: `grep -E "^## (Local development|dev|qa|main)" infra/context/environments.md` lists ≥4 sections; `rg "no environment names verified" infra/context/environments.md` → 0. Commit: `chore(infra): add dev/qa/main sections to environments.md`
- [x] A5 — `mkdir docs/adr` exists; `git mv docs/adr/0001-orvel-monorepo-architecture.md docs/adr/0001-orvel-monorepo-architecture-dev.md`; edit `## Status` block to add: "Renamed for release-2.0 collision; slot reserved for `0001-schema-principles.md`". REQ-AOR-1. Verify: `ls docs/adr/0001-*.md` shows only `0001-orvel-monorepo-architecture-dev.md`; `git log --follow --oneline -- docs/adr/0001-orvel-monorepo-architecture-dev.md` shows pre-rename history; Status block contains `0001-schema-principles.md`. Commit: `chore(docs): rename ADR 0001 to release-2-0 collision-safe name`
- [x] A6 — Append §"Branch Promotion (3-env)" to `infra/context/operational-rules.md`, mirroring root `AGENTS.md` §3 (sequence, protection + required check `dashboard-booking-regressions`, admin-workaround gated on Santi approval). REQ-AOR-2. Verify: `rg "feature.*dev.*qa.*main|dashboard-booking-regressions" infra/context/operational-rules.md` → ≥1 each. Commit: `chore(infra): document branch promotion and CI gate in operational-rules.md`
- [ ] A7 — Slice DoD: run all 8 per-REQ verification commands above on the branch; run `pnpm run check` (root, runs dashboard+landing build + supabase critical tests) → exit 0. Verify: `git status --short` shows only the 7 intended files (`infra/context/{product,supabase,deployment,environments,operational-rules}.md`, `docs/adr/0001-orvel-monorepo-architecture-dev.md`, change artifacts) — never `infra/context/architecture.md` or `docs/diagrams/`. Then push branch + open PR against `dev` (auto-push workflow OK; merge requires explicit Santi approval).

## Slice 2 — Phase B: runbook refresh (WU3)

Branch: `chore/runbooks-refresh-v2` from `dev` → PR against `dev`. DoD: all 4 REQs verified; `ls docs/runbooks/trial-user-activation-reminder.md` → "No such file".

- [x] B1 — `git mv docs/runbooks/account-closure.md docs/runbooks/archive/2026-08-12-account-closure.md`; prepended header `status: archived, function → 501 stub per release-2.0`. REQ-RR-1 verified (archive exists; header hit; source gone). Commit: `chore(docs): archive account-closure runbook (function → 501 stub)` (92d7e6d)
- [x] B2 — Prepended header `status: historical, migration complete`; rewrote body as historical record (dropped §Safe Procedure steps 1-7 + active-workflow intro). REQ-RR-2 verified (header hit; active-workflow prose 0 hits; imperative steps 0 hits). Commit: `chore(docs): mark monorepo-migration runbook historical` (24e9f32)
- [x] B3 — Trimmed `docs/runbooks/supabase-migrations.md`: dropped §Current Known State (ref `tzqgwziyiospmvpdgbnt`), §Incident Note, §Booking Lifecycle Email Outbox; kept Mandatory Rule / Safe Procedure / Prohibited / Recovery verbatim; added trim note near top (rephrased to avoid forbidden tokens). REQ-RR-3 verified (spec pattern 0 hits; mandate sweep 0 hits). Commit: `chore(docs): trim supabase-migrations runbook (drop outbox/MP/old ref sections)` (99182d6)
- [x] B4 — `git rm docs/runbooks/trial-user-activation-reminder.md` (Decision 5 — cron purged in target; dev-vs-target conflict is worse than no doc). REQ-RR-4 verified ("No such file"; `git log` still shows pre-delete history). Commit: `chore(docs): delete trial-user-activation-reminder runbook (function purged in release-2.0)` (c4a70de)
- [ ] B5 — Slice DoD: 4 REQ checks DONE; `pnpm run check` NOT run locally (docs-only diff; requires postgres for trial-reminder checks; runs as CI gate `dashboard-booking-regressions` on the PR); branch `chore/runbooks-refresh-v2` pushed + PR opened against `dev` (merge requires explicit Santi approval).

## Slice 3 — Phase C: OpenSpec stale-change archive (WU4)

Branch: `chore/openspec-stale-changes-archive-v2` from `dev` → PR against `dev`. DoD: all 6 REQs verified; final layout per REQ-OSA-6. Archive-report template per design §Interfaces (Why archived / Precedent d554317 / Where it lives now / What survives / Archive contents).

- [x] C1 — `git mv openspec/changes/release-1-0-1 openspec/changes/archive/2026-08-12-release-1-0-1`; write `archive-report.md`: outbox specs invalidated by target (email-outbox-cleanup already promoted by `d554317`); "What survives: none — entirely invalidated by target state" unless orchestrator confirms otherwise. REQ-OSA-1. Verify: `ls openspec/changes/archive/2026-08-12-release-1-0-1/` shows proposal/design/tasks/roadmap/specs + archive-report.md; `ls openspec/changes/release-1-0-1/` → "No such file". Commit: `chore(openspec): archive stale release-1-0-1 change folder per d554317`
- [x] C2 — `git mv openspec/changes/release-1-0-2-cleanup openspec/changes/archive/2026-08-12-release-1-0-2-cleanup`; write `archive-report.md` noting email-templates limited in target. REQ-OSA-2. Verify: archive folder listing shows files + archive-report.md; source folder gone. Commit: `chore(openspec): archive stale release-1-0-2-cleanup change folder per d554317`
- [x] C3 — release-1-0-3-pwa partial archive (REQ-OSA-3). FIRST read `openspec/changes/release-1-0-3-pwa/proposal.md` §2.1/§2.2 + `tasks.md` header to classify: Fase 1+2 = shipped (PR #180 `c1127a0`), Fase 3+4 = open. Then: (a) create `openspec/changes/archive/2026-08-12-release-1-0-3-pwa/` with `archive-report.md` explaining the split + `fase-1-2-shipped.md` (verbatim §2.1 excerpt captured BEFORE editing the live file); (b) edit live `proposal.md` to drop §2.1 "Already Shipped — DO NOT RE-DESIGN" block (keep §2.2 Fase 3 + Fase 4, §Out of Scope, locked decisions); (c) edit live `tasks.md` to drop the "Retroactive for Fase 1+2 (shipped, PR #180/`c1127a0`)" header sentence (keep PR #1/#2/#3 Fase 3+4 forward work). Verify: `rg "Already Shipped|DO NOT RE-DESIGN|PR #180" openspec/changes/release-1-0-3-pwa/proposal.md openspec/changes/release-1-0-3-pwa/tasks.md` → 0; `rg "Fase 3|Fase 4" openspec/changes/release-1-0-3-pwa/proposal.md` → ≥1 each; archive-report.md explains the Fase 1+2 / Fase 3+4 boundary. Commit: `chore(openspec): partially archive release-1-0-3-pwa (Fase 1+2 shipped, Fase 3+4 live)`
- [x] C4 — `git mv openspec/changes/chore-repo-public-ready openspec/changes/archive/2026-08-12-chore-repo-public-ready`; write `archive-report.md`; create `openspec/specs/repo-public-readiness/spec.md` (greenfield — `openspec/specs/` is empty on dev) promoting the still-valid Tasks §1-10 REQs: LICENSE present, CONTRIBUTING.md present, SECURITY.md present, CODEOWNERS present, `.gitignore` covers sensitive patterns, zero `tzqgwziyiospmvpdgbnt` refs in current code/docs. REQ-OSA-4. Verify: `ls openspec/changes/archive/2026-08-12-chore-repo-public-ready/archive-report.md` exists; `ls openspec/specs/repo-public-readiness/spec.md` exists and lists the promoted REQs; `ls openspec/changes/chore-repo-public-ready/` → "No such file". Commit: `chore(openspec): archive chore-repo-public-ready + promote repo-readiness REQs`
- [x] C5 — Confirm every archive-report cites the precedent (REQ-OSA-5). Verify: `rg "d554317" openspec/changes/archive/2026-08-12-*/archive-report.md` → exactly 4 hits (one per report).
- [x] C6 — Slice DoD + final layout (REQ-OSA-6). Verify: `ls openspec/changes/` shows exactly `archive/`, `release-1-0-3-pwa/`, `chore-docs-and-context-align-release-2-0/`; `ls openspec/changes/archive/` shows exactly four `2026-08-12-*` folders. Then `pnpm run check` → exit 0; push branch + open PR against `dev` (merge requires explicit Santi approval).

## Dependencies

- Slice 1: no external dependency; lands first (recommended). Slices 2 and 3 have no dependency on Slice 1 or each other — parallel landing is technically possible (all three branch from `d215bc0`).
- Recommended order: Slice 1 → Slice 2 → Slice 3 (sequential, clean review). If parallel is chosen, later slices rebase onto dev after each merge; no cross-slice content conflicts (disjoint file sets).
- release-2.0 branches are informational only (Decision 2: ADRs 0001-0004 NOT imported; wait for merge).

## Rollback per Slice

| Slice | Rollback action |
|-------|-----------------|
| 1 | `git revert <merge-sha>` on dev restores prior `infra/context/*.md` bytes and ADR filename. ADR rename also reversible via `git mv` back. |
| 2 | `git revert <merge-sha>` restores runbook bytes; archive folder reversible via `git mv docs/runbooks/archive/2026-08-12-account-closure.md docs/runbooks/account-closure.md`; `trial-user-activation-reminder.md` resurrects via revert. |
| 3 | `git revert <merge-sha>` reverses the archive moves (folders back to `openspec/changes/<name>/`); live `release-1-0-3-pwa` edits revert (restores §2.1); promoted `openspec/specs/repo-public-readiness/spec.md` deletable. |

Worst case (release-2.0 merged mid-change): revert the affected slice, re-apply only its moves against the post-merge tree.

## Conventional Commit Messages (all slices)

`chore(openspec): add chore-docs-and-context-align-release-2-0 SDD artifacts` · `chore(infra): rewrite product.md for release-2.0 (drop MP, mobile-first PWA)` · `chore(infra): rewrite supabase.md for orvel-qa-dev ref + _legacy_ note` · `chore(infra): document 3-env promotion and CI gate in deployment.md` · `chore(infra): add dev/qa/main sections to environments.md` · `chore(docs): rename ADR 0001 to release-2-0 collision-safe name` · `chore(infra): document branch promotion and CI gate in operational-rules.md` · `chore(docs): archive obsolete account-closure runbook (501 stub in target)` · `docs(runbooks): mark monorepo-migration historical` · `docs(runbooks): trim supabase-migrations stale sections` · `chore(docs): delete trial-user-activation-reminder runbook (cron purged in target)` · `chore(openspec): archive stale release-1-0-1 change folder per d554317` · `chore(openspec): archive stale release-1-0-2-cleanup change folder per d554317` · `chore(openspec): partially archive release-1-0-3-pwa (Fase 1+2 shipped, Fase 3+4 live)` · `chore(openspec): archive chore-repo-public-ready + promote repo-readiness REQs`. No `Co-authored-by`, no AI attribution.

## Rules of Advance

- **Strict TDD**: docs-only chore has no RED tests; the 18 spec REQs ARE the contract. Every task runs its verification command before being marked complete.
- **Conventional commits only** (list above); no AI attribution.
- **400-line per-PR ceiling** — each slice is well under (300/100/250).
- **3-branch promotion**: PRs land on `dev`; never `qa`/`main` directly.
- **No merge without explicit Santi approval per PR** (auto-push + auto-open PR is allowed; merge is not).
- **No Supabase destructive commands** (no migration ops in this change at all).
- Do NOT touch `infra/context/architecture.md` (already rewritten on dev, out of scope) or untracked `docs/diagrams/`.

## Risks

1. **Deviation from release-2.0 branches** — ADRs 0001-0004 + `migration-inventory/` not imported; docs may lag if those branches mutate before merge. Mitigation: Decision 2 defers; WU1+WU2 describe only dev truth.
2. **release-1-0-3-pwa split misclassification** — C3 reads `proposal.md` §2.1/§2.2 + `tasks.md` before splitting; archive-report documents the boundary; orchestrator asks on ambiguity.
3. **Archive-convention drift** — `openspec/changes/archive/` is empty on dev; `d554317` is the only precedent. Mitigation: follow it verbatim + REQ-OSA-5 mandates citation in all four reports.
4. **Scope creep** — `architecture.md` and `docs/diagrams/` must not appear in any slice diff; A7/B5/C6 verify `git status` scope.
5. **ADR 0001 filename race + slug ambiguity** — if release-2.0 merges mid-change, `git mv` history is preserved and revert is clean; `repo-public-readiness` is a placeholder slug pending confirmation (Open Q1).

## Open Questions for sdd-apply

1. **Capability slug for `chore-repo-public-ready` survivors**: propose `repo-public-readiness` (placeholder from design Risk #1). Orchestrator confirms before C4 runs.
2. **Sequential vs parallel landing of the 3 slices**: recommend sequential (Slice 1 → 2 → 3) for clean review. Orchestrator confirms with Santi.
3. **C1/C2 survivor promotion**: default "no promotion" for `release-1-0-1` (email-outbox-cleanup already promoted via `d554317`) and `release-1-0-2-cleanup`; orchestrator confirms if any REQ should be promoted instead.
