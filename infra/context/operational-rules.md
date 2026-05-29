# Operational Rules

## Repository Boundaries

- Work inside `/home/santid/santi/orvel` for this monorepo.
- Do not touch the existing source repos unless Santi explicitly authorizes it in the current task.
- Do not commit, push, or open PRs unless Santi explicitly requests it.

## Accuracy

- Do not fabricate product behavior, deployment details, environment values, or Supabase state.
- If a fact cannot be verified from this repo or provided context, say so and ask Santi.

## Supabase

- Every Supabase schema/function change must be pushed or updated immediately with the Supabase CLI.
- No destructive commands without Santi approval.
- No migration repair without Santi approval.
- Current known blocker: remote migration history mismatch involving `20260508`, `20260508000000`, and `20260524`.

## Documentation

- Keep context files concise and operational.
- Prefer concrete commands only after they are verified.
- Link ADRs and runbooks when a decision or procedure becomes stable.
