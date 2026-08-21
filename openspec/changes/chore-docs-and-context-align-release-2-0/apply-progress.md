# Apply Progress — chore-docs-and-context-align-release-2-0 (Slice 1/3)

## What applied

Slice 1 = Phase A = WU1 (infra/context rewrite, 4 files) + WU2 (ADR rename + operational-rules). Branch `chore/infra-context-and-adr-align-v2` from `dev` HEAD `d215bc0`. Docs-only; no product code touched.

- WU1 `infra/context/product.md` — dropped MercadoPago/Mercado Pago/MP preapproval, MVP June 2026 target, M1–M8 must-haves, "Mobile app" non-goal; reframed as mobile-first PWA (`@angular/pwa`) with explicit desktop-only carve-out citing `openspec/changes/release-1-0-3-pwa/proposal.md` and `docs/diagrams/01-monorepo-architecture.md`.
- WU1 `infra/context/supabase.md` — active ref `orvel-qa-dev`; `supabase/migrations/_legacy/` archive note; dropped `feat/import-orvel-repos` branch, 2026-07-12 incident block, `20260508000000_mp_preapproval_plan_sprint1.sql`; Safety Constraints preserved verbatim.
- WU1 `infra/context/deployment.md` — `feature → dev → qa → main` promotion, per-branch protection (linear history, 1 review, `dashboard-booking-regressions` required CI from `.github/workflows/booking-regression.yml` line 18, `enforce_admins: true`), admin workaround gated on Santi approval, source-of-truth pointers.
- WU1 `infra/context/environments.md` — distinct `## Local development` / `## dev` / `## qa` / `## main` sections; env var names only (verified from source via grep: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `DASHBOARD_URL`/`PUBLIC_DASHBOARD_URL`, `PUBLIC_LANDING_URL`); `orvel-qa-dev` named for qa; prod linkage via `supabase/production-project-ref.sha256` digest.
- WU2 `git mv docs/adr/0001-orvel-monorepo-architecture.md → docs/adr/0001-orvel-monorepo-architecture-dev.md`; `## Status` note: "Renamed for release-2.0 ADR 0001 collision; slot reserved for `0001-schema-principles.md` from `origin/feature/release-2-0-phase1-adrs-part1` when that branch merges to dev."
- WU2 `infra/context/operational-rules.md` — appended `## 3-Environment Promotion` (flow table + hard rules mirroring root `AGENTS.md` §3) and `## CI Gate` (required check `dashboard-booking-regressions`, `pnpm run check`, no force/reset/secret rules).

