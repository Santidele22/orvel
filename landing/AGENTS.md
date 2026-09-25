# Agent Rules - orvel-landing

Start with the root `AGENTS.md`. Inherit its rules for language, secrets, git safety and reporting.

## Stack

- TypeScript. Astro 6 in SSR (`output: 'server'`) + Svelte 5 + Tailwind v4, adapter `@astrojs/vercel`.
- Its own `pnpm-workspace.yaml` (single-package workspace `packages: [.]`) and its own `pnpm-lock.yaml`.
- Data: Supabase directly, for plans, signup and the billing proxies.

## Status on this branch

This is the live marketing and signup surface, kept as reference. It cannot build here: `landing/src/lib/booking-share-head.ts` and `landing/src/lib/booking-share-match.ts` import `packages/booking/src/public-booking-slug`, and this branch does not carry `packages/`.

## Boundaries

- This app owns the public marketing site and the signup entry: `landing/src/pages/`.
- Product copy must match what the product does. Mercado Pago is out of the product (ADR 0009). Do not reintroduce it.
- Signup crosses apps. The dashboard calls back into `POST /api/signup/create-account-business` on this app's origin, and the signup and login shims redirect to `/dashboard/signup` and `/dashboard/login`. Treat those routes and their response shapes as shared interface: changing them breaks the other app.
- The public share URL `https://orvel.pro/booking/:slug` gets its SEO/OG `<head>` rewritten by `landing/src/edge/booking-share.ts`, which also needs the app shell at `/dashboard/index.html` and `/og-share.png`.

## Commands

From the repo root: `pnpm --dir landing run …`. Tests: Vitest under `landing/src/tests/`.

Nothing here has been verified on this branch. Do not report a green result for a command you did not run.
