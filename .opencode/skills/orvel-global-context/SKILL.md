---
name: orvel-global-context
description: Use when working in the Orvel monorepo, especially infra/context, docs/adr, docs/runbooks, apps, packages, or Supabase changes; instructs agents to load monorepo context, respect repo boundaries, and follow Supabase safety rules.
---

# Orvel Global Context

Use this skill for work inside `/home/santid/santi/orvel`.

## Required Context Files

Before planning or changing files, read the relevant files under:

- `infra/context/product.md`
- `infra/context/architecture.md`
- `infra/context/supabase.md`
- `infra/context/deployment.md`
- `infra/context/environments.md`
- `infra/context/operational-rules.md`

Use ADRs and runbooks under `docs/` when decisions or procedures are relevant.

## Boundaries

- Treat `/home/santid/santi/orvel` as the monorepo target.
- Do not touch existing source repos unless Santi explicitly authorizes it in the current task.
- Do not invent unverified product, deployment, environment, or Supabase facts.
- Do not commit, push, or open PRs unless Santi explicitly asks.

## Supabase Rule

Every Supabase schema/function change must be pushed or updated immediately with the Supabase CLI.

Safety constraints:

- No destructive Supabase commands without Santi approval.
- No migration repair without Santi approval.
- If blocked by migration history mismatch, stop and ask Santi.

Known current blocker from project context: remote migration history mismatch involving `20260508`, `20260508000000`, and `20260524`.
