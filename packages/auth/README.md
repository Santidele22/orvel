# @orvel/auth

Contracts/types extracted from `apps/dashboard/src/app/core/auth/session-contract.ts`.

This is the FIRST of 7 planned extractions (`auth`, `billing`, `booking`, `config`, `domain`, `shared`, `types`) staging a future hexagonal architecture.

## What's here

- `src/session-contract.ts` — types only (`TurneaSession`, `TurneaSessionUser`, `SelectedBusinessType`, `RequiredRubro`, `TemplateCatalog`, `ValidateSessionSchema` type signature, `LEGACY_DASHBOARD_SESSION_STORAGE_KEY` constant).
- `src/index.ts` — public surface barrel.

The runtime body of `validateSessionSchema` stays in the dashboard at `apps/dashboard/src/app/core/auth/validate-session-schema.ts` because it depends on `ALLOWED_SELECTED_BUSINESS_TYPES` (which itself is derived from the app-internal onboarding reference catalog).

## 7-step recipe for the next 6 extractions

Apply this template to extract `billing`, `booking`, `config`, `domain`, `shared`, `types` after this PR lands.

1. **Explore**: grep the source module for every public export and every consumer. Read the related tests and contract specs. Map internal-vs-external dependencies. Count the actual test blast radius (file-system-path readers vs module-importers).
2. **Propose**: write 4 work units + 5 pre-approved decisions (scope, location, pattern-doc, test-blast-radius, workspace-wiring). Surface any load-bearing assumption (e.g., runtime-vs-type split).
3. **Spec**: Given/When/Then scenarios for each capability. Spec surface is light for chore extractions — focus on the contract delta (path-assertion fixes) and the package-shape assertion. RFC 2119 keywords.
4. **Design**: resolve sub-decisions deferred by the spec (the runtime-vs-type split, opaque shape handling, re-export shim vs tsconfig path mapping, package.json `exports` shape). Document the chosen option for each.
5. **Tasks**: forecast line counts per slice; propose chained-PRs vs single-PR; pre-write conventional commit messages; identify rollback boundary per slice.
6. **Apply**: branch from verified `origin/dev` HEAD. Workspace wiring first (`pnpm-workspace.yaml`). Then module move + shim. Then consumer migration. Then spec fix-forward. Then pattern doc. One conventional commit per slice. Total under review budget.
7. **Verify**: CI gate green on every commit (rebase ordering matters). Pattern documented in this README for the next extraction.

## Checklist for each new `packages/<name>/`

- `packages/<name>/package.json` — name `@orvel/<name>`, private, type module, single `exports."."` mapping to `./src/index.ts`.
- `packages/<name>/src/` — extracted module(s) + `index.ts` barrel.
- `pnpm-workspace.yaml` — add `packages/*` to the `packages` array (root `package.json#workspaces` stays untouched).
- `apps/dashboard/src/app/...` — migrate consumers; old path becomes a thin re-export shim (deletable follow-up).
- Spec fix-forward — re-point file-system-path assertions; add a `packages-<name>-shape.red.contract.spec.ts` drift-guard.
- This README updated with the package-specific decisions.

## Concrete template for each new `packages/<name>/`

### `packages/<name>/package.json`

```json
{
  "name": "@orvel/<name>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

### `pnpm-workspace.yaml` diff

```diff
 packages:
   - apps/landing
   - apps/dashboard
   - apps/shared/*
+  - packages/*
```

### Conventional commits for each slice (one per slice, in order)

```
chore(repo): wire pnpm-workspace for packages/*
chore(dashboard): split <feature> runtime, migrate <N> consumers to @orvel/<name>
chore(test): fix-forward <N> specs to read <feature> from @orvel/<name> + add shape spec
chore(docs): expand packages/<name>/README with 7-step recipe for next 6 extractions
```

## Pattern provenance

Established by `chore-extract-auth-package` (PR landed in `dev`). See `openspec/changes/chore-docs-and-context-align-release-2-0/` for the SDD artifacts that documented the original monorepo shape, and the Engram topic key `sdd/chore-extract-auth-package/{explore,propose,spec,design,tasks}` for the extraction decisions.
