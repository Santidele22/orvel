# orvel-dashboard-web

The **desktop operator console** of Orvel, as its own Angular application. Created in **Fase 3 of [#1098](https://github.com/Santidele22/orvel/issues/1098)**; the decision and its rationale live in [`docs/adr/0011-dashboard-web-pwa-split.md`](../../docs/adr/0011-dashboard-web-pwa-split.md).

Before this app existed, `apps/dashboard` served three things at once: the public mobile turnero, the operator console and the installable shell. This target exists so the console stops shipping the installable product's machinery and gets its own artifact, its own bundle budget and — in Fase 4 — its own origin and session storage key.

## What it is (and is not)

| | |
|---|---|
| Mounts | the routes classified `web` and `shared` in `packages/dashboard-core/src/platform/dashboard-targets.ts`: `servicios`, `clientes`, `configuracion`, `notificaciones`, `perfil`, `billing/subscription`, the auth pages, payment returns, and the shell's `inicio`/`turnos` loop |
| Never mounts | `booking/*` (the public mobile turnero) and `dashboard/installar` — those are `pwa` |
| Ships | no `ngsw-worker.js`, no `ngsw.json`, no `manifest.webmanifest`, no `orvel-push-sw.js`, no `provideServiceWorker`, no install/update banner |
| Consumes | `@orvel/dashboard-core` (the shared core) |

## Commands

```bash
pnpm --dir apps/dashboard-web run build   # production build -> dist/orvel-dashboard-web/browser
pnpm --dir apps/dashboard-web run test    # the seam contracts
pnpm run check:dashboard-web              # test + build + artifact contract (what CI runs)
```

## The contracts that hold the seam

1. **Routes** — `src/app/tests/unit/web-target-routes.contract.spec.ts` walks the real router tables of both targets and fails when this app mounts a `pwa` route, leaves a route unclassified, or drops a `web`/`shared` surface the PWA exposes.
2. **Source** — `src/app/tests/unit/no-pwa-machinery.contract.spec.ts` fails on any reference to install/update/push/service-worker machinery, and on a `serviceWorker` or manifest asset in `angular.json`.
3. **Artifacts** — `scripts/check-dashboard-web-pwa-artifacts.mjs` inspects both build outputs: the web build must contain none of the four PWA artifacts, and the PWA must still contain all four.

## The transitional alias

While the split is a strangler, the console features still live in `apps/dashboard/src/app/**`, so this app imports them with relative specifiers (`../../../dashboard/src/app/features/…`) and `tsconfig.app.json` includes those trees. The alias is **temporary**: as features become package-owned they move to `@orvel/dashboard-core` and the relative specifiers disappear.

Assets are duplicated on purpose, not by accident: `public/` and `src/icons/` hold copies of the brand files because `@angular/build` refuses asset paths outside the project root. Styles are **not** duplicated — `angular.json` points at `../dashboard/src/styles*` and `tailwind.config.js` extends the dashboard's config, so there is one design system.

## What Fase 3 still owes

- The PWA install/update e2e that proves the installable product did not change.
- Fase 4: its own origin, its own session storage key, and a deploy that is not the landing's.
