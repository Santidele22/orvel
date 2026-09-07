# Orvel Architecture Context

This repository is the Orvel monorepo: dashboard PWA, landing, Supabase assets, shared packages, and operational documentation. It is the source of truth, not a migration target.

Product scope lives in `product.md`. This file is repository shape and boundaries. Verify counts against `origin/dev` before treating a number as current.

## Repository Shape

```text
.
├── AGENTS.md
├── README.md
├── apps/
│   ├── dashboard/            # Angular 21 PWA + @angular/pwa
│   ├── landing/              # Astro 6 + Svelte 5
│   └── shared/               # cross-app assets (email templates)
├── packages/
│   ├── auth/                 # shared auth contracts / types
│   ├── billing/              # shared billing contracts / types
│   ├── booking/              # shared booking contracts / types
│   ├── config/               # shared config
│   ├── domain/               # shared domain models
│   ├── shared/               # reserved (only .gitkeep — do not extract yet)
│   └── types/                # shared types
├── supabase/
│   ├── functions/            # 14 Edge Functions (Deno); no mercadopago-webhook / sync-mp-plans
│   ├── migrations/           # SQL migrations (full-timestamp); no _legacy/ directory on current dev
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
├── package.json
├── deno.lock
├── bun.lock
└── vercel.json
```

Notes that drift (re-check on `origin/dev`):

- Edge Functions still include `process-email-outbox` and `send-trial-user-activation-reminder-once`, plus subscription, session-handoff, web-push, and signup-email functions.
- `docs/adr/` currently has `0001-orvel-monorepo-architecture-dev.md`, `0009-remove-mercadopago.md`, and `0010-hexagonal-architecture.md`. Release-2.0 schema ADRs (`schema-principles`, `table-design`, `rls-policies`, `indexes`) are not on `dev`.
- `packages/shared/` remains `.gitkeep` only.

## Boundary Rules

- Work in this monorepo. Do not assume sibling “source repos” still exist as the live product.
- Keep application code, Supabase assets, and shared packages in the structure above.
- Shared packages hold cross-surface contracts or utilities only when the source of truth is clear.
- Do not extract into `packages/shared/` yet.
- Do not expand `apps/shared/` without Santi approval.
- Do not invent remote Supabase or deploy state. Use `supabase.md`, CLI output, or ask Santi.

## Agent Context Priority

Use files under `infra/context/` for current monorepo context. If a fact is not present there or in checked-in source, say so and ask Santi before assuming.

## Diagram

The C4 view lives in [`docs/diagrams/01-monorepo-architecture.excalidraw`](../../docs/diagrams/01-monorepo-architecture.excalidraw) (open with [excalidraw.com](https://excalidraw.com) or VS Code Excalidraw). Glosa: [`docs/diagrams/01-monorepo-architecture.md`](../../docs/diagrams/01-monorepo-architecture.md).

That glosa still describes a post-release-2.0 **target** and can lag `dev` (for example it may still talk about Mercado Pago on `dev` or a 12-function purge). This file is the current repo-shape contract; the diagram is not a substitute for `git ls-tree origin/dev`.
