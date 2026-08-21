// Re-export shim for the @orvel/billing migration window.
// Source moved to packages/billing/src/payment-provider.ts (chore-extract-billing-package).
// Deletable once no importer references this old path.
export type {
  PaymentProvider,
  BillingEvent,
  PaymentRecord,
  ManualPaymentInput,
} from '@orvel/billing';
