import type { BillingEvent, ManualPaymentInput, PaymentRecord } from './payment-provider';
/**
 * ManualPaymentService — stub for the post-MP-removal era.
 * Returns synthetic records; no DB write. Future commits will add a real impl.
 */
export class ManualPaymentService {
  async recordPayment(input: ManualPaymentInput): Promise<PaymentRecord> {
    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      provider: 'manual',
      amount: input.amount,
      currency: input.currency,
      status: input.status ?? 'received',
      createdAt: new Date().toISOString(),
      memo: input.memo,
    };
  }
  async listPayments(): Promise<PaymentRecord[]> {
    return [];
  }
}
