# Operational Rules

## Repository Boundaries

- Work inside this monorepo. It is the Orvel source of truth.
- Do not assume sibling source repos still exist as the live product.
- After a coherent task block, the orchestrator may commit, push the feature branch, and open a PR against `dev` without per-commit Santi approval. PR target is always `dev`; never `main` directly.
- Merge to protected branches still requires explicit Santi approval per PR. Merging as the sole reviewer uses the owner's per-PR bypass on the `pr-reviews` ruleset (`gh pr merge <n> --squash --admin` into `dev`, `gh pr merge <n> --merge --admin` into `main`, or the Git administration bypass), gated on that explicit approval. Never direct-push to `main`, force-push, run `reset --hard`, commit secrets or `.funemon/`, or bypass a required check. A ruleset changes only with explicit approval, recorded with its exact call and rollback.

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
- Public copy (README, landing) must match `product.md`. Do not reintroduce Mercado Pago checkout.

## Promotion

- The flow is `feature → dev → main`: two environments, where `dev` integrates and never deploys and `main` is production. The `qa` environment was retired in #1133/#1134 — a leftover `refs/heads/qa` condition inside a ruleset is not a live environment, and nothing is promoted to it.
- Canonical flow, merge methods, ruleset state and bypass policy: root `AGENTS.md`, section *Git Workflow*. Deploy mechanics and how to verify a promotion reached production: `infra/context/deployment.md`.
- Do not restate the policy here. Three copies of it had drifted out of date by 2026-10 and had to be rewritten at once. When the flow changes, change it in `AGENTS.md` and link to it.

## CI Gate

- Required checks on protected branches: `Dashboard booking regressions` and `Full repo checks`, enforced by the `ci-gate` ruleset on `dev` and `main`; `Migration drift guard` is required on `main` by the `promotion-drift-guard` ruleset.
- Root `pnpm run check` is the default local gate. For dashboard changes the authoritative gate is `node scripts/check-dashboard-failure-parity.mjs`: the suite has a known-failing baseline, and parity is what fails on a new failure.
- No direct push to `main`, no `--force`, no `reset --hard`, no secrets or `.funemon/` in commits.
