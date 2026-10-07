# @orvel/dashboard-core

The platform-agnostic core of the Orvel dashboard, extracted from `apps/dashboard/src/app/core` in **Fase 3 of [#1098](https://github.com/Santidele22/orvel/issues/1098)** — the first consumer is the dashboard PWA, the next is `apps/dashboard-web`, and the target after that is the native app ([#1077](https://github.com/Santidele22/orvel/issues/1077)).

The decision and its rationale live in [`docs/adr/0011-dashboard-web-pwa-split.md`](../../docs/adr/0011-dashboard-web-pwa-split.md).

## What's here

- `src/<domain>/` — the former `apps/dashboard/src/app/core/**`: `api`, `auth`, `business`, `catalog`, `dashboard`, `notifications`, `platform`, `storage`, `theming`, `time`, and the rest.
- `src/models/` — the former `apps/dashboard/src/app/models/**` (business, branch, cliente, servicio, user). **Transitional**: they only depend on `@orvel/types`, so a later corte can move them to `@orvel/domain`.
- `src/boundaries/core-boundary.contract.spec.ts` — the executable boundary of the core.

Imports are deep by design: `@orvel/dashboard-core/<path>`, with no barrel and no re-exports, so a consumer cannot accidentally depend on a "god module". The `exports` map is a single wildcard.

## Boundary rules (machine-checked)

`src/boundaries/core-boundary.contract.spec.ts` walks the real tree and fails when:

1. the Supabase SDK is imported outside `src/adapters/supabase/`;
2. `window` / `document` / `navigator` / `(local|session)Storage` is touched outside the declared adapters (`storage/browser-storage.adapter.ts`, `platform/browser-environment.adapter.ts`, `platform/platform.adapter.ts`);
3. `matchMedia` or `navigator.userAgent` appears outside `src/platform/` — and this rule is **app-wide**: it also scans `apps/dashboard/src/app`.

The third rule is why the spec lives here but reaches into the app: the platform port is core policy, and the app must consume it instead of asking the host directly.

## How the app consumes it

- `apps/dashboard` declares `"@orvel/dashboard-core": "workspace:*"` and compiles the package source through `tsconfig.app.json` (same pattern as the other `@orvel/*` packages).
- The app injects its build-time environment with `configureDashboardEnvironmentFallback()` from `apps/dashboard/src/app/runtime/configure-dashboard-environment.ts`, imported first in `main.ts`. The core cannot import a per-app generated `environments/environment.ts`.

## Commands

- `pnpm --dir packages/dashboard-core test` — the core suite, in Node, without the app.

## Notes

- `src/payments/manual/MANUAL_PAYMENTS.md` came along with the code; it is documentation, not code.
- `test-setup.ts` mirrors `apps/dashboard/src/test-setup.ts` (synthetic env vars + `localStorage`/`window` stand-ins). Making the core genuinely DOM-free is a registered follow-up of Fase 1 of #1098.
