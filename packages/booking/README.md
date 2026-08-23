# @orvel/booking

Contracts/types extracted from `apps/dashboard/src/app/core/api/supabase-booking/{types,gateway-interface,public-booking-slug}.ts`.

This is the SECOND of 7 planned extractions (`auth`, `billing`, `booking`, `config`, `domain`, `shared`, `types`) staging a future hexagonal architecture.

## What's here

- `src/types.ts` — 18 type-only declarations: error envelope (`ApiErrorCode`, `ApiError`, `ApiResponse<T>`), public booking surface (`BusinessPublicView`, `PublicBookingPayload`, `ManageBookingInput`, `PublicSlotAvailabilityInput`, `PublicSlot`, `PublicBookingConfirmation`, `ManageBookingDetails`), token-managed operations (`CancelBookingByTokenInput`, `RescheduleBookingByTokenInput`), and admin payloads (`AdminManualBookingPayload`, `AdminBlockedTimePayload`, `AdminUpdateBookingPayload`, `AdminCancelBookingPayload`, `AdminRescheduleBookingPayload`, `AdminStatusUpdatePayload`).
- `src/gateway-interface.ts` — the `SupabaseBookingGateway` interface (12 methods), importing 16 type names from `./types` (relative within the package).
- `src/public-booking-slug.ts` — pure runtime: `normalizePublicBookingSlug` / `isValidPublicBookingSlug` (zero imports).
- `src/index.ts` — public surface barrel (explicit per-name re-exports, not `export *`).

## Key booking-specific decision: NO runtime split (unlike auth)

Auth split `validateSessionSchema` because its runtime body depends on app-internal onboarding data (`ALLOWED_SELECTED_BUSINESS_TYPES`). The booking contracts have **no dashboard-internal dependencies**: `types.ts` is pure types, `gateway-interface.ts` only cross-deps on `./types`, and `public-booking-slug.ts` is pure runtime with **zero imports**. So the slug helpers move **whole** — do NOT reflexively assume a split is needed. A split is only forced by an app-internal dependency; without one, the file moves as-is.

## Decisions

1. **Explicit shim, not `export *`** — WU7 deleted the dashboard `gateway-interface.ts` and `public-booking-slug.ts` shims. A follow-up deleted the leftover `types.ts` shim. Historical shims used explicit per-name re-exports (`export type { ... } from '@orvel/booking'`).
2. **`mappers.ts` is intentionally NOT migrated** — it stays in the dashboard, deferred to the future `packages/domain`/`packages/types` extraction. Consumers import booking types from `@orvel/booking`, not a dashboard types shim. It also exports `KNOWN_BUSINESS`, a dev/mock placeholder constant in production source (like auth's `ALLOWED_SELECTED_BUSINESS_TYPES`) — flagged for that future extraction.
3. **Runtime stays in the dashboard** — `real-gateway.ts` (Supabase + `dashboard-env`), `api-wrapper.ts`, `turno.service.ts` and all `features/booking/**` are NOT in this package; they depend on app-internal config/env/models that must move with `packages/domain`/`packages/types` first.

## 7-step recipe

The extraction recipe is documented in [`packages/auth/README.md`](../auth/README.md) — the canonical 7-step reference. This change is the **second validator** of that recipe; any deviation found here should be recorded back there for the remaining 5 extractions (`billing`, `config`, `domain`, `shared`, `types`).

## Checklist for this package

- `packages/booking/package.json` — name `@orvel/booking`, private, type module, single `exports."."` mapping to `./src/index.ts`, `scripts.test: vitest run`, `devDependencies.vitest ^4.1.4`. No `tsconfig.json` (the dashboard's `module: preserve` type-checks the package via `exports.types`).
- `packages/booking/src/` — `types.ts`, `gateway-interface.ts`, `public-booking-slug.ts`, `index.ts` barrel.
- No dashboard shims remain. WU7 deleted `gateway-interface.ts` and `public-booking-slug.ts`; a follow-up deleted `types.ts`.
- `apps/dashboard/package.json` declares `"@orvel/booking": "workspace:*"`; `pnpm-workspace.yaml` untouched (auth PR #221 wired `packages/*`; root `package.json#workspaces` is a legacy field).
- Spec fix-forward — `multitenant-branch-appointment-scope.contract.spec.ts` re-pointed to `packages/booking/src/types.ts`; `packages-booking-shape.red.contract.spec.ts` drift-guard added (18 types + interface + 2 functions, no runtime leak, shims, `workspace:*`).

## Pattern provenance

Established by `chore-extract-auth-package` (PR #221); `chore-extract-booking-package` is the second validator.
