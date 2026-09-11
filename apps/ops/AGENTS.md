# Agent Rules - orvel-ops

Start with the root `AGENTS.md` before ops-specific work.

Inherit root rules for orchestration, OpenSpec/TDD, `.funemon/` privacy, and the project-local vs global client-configuration boundary. Do not add ops-local agent-client config unless Santi explicitly asks or it already exists as project-local config.

## Stack

- Language: TypeScript
- App: Vue 3 + Vite + Vue Router
- Architecture: hexagonal inside this app (`src/domain`, `src/application`, `src/infrastructure`, `src/ui`)
- Data: localStorage adapter (`orvel-ops.v1`). No Supabase in this slice.

## Boundaries

- Domain and application must stay free of Vue, DOM, and `localStorage`.
- UI talks to `OpsFacade` only.
- WhatsApp send opens `wa.me`; the human confirms the message in WhatsApp.

## Project specifics

- Commands from repo root: `pnpm --dir apps/ops run …`
- Tests: Vitest contract specs under `src/**/*.contract.spec.ts`
- Product copy in the UI is Spanish (Rioplatense). Code identifiers stay English.
