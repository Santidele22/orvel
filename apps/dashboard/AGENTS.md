# Agent Rules - orvel-dashboard

This project follows the **Funemon Lab** standards.

Start with the root `AGENTS.md` before dashboard-specific work.

Inherit the root Funemon Lab rules for R2-D2 orchestration/delegation, SDD/TDD, `.funemon/` privacy, and the project-local vs global client configuration boundary. Do not add dashboard-local OpenCode/Gemini config unless Santi explicitly asks or it already exists as project-local config.

## Project Architecture (Auto-detected)
- **Languages**: JavaScript/TypeScript
- **Database/Storage**: Supabase

## Project Specifics
- Focus: Angular 21 + @angular/pwa mobile-first dashboard (admin + public booking surfaces). Public routes live at `/booking/:slug` and `/booking/manage` (see `apps/dashboard/src/app/features/booking/pages/public/`).
- Convention overrides: Use `pnpm --dir apps/dashboard run …` from the repo root; the dashboard imports a thin anonymous Supabase client from `apps/dashboard/src/app/core/api/supabase-booking/real-gateway.ts`. Do not stack dashboard-local `.opencode/` / `.gemini/` config — inherit from the root.

## Reference
- Global Rules: `~/.config/funemon-lab/agents/AGENTS.md`
- Local Skills: (none — dashboard inherits from root skills)
