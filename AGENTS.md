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
- `main` receives PRs only from `qa`.
- Protected branches (`dev`, `qa`, `main`): linear history, 1 approving review, required CI check `dashboard-booking-regressions`, `enforce_admins: true`, no force pushes, no deletions.
- Santi is the sole owner; self-approval on protected branches is blocked. The admin workaround (temporarily relax protection, `--admin --squash`, restore) is only with explicit Santi approval per PR.
- Relax `dev`/`qa` review enforcement only to push an out-of-date sync (for example `dev ← main`); restore immediately after. The required status check still blocks until CI runs.

### Operational rules

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
| `apps/backoffices/` | Orvel staff operator Vite app at `/ops`. Read `apps/backoffices/AGENTS.md` first. Never import salon dashboard feature modules. |
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
