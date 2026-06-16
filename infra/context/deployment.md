# Deployment Context

This document records only known deployment facts for the Orvel monorepo migration.

## Known Facts

- Supabase functions are deployed.
- Repository context records that Supabase migration history was repaired, `migration list` is aligned, and `db push --dry-run --include-all --yes` reported the remote database up to date.
- No deployment guarantees for dashboard or landing have been verified in this monorepo context.

## Deployment Boundaries

- Do not deploy dashboard, landing, functions, or database changes unless Santi explicitly asks.
- Do not assume hosting providers or deployment workflows from folder names alone.
- Do not include secrets or environment-specific credentials in documentation.

## Required Deployment Notes for Future Changes

When a deployment process is added or verified, document:

- Owner and approval requirement.
- Command(s) used.
- Required environment variables by name only, never values.
- Rollback or stop conditions.
- Verification steps.
