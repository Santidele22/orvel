# @orvel/config

Import-free dashboard runtime-env helpers extracted from `packages/dashboard-core/src/runtime/dashboard-env.ts`, plus the non-secret auth storage key.

This is the SIXTH of 7 planned extractions (`auth` ✅, `booking` ✅, `domain` ✅, `billing` ✅, `types` ✅, **`config` ← this change**, `shared`). It stages a future hexagonal architecture.

## What's here

- `src/dashboard-env.ts` — `REQUIRED_DASHBOARD_ENV_KEYS`, `DashboardRuntimeEnv`, `EnvSource`, legacy alias helpers, and `loadDashboardRuntimeEnv(source)` with a **required** source argument.
- `src/supabase-storage-key.ts` — `resolveAuthStorageKey(target)` and the `OrvelAuthStorageTarget` type: one session key per execution target (ADR 0012). `pwa` keeps the historical literal `orvel.supabase.auth` so installed sessions survive the split; the deprecated `ORVEL_SUPABASE_AUTH_STORAGE_KEY` alias is that same pwa value and disappears in step 4 of the ADR.
- `src/index.ts` — public surface barrel (explicit named exports, not `export *`).

## Out of this extraction

- `apps/dashboard/src/environments/environment.ts` and `environment.prod.ts` stay in the dashboard forever.
- Runtime env values, URLs, anon keys, tokens, and baked fallbacks stay in the dashboard.
- `defaultEnvSource()` and the optional-source wrapper stay in `packages/dashboard-core/src/runtime/dashboard-env.ts`; since Fase 3 of #1098 the fallback is *injected* there instead of importing `environment.ts`.
- `SUPABASE_CONFIG` and the throw that reads runtime env stay in `packages/dashboard-core/src/auth/supabase-config.ts`.
- Landing's duplicate storage-key constant is not migrated here. Since Fase 4 of #1098 the landing keeps **no** storage key at all (PR #1124).
- `app.config.ts`, PostCSS, sidebar-links, settings pages, and Vercel project config are out.

## Key config-specific decisions

**(a) No baked secrets.** The package never imports `environment.ts` and never embeds URLs, anon keys, or tokens. Callers must pass an `EnvSource`.

**(b) Dashboard owns the fallback, and injects it.** The dashboard wrapper calls the package with `source ?? defaultEnvSource()`. Until Fase 3 of #1098 that fallback read `environment.supabaseUrl` / `environment.supabaseAnonKey` directly; because the shared core cannot import a per-app generated module, the app now calls `configureDashboardEnvironmentFallback()` from `apps/dashboard/src/app/runtime/configure-dashboard-environment.ts`, imported first in `main.ts`. The resolution order is unchanged: process env, then the document-injected runtime env, then the injected fallback.

**(c) Explicit per-name shims.** Old dashboard paths re-export named symbols from `@orvel/config` (not `export *`), matching types/domain/billing.

**(d) One storage key per execution target.** The resolver lives here because the key is a cross-app contract; *which* target an app is cannot live here, because this package must not import an app. So the app declares its target from its bootstrap (`configureDashboardAuthTarget()` in `configure-dashboard-environment.ts`) and `packages/dashboard-core/src/auth/dashboard-auth-target.ts` maps that declaration onto `resolveAuthStorageKey()`. The shared-literal era is what audit finding S2 measured; the ADR is `docs/adr/0012-origins-per-artifact.md`.

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
