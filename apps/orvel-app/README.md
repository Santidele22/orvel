# orvel-app (v3)

Orvel v3 rewrites the booking product as a single TypeScript monolith: a Vue 3 PWA plus a self-owned HTTP API in one deployable, running on Cloudflare Workers with Hono, Postgres on Neon, Better Auth, Drizzle migrations, Resend, R2, Upstash, Sentry and PostHog. The architecture inside the app is hexagonal; the binding rules live in `AGENTS.md`.

## Status

Skeleton only. This tree is folder structure plus tooling configuration: no application source, no stubs, no migrations, no deploy. Nothing here is running yet, and the Angular app in `apps/dashboard` is still the live product.

## Folder map

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

## Why there are no dependencies yet

`package.json` intentionally has no `dependencies` and no `devDependencies`. Implementation has not started, so no version number is invented here: each package is added with `pnpm add --save-exact` when the slice that needs it begins. Nothing in this app is installable or runnable before that.

## Planned first steps

1. Slice 0: settle the open items below, then add the exact dependencies for the first vertical slice.
2. Stand up the Worker entry point and the Vue shell with the composition roots described in `AGENTS.md`.
3. Wire Drizzle migrations under `migrations/` and the first contract specs under `tests/contract`.
4. Prove the local loop (`dev:worker` plus `dev:ui` through the Vite proxy) before any deploy.

## Open items

- (a) Whether this app joins the root pnpm workspace and the root `check` gate is an approval-gated decision for Santi; neither is wired up today.
- (b) Workers Static Assets with SPA `not_found_handling` versus `/api` routing must be verified against the installed wrangler version before slice 0.
- (c) `compatibility_date` is pinned to the day this skeleton was created and must be raised on purpose, never by drift; wrangler rejects a future date.
