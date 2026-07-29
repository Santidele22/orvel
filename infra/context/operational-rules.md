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
