# @orvel/config

Import-free dashboard runtime-env helpers extracted from `apps/dashboard/src/app/core/runtime/dashboard-env.ts`, plus the non-secret auth storage key.

This is the SIXTH of 7 planned extractions (`auth` ✅, `booking` ✅, `domain` ✅, `billing` ✅, `types` ✅, **`config` ← this change**, `shared`). It stages a future hexagonal architecture.

## What's here

- `src/dashboard-env.ts` — `REQUIRED_DASHBOARD_ENV_KEYS`, `DashboardRuntimeEnv`, `EnvSource`, legacy alias helpers, and `loadDashboardRuntimeEnv(source)` with a **required** source argument.
- `src/supabase-storage-key.ts` — `ORVEL_SUPABASE_AUTH_STORAGE_KEY` (`orvel.supabase.auth`).
- `src/index.ts` — public surface barrel (explicit named exports, not `export *`).

## Out of this extraction

- `apps/dashboard/src/environments/environment.ts` and `environment.prod.ts` stay in the dashboard forever.
- Runtime env values, URLs, anon keys, tokens, and baked fallbacks stay in the dashboard.
- `defaultEnvSource()` and the optional-source wrapper stay in `apps/dashboard/src/app/core/runtime/dashboard-env.ts`.
- `SUPABASE_CONFIG` and the throw that reads runtime env stay in `apps/dashboard/src/app/core/auth/supabase-config.ts`.
- Landing's duplicate storage-key constant is not migrated here.
- `app.config.ts`, PostCSS, sidebar-links, settings pages, and Vercel project config are out.

## Key config-specific decisions

**(a) No baked secrets.** The package never imports `environment.ts` and never embeds URLs, anon keys, or tokens. Callers must pass an `EnvSource`.

**(b) Dashboard owns the fallback.** The dashboard wrapper calls the package with `source ?? defaultEnvSource()`, and only that fallback may read `environment.supabaseUrl` / `environment.supabaseAnonKey`.

**(c) Explicit per-name shims.** Old dashboard paths re-export named symbols from `@orvel/config` (not `export *`), matching types/domain/billing.

## Recipe applied

Follow [`packages/types/README.md`](../types/README.md) and [`packages/auth/README.md`](../auth/README.md). Deltas:

1. `pnpm-workspace.yaml` already lists `packages/*` — verified, not modified.
2. `apps/dashboard/package.json` declares `"@orvel/config": "workspace:*"`.
3. `dashboard-env.ts` is a shim + environment fallback; `supabase-config.ts` re-exports the storage key.
4. `packages-config-shape.red.contract.spec.ts` guards the surface and the no-secrets rule.

## Checklist

- `packages/config/package.json` — `@orvel/config`, private, type module, single `exports."."` → `./src/index.ts`.
- `packages/config/src/` — env helpers + storage key + `index.ts` barrel.
- Dashboard old paths are thin shims (deletable follow-up).
- `pnpm-workspace.yaml` + root `package.json#workspaces` — untouched.

## Pattern provenance

Established by `chore-extract-config-package`. Mirror `chore-extract-types-package` for the previous extraction.
