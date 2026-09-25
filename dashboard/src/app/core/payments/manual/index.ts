// Re-export shim for the @orvel/billing migration window.
// Sources moved to packages/billing/src/ (chore-extract-billing-package).
// Deletable once no importer references this old path.
export type {
  PaymentProvider,
  BillingEvent,
  PaymentRecord,
  ManualPaymentInput,
  WebhookProcessingDecision,
} from '@orvel/billing';
export {
  ManualPaymentService,
  buildProviderAgnosticIdempotencyKey,
  decideWebhookProcessing,
} from '@orvel/billing';
