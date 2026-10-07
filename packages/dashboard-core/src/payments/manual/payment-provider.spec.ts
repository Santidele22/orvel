import { describe, expect, it } from 'vitest';
import { ManualPaymentService } from './manual-payment.service';
describe('manual-payments module shape', () => {
  it('PaymentProvider is the manual literal', () => {
    type _T = import('./payment-provider').PaymentProvider;
    const _v: _T = 'manual';
    expect(_v).toBe('manual');
  });
  it('ManualPaymentService.recordPayment returns shape-correct record', async () => {
    const svc = new ManualPaymentService();
    const rec = await svc.recordPayment({ amount: 100, currency: 'ARS' });
    expect(rec.provider).toBe('manual');
    expect(rec.amount).toBe(100);
    expect(rec.currency).toBe('ARS');
    expect(rec.status).toBe('received');
    expect(rec.id).toMatch(/^manual_/);
  });
  it('ManualPaymentService.listPayments returns []', async () => {
    const svc = new ManualPaymentService();
    expect(await svc.listPayments()).toEqual([]);
  });
});
