# Deployment Context

This document records only known deployment facts for the Orvel monorepo migration.

## Known Facts

- Supabase functions are deployed.
- Fresh 2026-07-11 evidence shows the one-time reminder guard migration applied. The temporary function/secrets were deployed then removed after a pre-invocation shell error; no invocation or email occurred.
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
