# Agent Rules - Orvel (branch `migrate-app-to-v3`)

Contract for this branch. Read it, then the `AGENTS.md` of the app you are touching.

This branch is the v3 workspace. The live product is **not** here: the Angular dashboard, the Astro landing, the Supabase backend and the `dev → qa → main` promotion path live on `dev`, `qa` and `main`, which keep every file this branch removed.

## Repository shape

| Path | What it is |
| --- | --- |
| `orvel-app/` | v3: the TypeScript monolith being built. Read `orvel-app/AGENTS.md`. |
| `dashboard/` | Angular 21 PWA, the live product, kept here as reference to port logic from. Read `dashboard/AGENTS.md`. |
| `landing/` | Astro 6 + Svelte 5, the live marketing and signup surface. Read `landing/AGENTS.md`. |
| `shared/` | `shared/email-templates/` only. |
| `backend/` | Empty. Its purpose is not decided, and git does not track empty directories. |

`dashboard/` and `landing/` cannot install, build or test on this branch: `packages/`, the root workspace, the lockfiles and `scripts/` are not here. That is intended. Do not "fix" it.

## What this branch no longer carries

`supabase/`, `packages/`, `scripts/`, `docs/`, `infra/`, `openspec/`, `.github/`, the root workspace files and the global test configs exist on `dev`. Mind the prefix: on `dev` the apps sit under `apps/` (`apps/dashboard/…`, `apps/landing/…`), while `packages/`, `supabase/` and `scripts/` are at that branch's root.

- read a file: `git show dev:<path>`
- list a tree: `git ls-tree -r --name-only dev -- <path>`
- restore: `git checkout dev -- <path>`

Porting logic from the old app is expected: part of the v3 domain is meant to be lifted from `packages/` and `dashboard/src`. Do not re-create `packages/` or any of the deleted infrastructure on this branch without asking Santi.

## Communication

- Spanish with Santi. English for agent-to-agent handoffs and repository-facing artifacts (code, comments, commits, tests, docs).
- Never fabricate, overclaim or pretend certainty. If a fact is missing or unverifiable, say so and ask.
- A subagent's report is a claim; the workspace is the truth. Verify before repeating it.

## Privacy and hygiene

- Never commit secrets, credentials, tokens or `.env` files.
- `.env.local` holds real local credentials, is untracked, and on this branch is protected **only** by `.git/info/exclude` — local git configuration that does not travel with the repository. This branch has no root `.gitignore`. Before any `git add -A`, inspect what you are staging.
- `.vercel/` is local state. Leave it alone.
- Do not commit caches, generated artifacts or `node_modules`.

## The live product

`dev`, `qa` and `main` keep the real application, still on Supabase. This branch changes none of it.

- No destructive Supabase command and no migration repair without Santi's explicit approval.
- Never direct-push to `dev`, `qa` or `main`, and never force-push.
- Do not invent remote state, project refs or environment values. Use `git show dev:infra/context/...` or ask Santi.

## Git

- Work on `migrate-app-to-v3`.
- No `--force`, no `reset --hard`, no bypassing checks.
- Keep the diff scoped to the requested work. `git status` may carry someone else's pending changes: do not stage them.
- Commit messages: `type(scope): description`, with a body explaining what and why.
- Merging into `dev`, `qa` or `main` needs Santi's explicit approval, per PR, every time.

## Workflow

- Clarify scope, constraints, acceptance criteria and non-goals before implementing. If something is ambiguous, ask instead of guessing.
- TDD when tests exist: Red-Green-Refactor. Do not add untested behaviour without explicit approval.
- Verify with a command you actually ran. Never report a green result you did not observe.
- The parent session orchestrates. Do not silently expand into the other apps.

## Required reporting

At the end of a task: files changed, summary of changes, validation run and its results, blockers or follow-ups. Say clearly what is verified and what is not.
