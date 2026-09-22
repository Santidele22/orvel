# Agent Rules - Orvel Monorepo

Canonical operating contract for agents and humans. This monorepo is the source of truth for Orvel (dashboard PWA, landing, Supabase). Product scope, architecture, environments, and Supabase detail live under `infra/context/`, not here.

This file does not record product completeness. Treat `main` as production. Verify product claims against `infra/context/` and checked-in source; do not infer them from folder names or this contract.

## Communication

- Speak Spanish with Santi.
- Use English for agent-to-agent handoffs and for repository-facing artifacts (code, comments, commits, OpenSpec, tests, in-repo docs).
- Never fabricate, overclaim, or pretend certainty. If a fact is missing, unverifiable, or blocked, say so and ask Santi.

## Context Priority

Before planning or changing files, read in this order:

1. This file.
2. The relevant subtree `AGENTS.md` (`apps/dashboard/AGENTS.md`, `apps/landing/AGENTS.md`).
3. `infra/context/` — at least `product.md`, `architecture.md`, and `operational-rules.md`; add `supabase.md`, `environments.md`, and `deployment.md` when the task touches those areas.
4. The active OpenSpec change under `openspec/changes/` and matching `openspec/specs/` when the work is an SDD change.
5. ADRs and runbooks under `docs/`.
6. Checked-in source.

Do not treat missing skill folders, ignored client dirs (`.opencode/`, `.funemon/`), or untracked trees as canonical guidance.

## Privacy and Repository Hygiene

- Never commit `.funemon/`, secrets, credentials, tokens, `.env` files, local caches, or generated artifacts.
- `.funemon/plans/current.norg` is a local operational ledger only; update it when present, never stage it.
- Global agent-client configuration (OpenCode, Gemini, Pi, and similar) is managed outside this repository. Do not duplicate it here.
- Do not add absolute local paths to committed documentation or source.

## Workflow

- Clarify scope, constraints, acceptance criteria, and non-goals before implementation.
- Substantial or ambiguous work uses OpenSpec (`openspec/`) when Santi asks for SDD or accepts an SDD proposal. Do not invent a parallel spec store.
- Follow strict TDD when tests exist: Red-Green-Refactor. Do not add untested behavior unless Santi explicitly approves an exception.
- Prefer the contract-test layout already in the repo (`.contract.spec.ts`, `.contract.test.mjs`, Deno tests).
- Inspect git status before editing. Preserve unrelated user changes. Keep the diff scoped to the requested files.
- The parent session orchestrates. Do not silently expand into unrelated apps or packages.

## Git Workflow

### 3-environment promotion

`feature → dev → qa → main`. Never skip a step.

| Branch | Purpose | Receives from |
|--------|---------|---------------|
| `dev` | Integration | feature branches (via PR) |
| `qa` | Smoke / pre-release | `dev` (via PR) |
| `main` | Production | `qa` (via PR) |

Hard rules:

- Feature branches merge to `dev` first. Never directly to `qa` or `main`.
- Never commit directly to `qa` or `main`. Every change — features, CI fixes, migration retimestamps — lands on `dev` first and promotes from there; a destination-only commit never flows back to `dev` and is exactly how `dev` and `qa` diverged on migration filenames (#943, #945, #1030).
- Keep `dev`'s `supabase/migrations/` filenames identical to `qa`/`main`. A retimestamp or rename must land on `dev` in the same cycle that promotes it; otherwise the next merge leaves both variants side by side and the migration drift guard rejects the promotion.
- `main` receives PRs only from `qa`.
- Branch rules live in repository rulesets, not classic branch protection. `pr-reviews` (`dev`, `qa`, `main`) requires 1 approving review, allows squash merges only, and blocks deletions and force pushes; `ci-gate` (`dev`/`main`) requires the `Dashboard booking regressions` check on an up-to-date branch; `promotion-drift-guard` (`qa`) requires the `Migration drift guard` check. A promotion branch that omits `.github/workflows/promotion-drift-guard.yml` or `scripts/check-migration-drift.mjs` cannot satisfy the `qa` check, because a required check that never runs never reports.
- Santi is the sole owner; self-approval is blocked, so merging as the sole reviewer uses the owner's per-PR bypass on the `pr-reviews` ruleset: `gh pr merge <n> --squash --admin`, only with explicit Santi approval per PR. No ruleset is ever relaxed.
- Back-sync PRs into `dev` (`dev ← qa`, `dev ← main`) are merged with the owner's per-PR bypass like any other PR; no review enforcement is relaxed, and the required status check still blocks until CI runs.
- After every promotion, back-sync the destination into `dev` (`dev ← qa`, `dev ← main`).

### Operational rules

- Every new task starts from an up-to-date `dev`: `git fetch origin --prune`, then `git switch -c <type>/<slug> origin/dev`. Never branch from a stale local `dev` or from another feature branch.
- Work on a feature branch. Do not push directly to `dev`, `qa`, or `main`.
- After a coherent task block, the orchestrator may commit, push the feature branch, and open a PR against `dev` without per-commit approval. PR target is always `dev`.
- Merge to protected branches still requires explicit Santi approval per PR.
- Do not ask Santi to merge until CI is green. If a PR review bot comments a rejection, treat it as a stop until it is fixed or Santi overrides.
- No `--force`, no `reset --hard`, no secrets, no `.funemon/`, no check bypasses.
- Keep changes small and scoped to the requested work.

## Scope Rules

| Path | Rule |
|------|------|
| `apps/dashboard/` | Angular 21 PWA. Read `apps/dashboard/AGENTS.md` first. Run via `pnpm --dir apps/dashboard …`. |
| `apps/landing/` | Astro 6 + Svelte 5. Read `apps/landing/AGENTS.md` first. Run via `pnpm --dir apps/landing …`. |
| `apps/shared/` | Cross-app assets (currently email templates). Do not expand without Santi approval. |
| `apps/ops/` | Internal Vue 3 prospect backoffice (Prospecta), hexagonal layout inside the app. Read `apps/ops/AGENTS.md` first. Deliberately outside the pnpm workspace and the root `check` gate; run via `pnpm --dir apps/ops …`. |
| `packages/` | Shared contracts and types only when the source of truth is clear. `packages/shared/` is reserved — do not extract into it yet. |
| `supabase/` | Edge functions and migrations. Follow Supabase Safety and `infra/context/supabase.md`. |
| `openspec/` | SDD artifacts. Preserve existing changes; do not rewrite unrelated specs. |
| `infra/`, `docs/` | Context, ADRs, runbooks. Keep concise, current, and evidence-based. |
| `tests/e2e/`, `playwright.config.ts` | Playwright e2e. |
| `scripts/`, `tools/` | Repo-local tooling. Do not change root package-manager or architecture without Santi approval. |

Root `pnpm run check` is the default local verification gate (dashboard + landing builds, critical Supabase function tests, static checks). Use a narrower test command when the change is scoped to one app.

## Supabase Safety

- Do not run destructive Supabase commands without Santi approval.
- Do not run migration repair without Santi approval.
- When Santi asks for schema or function changes and credentials/context are available, update or push with the Supabase CLI immediately.
- If credentials/context are missing, access is unavailable, or a command is blocked, stop and report the exact blocker.
- Do not invent expected remote state. Use checked-in context, Supabase CLI output, or Santi-provided facts.
- The documented pre-release linked project is `orvel-qa-dev`. Production identity is the non-revealing digest in `supabase/production-project-ref.sha256`. Do not invent project refs.

## Required Reporting

At the end of a task, report:

- Files changed.
- Summary of changes.
- Validation run and results.
- Blockers or follow-ups.
