---
name: orvel-global-context
description: Use when working anywhere in the Orvel monorepo; loads repo-wide context, boundaries, privacy rules, and Supabase safety guidance without client-specific assumptions.
---

# Orvel Global Context

Use this skill for work inside the Orvel monorepo. It is the neutral root project skill for agent context and must not depend on OpenCode-only configuration or absolute local paths.

## Required Context Loading

Before planning changes, read the relevant files in this order:

1. `AGENTS.md`
2. Relevant subtree `AGENTS.md` files.
3. This skill: `project-skills/orvel-global-context/SKILL.md`
4. Relevant context files under `infra/context/`:
   - `infra/context/product.md`
   - `infra/context/architecture.md`
   - `infra/context/supabase.md`
   - `infra/context/deployment.md`
   - `infra/context/environments.md`
   - `infra/context/operational-rules.md`
5. Relevant ADRs and runbooks under `docs/`.
6. Checked-in source files.

Read all six `infra/context/` files when a task crosses app, infra, deployment, environment, or Supabase boundaries. For narrow app-only work, read at least the files that affect the planned change.

## Boundaries

- Treat this repository as the Orvel monorepo target.
- Do not infer product behavior, deployment details, environment values, or Supabase state from folder names alone.
- If a fact is not in repo context, checked-in source, tool output, or Santi-provided instructions, state the uncertainty and ask Santi.
- Do not touch external source repositories unless Santi explicitly authorizes that in the current task.
- Do not commit, push, open PRs, or deploy unless Santi explicitly asks in the current task.

## Privacy

- Never commit `.funemon/`; it is local private metadata.
- Never commit secrets, credentials, tokens, `.env` files, local caches, generated artifacts, or machine-specific paths.
- Do not treat ignored client-specific config, such as `.opencode/`, as canonical project guidance.

## Supabase Safety

- Read `infra/context/supabase.md` before changing `supabase/` assets or documenting Supabase state.
- Do not run destructive Supabase commands without Santi approval.
- Do not run migration repair without Santi approval.
- When Santi asks for schema/function changes and credentials/context are available, update or push with the Supabase CLI immediately.
- If credentials/context are unavailable or CLI output does not match the recorded context, stop and report the blocker.
- Do not invent remote migration state; use recorded repo context, fresh CLI output, or Santi-provided facts.

## Reporting Format

Return:

- Files changed.
- Summary.
- Validation results.
- Blockers or follow-ups.

For Supabase-related work, also include:

- Whether CLI access/credentials were available.
- Commands run or deliberately not run.
- Any mismatch between checked-in context and observed CLI output.
