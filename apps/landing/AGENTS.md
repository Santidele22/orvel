# Agent Rules - orvel-landing

Start with the root `AGENTS.md` before landing-specific work.

Inherit root rules for orchestration, OpenSpec/TDD, `.funemon/` privacy, and the project-local vs global client-configuration boundary. Do not add landing-local agent-client config unless Santi explicitly asks or it already exists as project-local config.

## Stack

- Language: TypeScript
- App: Astro 6 + Svelte 5 + Tailwind v4
- Adapter: `@astrojs/vercel`
- Data: Supabase client for public/signup flows

## Project specifics

- Focus: public marketing, prelaunch, and signup entry (`apps/landing/src/pages/`).
- Commands from repo root: `pnpm --dir apps/landing run …`
- Tests: Vitest under `apps/landing/src/tests/`
- Do not stack landing-local `.opencode/` / `.gemini/` config.
