# Orvel

Clean monorepo skeleton for the Orvel migration. Existing repositories have not been imported yet.

## Root tooling

The repository has a minimal pnpm root layer for orchestration only. It does not replace app-local package managers:

- `apps/landing` remains pnpm-based and is included in `pnpm-workspace.yaml`.
- `apps/dashboard` remains Bun-based and is intentionally excluded from the pnpm workspace for now.
- `supabase/` remains Deno/Supabase CLI based.

Root scripts delegate to each local toolchain, for example:

- `pnpm run build:dashboard` -> `bun run --cwd apps/dashboard build`
- `pnpm run build:landing` -> `pnpm --dir apps/landing run build`
- `pnpm run supabase:functions:check` -> `deno check` for Supabase function entrypoints
- `pnpm run supabase:dry-run` -> local Supabase database linting when the Supabase CLI/local stack is available

Do not run root installs to migrate apps between package managers unless an explicit migration decision is made.

## Validation

Validation is local-only for now. GitHub Actions is intentionally not enabled because Santi does not want CI that requires billing or payment setup.

## Agent and Project Context

Agents and contributors should start with:

- `AGENTS.md` for repo-wide Funemon Lab rules.
- `project-skills/orvel-global-context/SKILL.md` for neutral project context loading.
- `infra/context/` for product, architecture, Supabase, deployment, environment, and operational notes.
