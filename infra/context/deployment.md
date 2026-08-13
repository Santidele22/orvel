# Deployment Context

## Branch Promotion (3-env)

- Sequence: `feature → dev → qa → main`. Skip no step.
- Per-branch protection on `dev`, `qa`, and `main`: linear history, 1 approving review, required CI check `dashboard-booking-regressions`, `enforce_admins: true`, no force-pushes, no deletions.
- Required CI gate: `dashboard-booking-regressions` (job defined in `.github/workflows/booking-regression.yml`).
- Admin workaround (temporarily relax protection → `--admin --squash` → restore) is gated on explicit Santi approval per PR; never direct-push to `main`, never `--force`, never bypass checks.

## Environments

- `dev` — integration. Receives feature PRs.
- `qa` — pre-release smoke. Receives `dev → qa` PRs.
- `main` — production. Receives `qa → main` PRs only.

## Deployment Boundaries

- Do not deploy dashboard, landing, functions, or database changes unless Santi explicitly asks.
- Do not assume hosting providers or deployment workflows from folder names alone.
- Do not include secrets or environment-specific credentials in documentation.

## Source-of-truth

- Promotion flow + admin-workaround policy: root `AGENTS.md` §3.
- Operational rules: `infra/context/operational-rules.md`.
