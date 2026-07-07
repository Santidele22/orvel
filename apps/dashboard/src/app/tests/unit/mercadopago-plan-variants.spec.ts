import { describe, expect, it } from 'vitest';

import { buildMercadoPagoPlanVariants } from '../../../../../../supabase/functions/_shared/mercadopago-plan-variants';

describe('buildMercadoPagoPlanVariants', () => {
  it('expands a tier into the MVP monthly variant only', () => {
    const variants = buildMercadoPagoPlanVariants({
      code: 'PREMIUM',
      name: 'Premium',
      price: 25000,
      billing_frequency: 1,
      billing_frequency_type: 'month',
      currency: 'ARS'
    });

    expect(variants).toEqual([
      {
        cadence: 'monthly',
        frequency: 1,
        frequencyType: 'months',
        transactionAmount: 25000,
        planIdField: 'mercado_pago_plan_id'
      }
    ]);
  });

  it('skips monthly variant when it does not have a price', () => {
    const variants = buildMercadoPagoPlanVariants({
      code: 'PREMIUM',
      name: 'Premium',
      price: null,
      billing_frequency: 1,
      billing_frequency_type: 'month',
      currency: 'ARS'
    });

    expect(variants).toEqual([]);
  });
});
