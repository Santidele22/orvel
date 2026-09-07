# Agent Rules - orvel-dashboard

Start with the root `AGENTS.md` before dashboard-specific work.

Inherit root rules for orchestration, OpenSpec/TDD, `.funemon/` privacy, and the project-local vs global client-configuration boundary. Do not add dashboard-local agent-client config unless Santi explicitly asks or it already exists as project-local config.

## Stack

- Language: TypeScript
- App: Angular 21 + `@angular/pwa` (mobile-first; the desktop dashboard is an explicit carve-out)
- Data: Supabase via the thin anonymous client in `apps/dashboard/src/app/core/api/supabase-booking/real-gateway.ts`

## Project specifics

- Public booking routes: `/booking/:slug`, `/booking/:slug/:professionalSlug`, and `/booking/manage` (`apps/dashboard/src/app/features/booking/pages/public/`).
- Commands from repo root: `pnpm --dir apps/dashboard run …`
- Tests: Vitest contract specs under `apps/dashboard/src/app/tests/`
- Do not stack dashboard-local `.opencode/` / `.gemini/` config.
