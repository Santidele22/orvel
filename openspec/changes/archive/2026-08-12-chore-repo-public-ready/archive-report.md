# Archive Report: chore-repo-public-ready

## Why archived

The repo went public on 2026-07-28 and the one-shot cleanup checklist (`chore-repo-public-ready`) was superseded before completion: the release-2.0 work reworked the exact surfaces this change targeted (deployment pipeline, Supabase refs, environments), and the follow-up items that remain valid are now standing repo-readiness requirements instead of a one-shot change. The proposal itself was never implemented as a change (no design/tasks/specs were written); its surviving checklist items are promoted below so the contract does not die with the folder.

## Precedent

This archive follows the convention established by commit `d554317` (`release-2-0-cleanup-pr-2-email-outbox` → `email-outbox-cleanup`): `openspec/changes/archive/YYYY-MM-DD-<name>/<full-folder>` + `archive-report.md` + promote surviving REQs to `openspec/specs/<capability>/spec.md`.

## Where it lives now

This folder is terminal; no live successor. The surviving requirements live on at `openspec/specs/repo-public-readiness/spec.md`.

## What survives

Promoted to `openspec/specs/repo-public-readiness/spec.md` (capability `repo-public-readiness`):

- **LICENSE present** — OSI-approved license at repo root.
- **CONTRIBUTING.md present** — local dev + testing (Strict TDD per ADR-015) + PR/commit conventions.
- **SECURITY.md present** — vulnerability reporting path.
- **CODEOWNERS present** — Santi owner of `.github/workflows/`, `openspec/`, `supabase/migrations/`.
- **.gitignore covers sensitive patterns** — all patterns from proposal Tasks §7.
- **Zero `tzqgwziyiospmvpdgbnt` refs in current code/docs** — the legacy personal Supabase ref must not appear in the working tree.

Note: several promoted REQs are forward requirements — on dev HEAD `d215bc0`, LICENSE/CONTRIBUTING.md/SECURITY.md/.github/CODEOWNERS do not exist yet and `tzqgwziyiospmvpdgbnt` still appears in `apps/dashboard/src/environments/environment*.ts`. The promotion preserves the contract; satisfaction is tracked by the standing spec, not by this archive.

## Date

2026-08-12
