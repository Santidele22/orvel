# ADR 0009: Remove Mercado Pago

- **Status**: Accepted 2026-08-15.
- **Context**: Post-release-2.0; plans come from the `public.plan_entitlements` table (Engram #207). Mercado Pago integration is no longer in scope. The MP code (62 files, ~3700 lines) is unreviewed zombie blocking the `chore-extract-billing-package` extraction.
- **Decision**: Delete all 76 MP references in 1 PR. Introduce a minimal manual-payments module at `apps/dashboard/src/app/core/payments/manual/` (types + no-op stub). Record synthetic payments via DB direct or shell script for now.
- **Consequences**:
  - No automated payment reconciliation.
  - Subscription cancellations continue to work (manual trigger).
  - Future billing extraction (`chore-extract-billing-package`) builds on the manual-payments module.
- **Re-add**: Requires redesign of the webhook contract + a new SDD change. The `supabase/functions/mercadopago-webhook/` edge function is removed from the deploy step; the remote function may still be deployed and must be undeployed separately.
- **Follow-ups** (out of scope for this PR):
  1. `supabase functions undeploy mercadopago-webhook` (manual CLI operation by Santi).
  2. Drop `reconcile_mercadopago_subscriptions_dry_run` RPC + flip `provider` default to `'manual'` (separate migration PR).
  3. Refresh `infra/context/architecture.md` doc drift (HEAD claim 1a5df9d → actual 31edca7).
