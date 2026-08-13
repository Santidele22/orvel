# Orvel Architecture Context

This repository is the target Orvel monorepo. It is intended to collect the dashboard, landing site, Supabase assets, shared packages, and operational documentation.

## Target Repository Shape

```text
apps/
  dashboard/          # Angular dashboard
  landing/            # Astro landing site
supabase/
  functions/          # Supabase Edge Functions
  migrations/         # Supabase database migrations
packages/
  shared/
    domain/
    types/
    config/
    billing/
    booking/
    auth/
infra/
  context/            # Global project context for agents and humans
docs/
  adr/                # Architecture Decision Records
  runbooks/           # Operational procedures
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

---

## Target architecture diagram

The TARGET architecture (post-release-2.0) is documented in [`docs/diagrams/01-monorepo-architecture.excalidraw`](../diagrams/01-monorepo-architecture.excalidraw). Glosa in [`docs/diagrams/01-monorepo-architecture.md`](../diagrams/01-monorepo-architecture.md).

This file preserves the legacy repository tree + boundary rules for historical reference. The current dev state and the target state both diverge from this tree in important ways:

- **Current `dev`**: still has Mercado Pago + `process-email-outbox`. 14 Edge Functions. 100 legacy migrations. See `git log --oneline -25`.
- **Target post-release-2.0**: MP purged, outbox purged, 5 new tables, 12 Edge Functions, 3-env pipeline. Lives on `feature/release-2-0-phase*` branches, not yet merged to dev.
