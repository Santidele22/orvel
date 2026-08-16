# @orvel/domain

Types + import-free pure logic extracted from `apps/dashboard`:

- `apps/dashboard/src/app/core/catalog/reference-catalog.ts` — the dashboard reference catalog model (`DashboardReferenceCatalog` + normalization/resolution helpers + the dev fixture).
- `apps/dashboard/src/app/features/onboarding/data-access/onboarding-templates.ts` — the onboarding template catalog model (`TemplateCatalog` + merge/sanitize/preview helpers).
- The `RequiredRubro` type from `apps/dashboard/src/app/features/onboarding/data-access/onboarding-rubros.ts` — the canonical business-type code type.

This is the THIRD of 7 planned extractions (`auth` ✅, `booking` ✅, **`domain` ← this change**, `types`, `config`, `billing`, `shared`) and the **first pure-types extraction** of the funnel. It stages a future hexagonal architecture.

## What's here

- `src/reference-catalog.ts` — import-free pure: catalog types (`CatalogPlan`, `CatalogAddOn`, `CatalogBusinessType`, `DashboardReferenceCatalog`) + `normalizeDashboardReferenceCatalog` + plan/business-type resolution helpers + the `DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE*` dev fallback.
- `src/onboarding-templates.ts` — import-free pure: template catalog types (`CatalogCategory`, `CatalogService`, `TemplateCatalog`, `RubroTemplate`) + `mergeTemplateCatalogs` + slug/name normalization + selection sanitization + preview/preload helpers.
- `src/required-rubro.ts` — types-only: `RequiredRubro`.
- `src/index.ts` — public surface barrel.

The runtime that depends on the app-internal gateway stays in the dashboard:

- `reference-catalog.gateway.ts` — Supabase `get_dashboard_reference_catalog` RPC + the runtime catalog snapshot (`getRuntimeReferenceCatalogSnapshot`).
- `onboarding-rubros.ts` — the `REQUIRED_RUBROS` constant (derived from the runtime snapshot), `sanitizeSelectedRubros`, `normalizeRubro`, `canContinueOnboarding`, `toggleSelectedRubro`. The old path re-exports only the `RequiredRubro` type from `@orvel/domain`.

## Key domain-specific decisions

**(a) First pure-types extraction.** `auth` was a types-only extraction, `booking` an API-contract extraction; `domain` is the first where the moved files are *import-free pure logic* — both types and runtime functions move together. That made the package genuinely reusable beyond the dashboard (no app-internal imports, REQ-DOMAIN-1). Follow-up extractions (`types`, `config`, `billing`, `shared`) can consume `@orvel/domain` directly.

**(b) `RequiredRubro` is a loose structural type (`string`), so the catalog can evolve at runtime.** The dashboard source declared `RequiredRubro = (typeof REQUIRED_RUBROS)[number]` where `REQUIRED_RUBROS` is a `string[]` of catalog business-type codes mapped to lowercase — so at the type level it *already* widened to `string`. Extracted dependency-free (REQ-DOMAIN-1 forbids the gateway import), it is declared as `string`, preserving the exact type-level surface the dashboard had. New business types added via the onboarding catalog are covered without a package bump — the same escape hatch the old `(string & {})` union provided. The design's `{ [key: string]: unknown }` shape was drawn from the old auth stub; the real catalog-derived type is a string, and that is what the package exports.

**(c) `SelectedBusinessType` is derived from the canonical `RequiredRubro`.** In `packages/auth/src/session-contract.ts`, the hardcoded literal union (`'uñas' | 'peluquería' | … | (string & {})`) is replaced with `SelectedBusinessType = RequiredRubro`, deriving from `@orvel/domain` instead of duplicating the catalog (REQ-DOMAIN-AUTH-OPAQUES). The design proposed `RequiredRubro['businessType']` indexing, which assumed an object shape; the real catalog-derived type is a string, so the *equivalent* derivation is a direct alias. Type-level it is identical to the old union — which collapsed to `string` — so the escape hatch for future catalog business types is preserved. Drift is guarded by `packages-domain-shape` + `packages-auth-shape` red contract specs.

## 7-step recipe reference

Follow the 7-step extraction recipe in [`packages/auth/README.md`](../auth/README.md) for the next extractions (`types`, `config`, `billing`, `shared`). The `domain` extraction applied it with these deltas:

1. `pnpm-workspace.yaml` already listed `packages/*` (wired by the auth PR) — verify, do not modify.
2. `apps/dashboard/package.json` + `packages/auth/package.json` declare `"@orvel/domain": "workspace:*"` — the shims (dashboard) and the session-contract type imports (auth) cannot resolve without the declared dependency.
3. Old dashboard paths became **explicit per-name re-export shims** (not `export *`), so the dashboard's compiled-import surface keeps resolving during the migration window.
4. Specs that *path-read* the moved files were re-pointed to `packages/domain/src/…`; module-importers keep resolving through the shims.
5. `packages-domain-shape.red.contract.spec.ts` (dashboard test tree) guards the package surface against drift.

## Checklist for the domain-specific shape

- `packages/domain/package.json` — name `@orvel/domain`, private, type module, single `exports."."` mapping types + default to `./src/index.ts`.
- `packages/domain/src/` — the 3 extracted source files (2 import-free pure + 1 types-only) + `index.ts` barrel.
- `apps/dashboard/package.json` — `"@orvel/domain": "workspace:*"` (dashboard consumers resolve through the shims).
- `packages/auth/package.json` — `"@orvel/domain": "workspace:*"` (session-contract derives from the package).
- `apps/dashboard/src/app/...` — old paths are thin re-export shims (deletable follow-up, OUT of scope this change).
- Spec fix-forward — 2 path-readers re-pointed to `packages/domain/src/`; `packages-domain-shape.red.contract.spec.ts` added as drift guard; `packages-auth-shape.red.contract.spec.ts` asserts the real types.
- `pnpm-workspace.yaml` + root `package.json#workspaces` — untouched (REQ-DOMAIN-4).

## Pattern provenance

Established by `chore-extract-domain-package` (PR targeting `dev`). SDD artifacts: Engram topic `sdd/chore-extract-domain-package/{proposal,spec,design,tasks,apply-progress}`; mirror `chore-extract-auth-package` (PR in `dev`) for the original recipe and `openspec/changes/chore-docs-and-context-align-release-2-0/` for the monorepo shape decisions.