Not applied (out of this delegation's scope, per orchestrator mandate): A0 SDD-artifacts commit, Slice 2 (WU3 runbooks), Slice 3 (WU4 archive). `infra/context/architecture.md` and `docs/diagrams/` untouched.

## REQs verified (8/8)

Tooling note: `rg` is not available on this Windows shell; all checks ran with GNU `grep -E` (Git for Windows), same regex semantics and exit codes.

| REQ | Command | Expected | Actual |
|-----|---------|----------|--------|
| REQ-ICR-1 | `grep -E "MercadoPago\|Mercado Pago\|MP preapproval" infra/context/product.md` | 0 hits | 0 hits |
| REQ-ICR-2 | `grep -iE "mobile-first PWA\|@angular/pwa" infra/context/product.md` | ≥1 hit | 4 hits |
| REQ-ICR-3 | `grep -E "MVP.*June.*2026\|M1: \|M2: \|M3: \|M4: \|M5: \|M6: \|M7: \|M8: " infra/context/product.md` | 0 hits | 0 hits |
| REQ-ICR-4 | `grep -E "feat/import-orvel-repos\|tzqgwziyiospmvpdgbnt\|20260508000000_mp_preapproval_plan_sprint1" infra/context/supabase.md` | 0 hits | 0 hits |
| REQ-ICR-4b | `grep -c "orvel-qa-dev" infra/context/supabase.md` | ≥1 hit | 1 hit |
| REQ-ICR-5 | `grep -c "feature → dev → qa → main" infra/context/deployment.md` / `grep -c "dashboard-booking-regressions" infra/context/deployment.md` | ≥1 each | 1 / 2 hits |
| REQ-ICR-6 | `grep -E "^## (Local development\|dev\|qa\|main)" infra/context/environments.md`; `grep -iE "No environment names verified\|No URLs verified" infra/context/environments.md` | 4 sections; 0 hits | 4 sections; 0 hits |
| REQ-AOR-1 | `ls docs/adr/0001-orvel-monorepo-architecture-dev.md`; `ls docs/adr/0001-orvel-monorepo-architecture.md`; Status block note; `git log --follow --oneline -- docs/adr/0001-orvel-monorepo-architecture-dev.md` | exists; gone; note present; pre-rename history | exists; gone; note present; 3 commits incl. pre-rename |
| REQ-AOR-2 | `grep -c "feature → dev → qa → main" infra/context/operational-rules.md` / `grep -c "dashboard-booking-regressions" infra/context/operational-rules.md` | ≥1 each | 1 / 2 hits |

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result | Per-REQ grep commands above — all 8 REQs pass on the branch |
| Runtime harness | N/A — docs-only chore, no code/service/e2e runtime boundary exists (per tasks.md "Runtime harness: N/A for all units") |
| Rollback boundary | `git revert <merge-sha>` on dev restores prior `infra/context/*.md` bytes and ADR filename; ADR rename reversible via `git mv` back; each of the 6 commits touches exactly one file (independent rollback) |

## Commits (6, one per file, conventional)

- `chore(infra): rewrite product.md for release-2.0 (drop MP, mobile-first PWA)` — df5afdf
- `chore(infra): rewrite supabase.md for orvel-qa-dev ref + _legacy_ note` — 9f68b92
- `chore(infra): rewrite deployment.md for 3-env promotion + CI gate` — 7f50bc8
- `chore(infra): rewrite environments.md with dev/qa/main sections` — 31a9ff8
- `chore(docs): rename ADR 0001 to release-2-0 collision-safe name` — 2d78eea (rename detected, history preserved)
- `chore(infra): document 3-env promotion + CI gate in operational-rules.md` — 95e344f

Changed lines: 78 additions + 64 deletions = 142 (under the 400-line slice ceiling).

## PR URL

https://github.com/Santidele22/orvel/pull/211 (base `dev`, head `chore/infra-context-and-adr-align-v2`) — opened, NOT merged (merge requires explicit Santi approval).

## Notes for Slice 2 and Slice 3

- **Slice 2 (WU3 runbooks)**: branch `chore/runbooks-refresh-v2` from `dev`; independent of Slice 1. Includes `git mv` to `docs/runbooks/archive/` and `git rm trial-user-activation-reminder.md`; confirm `docs/runbooks/archive` target dir exists before `git mv` (B1).
- **Slice 3 (WU4 archive)**: branch `chore/openspec-stale-changes-archive-v2` from `dev`; follows `d554317` precedent; C3 must read `release-1-0-3-pwa/proposal.md` §2.1/§2.2 before splitting. Capability slug `repo-public-readiness` is a placeholder — orchestrator confirms before C4.
- **`pnpm run check`**: NOT run locally — requires a postgres environment for the trial-reminder checks and the diff is markdown-only; the `dashboard-booking-regressions` CI gate runs it on the PR (required on protected branches per root `AGENTS.md` §3). Confirmed via `package.json`: `check` = dashboard + landing builds, critical supabase function tests, deno check, trial-reminder CI.
- **Task A0 (commit SDD artifacts)** was not part of this delegation (orchestrator's explicit scope: WU1+WU2 only). The change folder `openspec/changes/chore-docs-and-context-align-release-2-0/` remains untracked; A0 should be handled by the orchestrator before/with verify so the stack is self-contained on dev.
- `rg` unavailable on this machine (win32, pwsh); GNU `grep -E` used throughout — CI uses `rg`-free paths so no CI implication.

---

# Apply Progress — chore-docs-and-context-align-release-2-0 (Slice 2/3)

## What applied

Slice 2 = Phase B = WU3 (runbook refresh, 4 files / 4 operations). Branch `chore/runbooks-refresh-v2` from `dev` HEAD `d215bc0`. Docs-only; no product code touched.

- REQ-RR-1 — `git mv docs/runbooks/account-closure.md docs/runbooks/archive/2026-08-12-account-closure.md` (rename 95%, history preserved); prepended header `status: archived, function → 501 stub per release-2.0` + `archived-on: 2026-08-12`. `docs/runbooks/archive/` directory created (was absent).
- REQ-RR-2 — `docs/runbooks/monorepo-migration.md`: prepended header `status: historical, migration complete`; rewrote body as a historical record of source/target locations (dropped imperative §Safe Procedure steps 1-7, active-workflow intro, dirty-source-repo prose, active Stop Conditions).
- REQ-RR-3 — `docs/runbooks/supabase-migrations.md`: dropped §Current Known State (ref `tzqgwziyiospmvpdgbnt`), §Incident Note (outbox/MP recovery), §Booking Lifecycle Email Outbox (49 lines); kept §Mandatory Rule, §Safe Procedure, §Prohibited, §Documentation After Change, all three Recovery sections, §Admin Booking Cancel RPC Compatibility verbatim. Added near-top trim note (rephrased to avoid forbidden tokens — see below).
- REQ-RR-4 — `git rm docs/runbooks/trial-user-activation-reminder.md` (Decision 5); `git log` on the deleted path still shows full history incl. `cec106c`/`e6825f5` pre-delete commits.

## REQs verified (4/4)

Tooling note: `rg` AND GNU `grep` are both unavailable on this shell; all checks ran with PowerShell `Select-String` (regex-compatible). Two Select-String caveats surfaced: it defaults to case-INSENSITIVE (spec `rg -i` variant matched exactly), so a raw case-sensitive sweep needed `-CaseSensitive`.

| REQ | Command | Expected | Actual |
|-----|---------|----------|--------|
| REQ-RR-1 | `Test-Path docs/runbooks/archive/2026-08-12-account-closure.md`; `Select-String "^status: archived"`; `Test-Path docs/runbooks/account-closure.md` | exists; ≥1 hit; gone | exists; 1 hit; gone |
| REQ-RR-1 sanity | `Select-String "function → 501 stub"` on archive | ≥1 hit | 1 hit |
| REQ-RR-2 | `Select-String "^status: historical"` on monorepo-migration.md; `Select-String "active source-repo workflow\|active source repos"` (ci) | ≥1; 0 | 1 hit; 0 hits |
| REQ-RR-3 | `Select-String -Pattern "outbox\|Mercado\s?Pago\|tzqgwziyiospmvpdgbnt"` (spec, ci-equivalent) on supabase-migrations.md | 0 hits | 0 hits |
| REQ-RR-3 sweep | `Select-String -CaseSensitive "outbox recovery\|MP migration\|tzqgwziyiospmvpdgbnt"` | 0 hits | 0 hits |
| REQ-RR-4 | `Test-Path docs/runbooks/trial-user-activation-reminder.md`; `git log --oneline -- <path>` | gone; history remains | gone; 3 commits shown incl. pre-delete |

False-positive note: the case-insensitive sweep `"MP migration"` matched the legitimate "full-**timestamp migration**" phrasing kept verbatim in §Fix-Forward/Recovery (mandate says keep forward-migration ordering rules intact). Under `rg` semantics (case-sensitive) the sweep returns 0 hits; the spec pattern (`rg -i "outbox|Mercado\s?Pago|tzqgwziyiospmvpdgbnt"`) returns 0 hits under either case mode. No action needed.

Trim-note deviation: the mandate's suggested note text ("Sections about outbox recovery, MP migration, and the old project ref were trimmed...") contains "outbox", which would itself fail REQ-RR-3's zero-hit contract. Rephrased to: "Stale recovery sections and the legacy project reference were trimmed on 2026-08-12 because release-2.0 purged the corresponding code paths. See `docs/runbooks/archive/` for historical references."

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result | Per-REQ Select-String/git commands above — all 4 REQs pass on the branch |
| Runtime harness | N/A — docs-only chore, no code/service/e2e runtime boundary exists (per tasks.md "Runtime harness: N/A for all units") |
| Rollback boundary | `git revert <merge-sha>` on dev restores runbook bytes; archive reversible via `git mv docs/runbooks/archive/2026-08-12-account-closure.md docs/runbooks/account-closure.md`; `trial-user-activation-reminder.md` resurrects via revert; each of the 4 commits touches exactly one file (independent rollback) |

## Commits (4, one per file, conventional)

- `chore(docs): archive account-closure runbook (function → 501 stub)` — 92d7e6d
- `chore(docs): mark monorepo-migration runbook historical` — 24e9f32
- `chore(docs): trim supabase-migrations runbook (drop outbox/MP/old ref sections)` — 99182d6
- `chore(docs): delete trial-user-activation-reminder runbook (function purged in release-2.0)` — c4a70de

Changed lines: 15 additions + 157 deletions = 172 (under the 200-line slice ceiling).

## PR URL

https://github.com/Santidele22/orvel/pull/212 (base `dev`, head `chore/runbooks-refresh-v2`) — opened, NOT merged (merge requires explicit Santi approval).

## Notes for Slice 3

- **Slice 3 (WU4 archive)**: branch `chore/openspec-stale-changes-archive-v2` from `dev`; independent of Slices 1 and 2 (disjoint file sets). Follows `d554317` precedent; C3 must read `release-1-0-3-pwa/proposal.md` §2.1/§2.2 before splitting. Capability slug `repo-public-readiness` is a placeholder — orchestrator confirms before C4.
- **`pnpm run check`**: NOT run locally — docs-only diff; requires a postgres environment for the trial-reminder checks; the `dashboard-booking-regressions` CI gate runs it on the PR (required on protected branches per root `AGENTS.md` §3).
- **Task A0** (commit SDD artifacts) still not part of any delegation; the change folder `openspec/changes/chore-docs-and-context-align-release-2-0/` remains untracked. Orchestrator should handle A0 before verify.
- Tooling note updated: neither `rg` nor GNU `grep` on PATH this session; `Select-String` used (default case-insensitive, `-CaseSensitive` for rg-equivalent sweeps).

---

# Apply Progress — chore-docs-and-context-align-release-2-0 (Slice 3/3)

## What applied

Slice 3 = Phase C = WU4 (OpenSpec stale-change archive: 4 folders archived + 1 capability promotion). Branch `chore/openspec-stale-changes-archive-v2` from `dev` HEAD `d215bc0`. Docs-only; no product code touched. Precedent followed verbatim: commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`, archive at `openspec/changes/archive/2026-08-02-*` with `archive-report.md` + promotion to `openspec/specs/`).

- REQ-OSA-1 — `git mv openspec/changes/release-1-0-1 openspec/changes/archive/2026-08-12-release-1-0-1` (8 files, 100% rename detection) + `archive-report.md`: outbox specs invalidated by release-2.0 target; no promotion (`email-outbox-cleanup` already promoted by `d554317`). Commit `b8a84c1`.
- REQ-OSA-2 — `git mv openspec/changes/release-1-0-2-cleanup openspec/changes/archive/2026-08-12-release-1-0-2-cleanup` (8 files) + `archive-report.md`: email-templates shared surface limited in target; no promotion. Commit `baf7b77`.
- REQ-OSA-3 — partial archive: whole folder `git mv` → `openspec/changes/archive/2026-08-12-release-1-0-3-pwa/` (original proposal with §2.1 Fase 1+2 "Already Shipped" record preserved verbatim via git mv) + `archive-report.md` explaining the split. Live folder re-created at `openspec/changes/release-1-0-3-pwa/`: `proposal.md` edited (dropped §2.1 "Already Shipped — DO NOT RE-DESIGN" block, opening rephrased to Fase 3+4 forward-only scope), `design.md`/`tasks.md`/both specs kept as-is (byte-identity verified via `git hash-object` before copy). Commits `1e936ee` (archive) + `cfea1d9` (re-scope).
- REQ-OSA-4 — `git mv openspec/changes/chore-repo-public-ready openspec/changes/archive/2026-08-12-chore-repo-public-ready` + `archive-report.md`; 6 surviving REQs promoted to `openspec/specs/repo-public-readiness/spec.md` (capability `repo-public-readiness`): LICENSE present, CONTRIBUTING.md present, SECURITY.md present, CODEOWNERS present, .gitignore sensitive-pattern coverage, zero `tzqgwziyiospmvpdgbnt` refs. These are forward requirements — on dev HEAD several are not yet satisfied (LICENSE/CONTRIBUTING/SECURITY/CODEOWNERS absent; `tzqgwziyiospmvpdgbnt` still in `apps/dashboard/src/environments/environment*.ts`). Commit `bf39abb`.
- REQ-OSA-5 — every `archive-report.md` cites `d554317` (4/4).
- REQ-OSA-6 — final layout verified (below).

## REQs verified (6/6)

Tooling note: `rg`/GNU `grep` unavailable on this shell; `Select-String` (PowerShell, regex-compatible) used throughout, matching Slice 1/2 fallback.

| REQ | Command | Expected | Actual |
|-----|---------|----------|--------|
| REQ-OSA-1 | `Get-ChildItem openspec/changes/archive/2026-08-12-release-1-0-1` + `Test-Path openspec/changes/release-1-0-1` | 8 files + archive-report.md; original gone | 8 files + archive-report.md (21 lines); original gone (False) |
| REQ-OSA-2 | `Get-ChildItem openspec/changes/archive/2026-08-12-release-1-0-2-cleanup` + `Test-Path openspec/changes/release-1-0-2-cleanup` | files + archive-report.md; original gone | 8 files + archive-report.md; original gone (False) |
| REQ-OSA-3 | `Test-Path openspec/changes/archive/2026-08-12-release-1-0-3-pwa/archive-report.md`; `Select-String "Fase 3"` / `"Fase 4"` on live proposal.md; `Select-String "Already Shipped"` on live proposal.md | report explains split; ≥1 each; 0 hits | report explains split (4 split-boundary hits); 11 / 8 hits; 0 hits |
| REQ-OSA-4 | `Test-Path openspec/specs/repo-public-readiness/spec.md`; `Test-Path openspec/changes/chore-repo-public-ready` | exists; gone | exists (6 REQs); gone (False) |
| REQ-OSA-5 | `Select-String "d554317" openspec/changes/archive/2026-08-12-*/archive-report.md` | 4 hits (one per report) | 4/4 reports cite it (1-2 hits each; release-1-0-1 has 2 — precedent + already-promoted spec ref) |
| REQ-OSA-6 | `Get-ChildItem openspec/changes`; `Get-ChildItem openspec/changes/archive` | exactly `archive/`, `release-1-0-3-pwa/`, `chore-docs-and-context-align-release-2-0/`; exactly four 2026-08-12-* folders | 3 entries match; 4 folders match |

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result | Per-REQ Select-String/Test-Path/git-hash-object commands above — all 6 REQs pass on the branch |
| Runtime harness | N/A — docs-only chore, no code/service/e2e runtime boundary exists (per tasks.md "Runtime harness: N/A for all units") |
| Rollback boundary | `git revert <merge-sha>` on dev reverses the archive moves (folders back to `openspec/changes/<name>/`); live `release-1-0-3-pwa` edits revert (restores §2.1); promoted `openspec/specs/repo-public-readiness/spec.md` deletable; each of the 5 commits is independently revertible |

## Commits (5, conventional)

- `chore(openspec): archive release-1-0-1 per d554317 precedent` — b8a84c1
- `chore(openspec): archive release-1-0-2-cleanup per d554317 precedent` — baf7b77
- `chore(openspec): archive release-1-0-3-pwa Fase 1+2 per d554317 precedent` — 1e936ee
- `chore(openspec): re-scope release-1-0-3-pwa to Fase 3+4 forward only` — cfea1d9
- `chore(openspec): archive chore-repo-public-ready + promote repo-public-readiness specs` — bf39abb

Authored delta (new content written): ~190 lines (4 archive-reports + promotion spec + proposal.md re-scope edit). Raw `git diff d215bc0 HEAD` shows 770 insertions / 22 deletions — inflated by 456 lines of byte-identical archive copies of `release-1-0-3-pwa/{design,tasks,specs}` created by the mandate's prescribed git-mv-then-recreate mechanics (content exists identically in both archive and live folders; git counts the archive copies as new because the live paths are unchanged). Under the work-unit-commits rule (count authored additions/deletions), the slice is ~190 lines — well under the 600 ceiling and the ~250 target.

## PR URL

https://github.com/Santidele22/orvel/pull/213 (base `dev`, head `chore/openspec-stale-changes-archive-v2`) — opened, NOT merged (merge requires explicit Santi approval).

## Notes for verify

- **Task A0** (commit SDD artifacts) still not part of any delegation; `openspec/changes/chore-docs-and-context-align-release-2-0/` remains untracked (consistent with Slices 1-2). Orchestrator should handle A0 before/with verify.
- **C3 verification nuance**: tasks.md C3's check `rg "Already Shipped|DO NOT RE-DESIGN|PR #180"` across live `tasks.md` → 0 hits is superseded by the mandate's explicit instruction "tasks.md: keep as-is (PR #1/PR #2/PR #3 forward)" — live `tasks.md` retains the header sentence "Retroactive for Fase 1+2 (shipped, PR #180/c1127a0)". The spec-level REQ-OSA-3 scenario (archive holds Fase 1+2 + report; live holds Fase 3+4 as open work) passes as written.
- **Promotion honesty**: `repo-public-readiness` REQs are forward contracts, not status claims. Slice-1 PR #211 (infra/context rewrite) also removes `tzqgwziyiospmvpdgbnt` from `infra/context/*`; the two env files still carry it on dev — verify phase should confirm whether the release-2.0 branches purge them or a follow-up change is needed.
- `pnpm run check` NOT run locally — docs-only diff; `dashboard-booking-regressions` CI gate runs it on the PR (required on protected branches per root AGENTS.md §3).
