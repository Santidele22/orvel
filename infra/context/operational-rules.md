# Operational Rules

## Repository Boundaries

- Work inside this monorepo. It is the Orvel source of truth.
- Do not assume sibling source repos still exist as the live product.
- After a coherent task block, the orchestrator may commit, push the feature branch, and open a PR against `dev` without per-commit Santi approval. PR target is always `dev`; never `qa` or `main` directly.
- Merge to protected branches still requires explicit Santi approval per PR. Merging as the sole reviewer uses the owner's per-PR bypass on the `pr-reviews` ruleset (`gh pr merge <n> --squash --admin`, or the Git administration bypass), gated on that explicit approval. No ruleset is ever relaxed. Never direct-push to `main`, force-push, run `reset --hard`, commit secrets or `.funemon/`, or bypass checks.

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

## 3-Environment Promotion

`feature → dev → qa → main`. Never skip a step.

| Branch | Purpose | Receives from |
|--------|---------|---------------|
| `dev` | Integration. All feature branches land here first. | feature branches (via PR) |
| `qa` | Smoke test environment. Pre-release validation. | `dev` (via PR) |
| `main` | Production. Releases only. | `qa` (via PR) |

Hard rules:

- Feature branches MUST merge to `dev` first. Never directly to `qa` or `main`.
- Never commit directly to `qa` or `main`. Every change — features, CI fixes, migration retimestamps — lands on `dev` first and promotes from there; a destination-only commit never flows back to `dev` and is exactly how `dev` and `qa` diverged on migration filenames (#943, #945, #1030).
- Keep `dev`'s `supabase/migrations/` filenames identical to `qa`/`main`. A retimestamp or rename must land on `dev` in the same cycle that promotes it; otherwise the next merge leaves both variants side by side and the migration drift guard rejects the promotion.
- `main` receives PRs ONLY from `qa`. Never from `dev` or from a feature branch.
- Branch rules live in repository rulesets, not classic branch protection. `pr-reviews` (`dev`, `qa`, `main`) requires 1 approving review, allows squash merges only, and blocks deletions and force pushes; `ci-gate` (`dev`/`main`) requires the `Dashboard booking regressions` check on an up-to-date branch; `promotion-drift-guard` (`qa`) requires the `Migration drift guard` check. Excluding `.github/workflows/**` from a promotion branch leaves `ci-gate` satisfied but blocks that branch, because a required check that never runs never reports.
- Santi is the sole owner; self-approval is blocked, so merging as the sole reviewer uses the owner's per-PR bypass on the `pr-reviews` ruleset: `gh pr merge <n> --squash --admin`, only with explicit Santi approval per PR. No ruleset is ever relaxed.
- After every promotion, back-sync the destination into `dev` (`dev ← qa`, `dev ← main`) and restore review enforcement immediately. That sync is the only sanctioned use of the review relaxation.
- **Do not merge `origin/dev` into `qa` (or `qa` into `main`).** Promotion is squash-copied trees. Git commit counts across hops lie; compare `git diff` of the two tips. Copy the file delta onto a branch from the destination. Never rename an already-applied migration on a single branch: a retimestamp must land on `dev` first and then promote, or the next merge leaves both variants and the drift guard rejects the promotion.

## CI Gate

- Required CI check on protected branches: `dashboard-booking-regressions` (`.github/workflows/booking-regression.yml`). That workflow currently runs on PRs to `dev` and `main`, not `qa`.
- Root `pnpm run check` is the default local gate.
- No direct push to `main`, no `--force`, no `reset --hard`, no secrets or `.funemon/` in commits.
