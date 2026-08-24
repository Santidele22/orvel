# @orvel/types

Type-only dashboard models extracted from `apps/dashboard/src/app/models/`:

- `branch.model.ts` — `Branch`, `CreateBranchDTO`, `SAME_CATEGORY_BRANCH_SCOPE_EXAMPLE`
- `business.model.ts` — `Business`, `WeekdayKey`, `WorkingDayHours`, `BusinessSettings`, `BusinessPublicView`
- `cliente.model.ts` — `Cliente`, `CreateClienteDTO`, `UpdateClienteDTO`
- `user.model.ts` — `User`, `TipoNegocio`, `UserPlan`, `AuthUser`, `LoginDTO`, `RegisterDTO`, `NEGOCIO_TEMPLATES`

This is the FIFTH of 7 planned extractions (`auth` ✅, `booking` ✅, `domain` ✅, `billing` ✅, **`types` ← this change**, `config`, `shared`). It stages a future hexagonal architecture.

## What's here

- `src/branch.model.ts`, `src/business.model.ts`, `src/cliente.model.ts`, `src/user.model.ts` — import-free type contracts moved unchanged.
- `src/index.ts` — public surface barrel (explicit named exports, not `export *`).

## Out of this extraction

- `servicio.model.ts` — mostly `SERVICIOS_POR_CATEGORIA` catalog data, not a type contract.
- `dashboard-template.contract.ts` — imports Angular `Type`.
- Clientes/servicios hexagonal migration and `#242` config extraction.

## Key types-specific decisions

**(a) Type contracts only.** The four files are import-free (no `@angular`, no dashboard-internal imports). Follow-up packages can consume `@orvel/types` without pulling the app.

**(b) Catalog data stays in the dashboard.** `servicio.model.ts` is not a type contract; moving it would drag seed catalogs into the package.

**(c) Explicit per-name shims.** Old dashboard paths re-export named symbols from `@orvel/types` (not `export *`), matching domain/billing.

## Recipe applied

Follow [`packages/domain/README.md`](../domain/README.md) and [`packages/auth/README.md`](../auth/README.md). Deltas:

1. `pnpm-workspace.yaml` already lists `packages/*` — verified, not modified.
2. `apps/dashboard/package.json` declares `"@orvel/types": "workspace:*"`.
3. The 4 old model paths are explicit per-name re-export shims.
4. `packages-types-shape.red.contract.spec.ts` guards the surface against drift.

## Checklist

- `packages/types/package.json` — `@orvel/types`, private, type module, single `exports."."` → `./src/index.ts`.
- `packages/types/src/` — 4 moved models + `index.ts` barrel.
- Dashboard old paths are thin shims (deletable follow-up).
- `pnpm-workspace.yaml` + root `package.json#workspaces` — untouched.

## Pattern provenance

Established by `chore-extract-types-package`. Mirror `chore-extract-billing-package` and `chore-extract-domain-package` for the previous extractions.
