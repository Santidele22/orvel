# Deployment Context

## Branch Promotion (3-env)

- Sequence: `feature → dev → qa → main`. Skip no step.
- Per-branch rules live in repository rulesets: `pr-reviews` on `dev`/`qa`/`main` (1 approving review, squash merges only, no deletions, no force pushes), `ci-gate` on `dev`/`main` (required check `Dashboard booking regressions`, branch must be up to date) and `promotion-drift-guard` on `qa` (required check `Migration drift guard`).
- Required CI gate: check `Dashboard booking regressions` (job `dashboard-booking-regressions` in `.github/workflows/booking-regression.yml`).
- Merging to a protected branch requires explicit Santi approval per PR. No protection is relaxed: `gh pr merge <n> --squash --admin` uses the owner's per-PR bypass on `pr-reviews`, while `ci-gate` and `promotion-drift-guard` still cannot be bypassed. Never direct-push to `main`, never `--force`, never bypass a required check.
- After each promotion, back-sync the destination into `dev` (`dev ← qa`, `dev ← main`).

## Migration Drift Guard

- `Migration drift guard` (`.github/workflows/promotion-drift-guard.yml`) runs on pull requests to `qa` and `main` and fails when the promotion's merge result would leave two active migrations with the same description (the same migration under an old and a new timestamp, incident #943/#945/#1030) or an active migration the promotion branch does not carry.
- It runs only when the promotion branch carries both the workflow and `scripts/check-migration-drift.mjs`, which a promotion that copies the full file delta does.
- Enforcement lives in the `promotion-drift-guard` ruleset, which requires the check on `qa`. Add `main` to that ruleset only after the guard exists on `qa` and `main` through a normal promotion; a required check that never runs blocks every promotion. Never add `Migration drift guard` to `ci-gate`: it also covers `dev`, where the workflow never runs.
- Recovery if the check itself misbehaves: disable or delete the `promotion-drift-guard` ruleset in repository settings, fix, and re-enable.
- Local equivalent: `pnpm run test:promotion-drift`, and `node scripts/check-migration-drift.mjs --base origin/qa --head <branch>`.

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
