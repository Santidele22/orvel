# @orvel/billing

The post-Mercado-Pago-removal billing seam (ADR 0009) extracted from `apps/dashboard`:

- `apps/dashboard/src/app/core/payments/manual/payment-provider.ts` — the manual-payment contract types (`PaymentProvider` literal type + `BillingEvent`/`PaymentRecord`/`ManualPaymentInput` interfaces).
- `apps/dashboard/src/app/core/payments/manual/manual-payment.service.ts` — the `ManualPaymentService` stub class.
- `apps/dashboard/src/app/features/billing/data-access/payments/webhooks/payment-webhook-idempotency.ts` — the provider-agnostic webhook idempotency helpers (`buildProviderAgnosticIdempotencyKey`, `decideWebhookProcessing` + `WebhookProcessingDecision`).

This is the FOURTH of 7 planned extractions (`auth` ✅, `booking` ✅, `domain` ✅, **`billing` ← this change**, `types`, `config`, `shared`) and the second where types **and** runtime functions move together (the idempotency helpers are the only runtime in the cluster, and they are dep-free — the domain precedent applies). It stages a future hexagonal architecture.

## What's here

- `src/payment-provider.ts` — import-free pure types: `PaymentProvider` (`'manual'` literal), `BillingEvent`, `PaymentRecord`, `ManualPaymentInput`.
- `src/manual-payment.service.ts` — `ManualPaymentService` stub (synthetic records, no DB write).
- `src/payment-webhook-idempotency.ts` — import-free pure helpers: `buildProviderAgnosticIdempotencyKey`, `decideWebhookProcessing` + `WebhookProcessingDecision`. Only imports `PaymentProvider` from the same package.
- `src/index.ts` — public surface barrel.

## Key billing-specific decisions

**(a) Post-MP-removal state — `PaymentProvider = 'manual'` is the only value.** After ADR 0009 removed Mercado Pago, the payment provider seam collapsed to the single `'manual'` literal. It stays the only value until the webhook re-design lands and adds real providers. The literal union is the seam's type-level contract: adding a provider is a type change here, deliberately.

**(b) `ManualPaymentService` is intentionally a stub.** The class records synthetic `PaymentRecord`s and does no DB write. The future webhook re-design (ADR 0009 follow-up) replaces the **body**, not the **seam** — the public surface (`recordPayment`, `listPayments`) is the stable contract. Do not "fix" the stub's minimalism inside this package's extraction scope; the re-design is a separate work unit.

**(c) The idempotency helpers are pure and dep-free.** `buildProviderAgnosticIdempotencyKey` and `decideWebhookProcessing` only import `PaymentProvider` from the same package. They are the stable inter-app contract for any future provider: deterministic keys and replay decisions live here, not in a provider implementation.

## 4-step recipe reference

Follow the extraction recipe in [`packages/domain/README.md`](../domain/README.md) (and the original in [`packages/auth/README.md`](../auth/README.md)) for the remaining extractions. The `billing` extraction applied it with these deltas:

1. `pnpm-workspace.yaml` already listed `packages/*` (wired by the auth PR) — verified, not modified.
2. `apps/dashboard/package.json` declares `"@orvel/billing": "workspace:*"` — the shims cannot resolve the package without the declared dependency (the line lands with the move commit, mirroring auth/booking/domain).
3. The 4 dashboard old paths (3 in `core/payments/manual/` + 1 in `features/billing/data-access/payments/webhooks/`) became **explicit per-name re-export shims** (not `export *`), so the dashboard's compiled-import surface keeps resolving during the migration window.
4. `packages-billing-shape.red.contract.spec.ts` (dashboard test tree) guards the package surface against drift, including the absence of the deleted dead re-shims.

## Checklist for the billing-specific shape

- `packages/billing/package.json` — name `@orvel/billing`, private, type module, single `exports."."` mapping types + default to `./src/index.ts`.
- `packages/billing/src/` — the 3 extracted source files (1 import-free pure + 1 stub class + 1 import-free pure helpers) + `index.ts` barrel.
- `apps/dashboard/package.json` — `"@orvel/billing": "workspace:*"` (dashboard consumers resolve through the shims).
- `apps/dashboard/src/app/...` — old paths are thin re-export shims (deletable follow-up, OUT of scope this change).
- `core/billing/subscriptions/{entitlements.api,subscription-state-machine.api}.ts` — deleted (0 importers, REQ-BILLING-DEL-1).
- `core/billing/landing-plans-source.api.ts` — KEPT: a dynamic-import consumer surfaced in `tests/integration/landing-orvel-pricing.red.contract.spec.ts` at apply; deletion deferred to a follow-up that migrates that import.
- `packages-billing-shape.red.contract.spec.ts` — added as drift guard (asserts surface, purity, shims, deletions).
- `pnpm-workspace.yaml` + root `package.json#workspaces` — untouched (REQ-BILLING-2).

## Pattern provenance

Established by `chore-extract-billing-package` (PR targeting `dev`). SDD artifacts: Engram topic `sdd/chore-extract-billing-package/{proposal,spec,design,tasks,apply-progress}`; mirror `chore-extract-domain-package` (PR in `dev`) for the previous extraction and `openspec/changes/chore-docs-and-context-align-release-2-0/` for the monorepo shape decisions.
