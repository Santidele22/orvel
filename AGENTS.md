# Agent Rules - Orvel Monorepo

This repository follows **Funemon Lab** standards. These rules apply to the full Orvel monorepo and are the canonical project entry point for agents and humans.

## Communication

- Speak Spanish with Santi.
- Use English for agent-to-agent handoffs when delegation is needed.
- Never fabricate, overclaim, or pretend certainty. If a fact is missing, unverifiable, or blocked by lack of access, say so and ask Santi.

## Context Priority

Before planning or changing files, load/read context in this order:

1. Root `AGENTS.md`.
2. Relevant subtree `AGENTS.md` files, such as `apps/dashboard/AGENTS.md` or `apps/landing/AGENTS.md`.
3. Root project skills, especially `project-skills/orvel-global-context/SKILL.md`.
4. Relevant files under `infra/context/`.
5. ADRs and runbooks under `docs/`.
6. Checked-in source files.

Always read the root Orvel global context skill and the relevant `infra/context/*` files before planning changes.

## Privacy and Repository Hygiene

- Never commit `.funemon/`; it is local private metadata.
- Keep `.funemon/plans/current.norg` as a local/private operational ledger only; update it for task/stage/blocker/slice changes when present, but never stage or publish it.
- Never commit secrets, credentials, tokens, `.env` files, local caches, or generated artifacts.
- Treat global client configuration, including OpenCode/Gemini integration, as managed outside this repository. Do not duplicate or modify global client config here.
- Do not rely on ignored or client-specific configuration, such as `.opencode/`, as canonical project guidance. Only use per-repo client config when it already exists and is clearly project-local.
- Do not add absolute local paths to committed documentation or source.

## Funemon Workflow

- R2-D2 is the orchestrator only: it does not implement code or documentation directly, and must delegate to the proper specialist.
- Assess coordination before delegating or parallelizing. Default to sequential work when changes are small, tightly coupled, or consistency-sensitive.
- Follow SDD/TDD: define or read the spec/design first, ask D-O/QA for tests before implementation, then implement only against the tested contract.
- Use Red-Green-Refactor for feature and bug work; do not add untested behavior unless Santi explicitly approves an exception.
- Preserve existing user changes. Inspect status before editing and keep changes scoped to the requested files.

## Git Workflow

### 3-environment promotion flow

Orvel uses a strict 3-branch promotion: `feature → dev → qa → main`. Never skip a step.

| Branch | Purpose | Receives from |
|--------|---------|---------------|
| `dev` | Integration. All feature branches land here first. | feature branches (via PR) |
| `qa`  | Smoke test environment. Pre-release validation. | `dev` (via PR) |
| `main` | Production. Releases only. | `qa` (via PR) |

**Hard rules**:
- Feature branches MUST merge to `dev` first. Never directly to `qa` or `main`.
- `main` receives PRs ONLY from `qa`. Never from `dev` or from a feature branch.
- The 3 protected branches (`dev`, `qa`, `main`) have identical protection: linear history, 1 approving review, required CI check (`dashboard-booking-regressions`), `enforce_admins: true`, no force pushes, no deletions.
- Since Santi is the sole owner, the "1 approving review" requirement blocks self-approval on PRs to protected branches. R2-D2 uses the admin workaround (temporarily relax protection, `--admin --squash`, restore) ONLY with explicit Santi approval per PR.
- Branch protection on `dev` and `qa` should be relaxed (required_pull_request_reviews: null, enforce_admins: false) BEFORE pushing a merge of an out-of-date sync (e.g., syncing dev ← main). Restore the protection immediately after. The required status check will re-block push until CI runs on the new commit.

### Operational rules

- Work on a branch and use a PR path when Santi asks for commits/PRs.
- Do not push directly to `main`, `dev`, or `qa` (they're protected).
- Do not commit, push, or open a PR unless Santi explicitly asks in the current task.
- Narrow exception: R2-D2 may merge/fix Orvel PRs only with explicit Santi approval per PR/task and the normal branch -> PR -> checks -> merge flow. No direct push to `main`, `--force`, `reset --hard`, secrets, `.funemon/`, or check bypasses.
- Keep changes small and scoped to the requested work.

## Scope Rules

- `apps/dashboard/`: Angular dashboard. Read `apps/dashboard/AGENTS.md` before app-specific changes.
- `apps/landing/`: Astro landing site. Read `apps/landing/AGENTS.md` before app-specific changes.
- `supabase/`: Supabase functions and migrations. Follow the Supabase safety rules below and `infra/context/supabase.md`.
- `infra/` and `docs/`: project context, operational notes, ADRs, and runbooks. Keep them concise, current, and evidence-based.
- Root tooling is orchestration only unless Santi approves broader package-manager or architecture changes.

## Supabase Safety

- Do not run destructive Supabase commands without Santi approval.
- Do not run migration repair without Santi approval.
- When Santi asks for Supabase schema or function changes and credentials/context are available, update or push those changes with the Supabase CLI immediately.
- If credentials/context are missing, access is unavailable, or a Supabase command is blocked, stop and report the exact blocker.
- Do not invent expected remote state. Use checked-in context, Supabase CLI output, or Santi-provided facts.

## Required Reporting

At the end of a task, report:

- Files changed.
- Summary of changes.
- Validation run and results.
- Blockers or follow-ups.
