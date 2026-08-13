# Operational Rules

## Repository Boundaries

- Work inside this monorepo for Orvel tasks.
- Do not touch the existing source repos unless Santi explicitly authorizes it in the current task.
- **Auto-push + auto-open PR workflow** (2026-07-29): After completing a coherent task block (e.g., end of an SDD phase, end of a PR slice, or end of an SDD change), R2-D2 may auto-commit, push the feature branch, and open a PR against `dev` without per-commit explicit Santi approval. PR target is always `dev`; never `qa` or `main` directly.
- **Merge to protected branches still requires explicit Santi approval per PR.** R2-D2 may NOT merge to `dev` (or `qa`/`main`) without explicit Santi approval. The admin workaround (temporarily relax protection, `--admin --squash`, restore) remains gated behind explicit Santi approval per PR; never direct-push to `main`, force-push, run `reset --hard`, commit secrets or `.funemon/`, or bypass checks.

## Accuracy

- Do not fabricate product behavior, deployment details, environment values, or Supabase state.
- If a fact cannot be verified from this repo or provided context, say so and ask Santi.

## Supabase

- Every Supabase schema/function change must be pushed or updated immediately with the Supabase CLI.
- No destructive commands without Santi approval.
- No migration repair without Santi approval.
- Repository context records that the previous remote migration history mismatch was repaired, `migration list` is aligned, and `db push --dry-run --include-all --yes` reported the remote database up to date. If fresh CLI output differs, stop and ask Santi.

## Documentation

- Keep context files concise and operational.
- Prefer concrete commands only after they are verified.
- Link ADRs and runbooks when a decision or procedure becomes stable.

## 3-Environment Promotion

Orvel uses a strict 3-branch promotion: `feature → dev → qa → main`. Never skip a step.

| Branch | Purpose | Receives from |
|--------|---------|---------------|
| `dev` | Integration. All feature branches land here first. | feature branches (via PR) |
| `qa` | Smoke test environment. Pre-release validation. | `dev` (via PR) |
| `main` | Production. Releases only. | `qa` (via PR) |

Hard rules:

- Feature branches MUST merge to `dev` first. Never directly to `qa` or `main`.
- `main` receives PRs ONLY from `qa`. Never from `dev` or from a feature branch.
- The 3 protected branches (`dev`, `qa`, `main`) have identical protection: linear history, 1 approving review, required CI check (`dashboard-booking-regressions`), `enforce_admins: true`, no force pushes, no deletions.
- Since Santi is the sole owner, the "1 approving review" requirement blocks self-approval on PRs to protected branches. The admin workaround (temporarily relax protection, `--admin --squash`, restore) is used ONLY with explicit Santi approval per PR.
- Branch protection on `dev` and `qa` is relaxed (required_pull_request_reviews: null, enforce_admins: false) BEFORE pushing a merge of an out-of-date sync, and restored immediately after; the required status check re-blocks push until CI runs on the new commit.

## CI Gate

- Required CI check on protected branches: `dashboard-booking-regressions` (job defined in `.github/workflows/booking-regression.yml`).
- Root `pnpm run check` runs the dashboard + landing builds, critical Supabase function tests, and static checks; CI must be green before merge.
- No direct push to `main`, no `--force`, no `reset --hard`, no secrets or `.funemon/` in commits.
