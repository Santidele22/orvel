# Agent Rules - orvel-dashboard-web

Start with the root `AGENTS.md` before dashboard-web-specific work.

## Stack

- TypeScript, Angular 21, `@angular/build:application`.
- **No `@angular/pwa`, no service worker, no manifest, no install/update banner, no operator web
  push.** This target is the desktop operator console; those concerns belong to `apps/dashboard`.
- Shares `@orvel/dashboard-core` with the PWA and consumes the console features of `apps/dashboard`
  through the transitional alias described below.

## Project specifics

- Commands from repo root: `pnpm --dir apps/dashboard-web run …`
- Tests: Vitest contract specs under `apps/dashboard-web/src/app/tests/`.
- The artifact contract (`scripts/check-dashboard-web-pwa-artifacts.mjs`) runs in the root `check`
  after both apps are built. It fails if this build emits `ngsw-worker.js` or
  `manifest.webmanifest`, or if the PWA stops emitting them.

## The transitional alias (#1098 Fase 3)

The console features (`servicios`, `clientes`, `configuracion`, `notificaciones`, `perfil`,
`billing`) still live in `apps/dashboard/src/app/features/**`, so this app imports them with
relative specifiers of the form `../../../dashboard/src/app/…` from `src/app/*.ts`, and
`tsconfig.app.json` includes those trees.

Rules for this window:

- The alias exists **only** for `features/**`, `shared/**`, `environments/**` and the shell's route
  providers. Never import `apps/dashboard`'s `app.routes.ts`, `main.ts` or `pwa-*` features: that is
  how PWA machinery would leak into this build.
- `src/app/tests/unit/no-pwa-machinery.contract.spec.ts` enforces that.
- Do not add a second copy of the design tokens or the Tailwind theme; `tailwind.config.js` extends
  the dashboard's config and scans both trees.

## Web/pwa seam

- `src/app/app.routes.ts` mounts only the `web` and `shared` surfaces classified by
  `packages/dashboard-core/src/platform/dashboard-targets.ts`.
- `src/app/tests/unit/web-target-routes.contract.spec.ts` walks both router tables and fails when
  this app mounts a `pwa` route, leaves a route unclassified, or drops a `web`/`shared` surface.

## Do not stack dashboard-web-local `.opencode/` / `.gemini/` config.
