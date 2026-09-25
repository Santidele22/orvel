# Agent Rules - orvel-app

## Purpose

`apps/orvel-app` is the v3 Orvel product: a single TypeScript monolith deployed as one Cloudflare Worker that serves both the HTTP API and the built UI assets. It is not launched yet, and the Angular app in `apps/dashboard` remains the live product whose `dev → qa → main` promotion path this app does not affect.

Today the app holds folder structure and tooling configuration only. There is no application source, no stub and no placeholder implementation, and none should be added without an approved slice. Code, identifiers, comments, tests and docs are written in English; product copy shown to users is Spanish (Rioplatense).

## Stack

Vue 3 PWA plus a self-owned HTTP API in one deployable: Cloudflare Workers with Hono, Postgres on Neon, Better Auth, Drizzle for SQL migrations, Resend for email, R2 for files, Upstash for cache, queues and cron, Sentry plus PostHog for observability. Architecture inside the app is hexagonal.

## Layout

```
src/contracts        wire DTOs shared by both inbound adapters
src/domain           pure business model, split by subdomain
src/application      ports, use cases and their tests
src/infrastructure   outbound adapters: client/ (browser), server/ (Worker)
src/server           inbound Hono HTTP adapter + server composition root
src/ui               inbound Vue adapter + client composition root
migrations/          Drizzle SQL migrations
tests/contract       Vitest contract specs
tests/e2e            Playwright end-to-end specs
```

## Layer boundaries

- `src/domain` and `src/application` are pure TypeScript. Forbidden there: Vue, Hono, Drizzle, `@cloudflare/workers-types`, DOM (`document`, `window`), `fetch`, and any environment or global side effect. Time, ids, randomness and hashing enter through ports.
- `src/infrastructure` contains outbound adapters only, split in two runtimes: `client/` runs in the browser (HTTP client for our own API, browser storage, web push) and `server/` runs in the Worker (database, auth, email, object storage, queues, cache, observability). A new subfolder goes under one of those two; there is never a third runtime.
- `src/server` is the inbound HTTP adapter (Hono on Cloudflare Workers) and owns the server composition root, where ports are bound to adapters.
- `src/ui` is the inbound Vue adapter and owns the client composition root. UI talks to application facades only: it never imports `infrastructure/server`, never opens the database, and never calls the API inline — that call belongs behind an adapter and a facade.
- `src/contracts` holds the wire DTOs shared by both inbound adapters: types and validation schemas only, no logic, and no imports from domain, application or infrastructure.
- Dependency direction is one-way: `ui` and `server` depend on `application`, which depends on `domain`. `infrastructure` implements the ports declared in `application` and is referenced only from a composition root.
- `tsconfig.core.json` exists so that a broken boundary fails `pnpm run typecheck` instead of being caught in review: it compiles `src/domain`, `src/application` and `src/contracts` with `"types": []` and `lib: ["ES2023"]`, so no DOM and no Worker global is available and importing Vue, Hono, Drizzle or a Workers API from those layers is a compile error.
- One subject per file. When a rule is unclear, ask Santi instead of inventing an answer.

## Commands

These scripts are the intended interface of `package.json`. They are NOT runnable yet: dependencies are deliberately not installed, and no command has been verified in this app. Do not report a green result for a command you did not actually run.

| Script | Command |
| --- | --- |
| `dev:ui` | `vite` |
| `dev:worker` | `wrangler dev` |
| `build:ui` | `vue-tsc -p tsconfig.ui.json --noEmit && vite build` |
| `typecheck` | `tsc -p tsconfig.core.json && tsc -p tsconfig.worker.json && vue-tsc -p tsconfig.ui.json --noEmit` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | `drizzle-kit migrate` |
| `deploy` | `wrangler deploy` |

Vitest contract specs are named `*.contract.spec.ts`; Playwright end-to-end specs live under `tests/e2e`.

## Prohibitions

- Do not extract anything into `packages/` yet.
- Do not modify `apps/dashboard` or `apps/landing` from this app's work.
- Do not commit secrets, `.dev.vars`, `.env` files or a real `account_id`.
- Do not invent version numbers, account ids, URLs or secret values.
- Do not add a third infrastructure runtime, and do not import an adapter outside a composition root.

## Status

Skeleton only: folder structure plus tooling configuration. No source code, no migrations, no deploy, and nothing verified by execution. `package.json` has no `dependencies` and no `devDependencies` on purpose; they arrive with `pnpm add --save-exact` when implementation starts.
