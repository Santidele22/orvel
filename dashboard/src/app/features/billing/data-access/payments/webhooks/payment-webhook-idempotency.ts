// Re-export shim for the @orvel/billing migration window.
// Source moved to packages/billing/src/payment-webhook-idempotency.ts (chore-extract-billing-package).
// Deletable once no importer references this old path.
export type { WebhookProcessingDecision } from '@orvel/billing';
export {
  buildProviderAgnosticIdempotencyKey,
  decideWebhookProcessing,
} from '@orvel/billing';
