// Manual Payments — type-only stub.
// See docs/adr/0009-remove-mercadopago.md for removal context.
// Re-add design requires redesign of the webhook contract.
export type PaymentProvider = 'manual';
export interface BillingEvent {
  readonly id: string;
  readonly provider: PaymentProvider;
  readonly amount: number;
  readonly currency: string;
  readonly status: 'pending' | 'received' | 'cancelled';
  readonly createdAt: string;
}
export interface PaymentRecord {
  readonly id: string;
  readonly provider: PaymentProvider;
  readonly amount: number;
  readonly currency: string;
  readonly status: 'pending' | 'received' | 'cancelled';
  readonly createdAt: string;
  readonly memo?: string;
}
export interface ManualPaymentInput {
  readonly amount: number;
  readonly currency: string;
  readonly status?: 'pending' | 'received' | 'cancelled';
  readonly memo?: string;
}
