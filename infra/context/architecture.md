# Orvel Architecture Context

This repository is the target Orvel monorepo. It collects the dashboard, landing site, Supabase assets, shared packages, and operational documentation.

## Current Repository Shape (`origin/dev` at `1a5df9d`)

```text
.
├── AGENTS.md
├── README.md
├── apps/
│   ├── dashboard/            # Angular 21 PWA + @angular/pwa
│   ├── landing/              # Astro 6 + Svelte 5
│   └── shared/               # cross-app shared assets
├── packages/
│   ├── auth/                 # shared auth contracts / types
│   ├── billing/              # shared billing contracts / types
│   ├── booking/              # shared booking contracts / types
│   ├── config/               # shared config
│   ├── domain/               # shared domain models
│   ├── shared/               # reserved (only .gitkeep — do not extract yet)
│   └── types/                # shared types
├── supabase/
│   ├── functions/            # 14 Edge Functions (Deno) — see Current dev note
│   ├── migrations/           # 100 SQL migrations (full-timestamp)
│   ├── checks/               # Postgres check constraints / linter config
│   ├── contracts/            # RPC contracts / schema contracts
│   ├── config.toml
│   ├── README.md
│   ├── seed.sql              # idempotent test seed
│   ├── seed-data.sql
│   └── production-project-ref.sha256  # non-revealing prod project digest
├── infra/
│   └── context/              # Global project context for agents and humans
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   ├── runbooks/             # Operational procedures
│   └── diagrams/             # Excalidraw + Mermaid source files
├── openspec/
│   ├── changes/              # active change folders (incl. archive/)
│   ├── specs/                # canonical specs
│   └── config.yaml
├── .github/workflows/        # account-closure, booking-regression, ci, deploy-promotion
├── scripts/                  # build-vercel, local-dev-proxy, trial-reminder-*, check-focused-tests, supply-chain-hardening
├── tools/                    # repo-local tooling
├── tests/
│   └── e2e/                  # Playwright e2e
├── playwright.config.ts
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── package.json              # monorepo root config
├── deno.lock
├── bun.lock
└── vercel.json
```

## Boundary Rules

- Treat this monorepo as the migration target, not proof that all code has already moved.
- Do not edit the existing repos from this workspace task.
- Keep application code, Supabase assets, and shared packages separated by the target structure above.
- Shared packages should contain cross-surface contracts or utilities only when the source of truth is clear.

## Agent Context Priority

Use files under `infra/context/` for current monorepo context. If a fact is not present there or in checked-in source, say so and ask Santi before assuming.

---

## Diagrama

La vista de arquitectura del sistema (C4 nivel 1 + nivel 2) vive en [`docs/diagrams/01-monorepo-architecture.excalidraw`](../diagrams/01-monorepo-architecture.excalidraw) (abrible con [excalidraw.com](https://excalidraw.com) o VS Code "Excalidraw"). Glosa completa en [`docs/diagrams/01-monorepo-architecture.md`](../diagrams/01-monorepo-architecture.md).

Este archivo conserva el árbol de directorios de referencia y las reglas de boundary; los detalles de stack, versiones, flujos de auth/booking, CI, y el mapa de edge functions ahora viven en los diagramas y sus archivos `.md` hermanos.

## Current dev vs. target (post-release-2.0)

The current `dev` and the target state diverge in important ways. The diagram above describes the TARGET architecture (post-release-2.0). The current `dev` HEAD `1a5df9d` is mid-transition:

- **Current `dev` (`1a5df9d`)**: 14 Edge Functions (still includes `mercadopago-webhook`, `process-email-outbox`, `sync-mp-plans`, `send-trial-user-activation-reminder-once`). 100 migrations — no `_legacy/` archive directory exists on `dev` yet. 1 ADR on dev (`0001-orvel-monorepo-architecture-dev.md`); the 4 release-2.0 ADRs (`schema-principles`, `table-design`, `rls-policies`, `indexes`) live on `feature/release-2-0-phase1-adrs-part{1,2}` branches and are not yet merged. 6 new release-2.0 tables ARE on dev (`businesses`, `professionals`, `professional_services`, `users`, `clients`, `appointments`, plus `settings` + `notifications_outbox`) via migrations `20260729000000_*` … `20260729005000_*`. Slice 3 (PR #213) only archived 4 stale openspec change folders; the function purge work and the legacy-migrations archive remain on feature branches (`feature/release-2-0-phase2-migrations`, `feature/release-2-0-phase2-legacy-archive`).
- **Target post-release-2.0**: MP purged, outbox purged, 12 Edge Functions, 5 canonical tables, 3-env pipeline (per the diagram + its glosa). Lives on `feature/release-2-0-phase*` branches.

This file preserves the legacy repository tree + boundary rules for historical reference. Verify any "current state" claim against `git ls-tree origin/dev` before relying on it.
