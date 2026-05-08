import { describe, expect, it } from 'vitest';

import { buildMercadoPagoPlanVariants } from '../../../../../supabase/functions/_shared/mercadopago-plan-variants';

describe('buildMercadoPagoPlanVariants', () => {
  it('expands a tier into monthly, quarterly, and annual variants', () => {
    const variants = buildMercadoPagoPlanVariants({
      code: 'basic',
      name: 'Started',
      price: 12,
      quarterly_price: 34,
      annual_price: 122,
      billing_frequency: 1,
      billing_frequency_type: 'month',
      currency: 'ARS'
    });

    expect(variants).toEqual([
      {
        cadence: 'monthly',
        frequency: 1,
        frequencyType: 'months',
        transactionAmount: 12,
        planIdField: 'mercado_pago_plan_id'
      },
      {
        cadence: 'quarterly',
        frequency: 3,
        frequencyType: 'months',
        transactionAmount: 34,
        planIdField: 'mercado_pago_quarterly_plan_id'
      },
      {
        cadence: 'annual',
        frequency: 12,
        frequencyType: 'months',
        transactionAmount: 122,
        planIdField: 'mercado_pago_annual_plan_id'
      }
    ]);
  });

  it('skips cadences that do not have a price', () => {
    const variants = buildMercadoPagoPlanVariants({
      code: 'pro',
      name: 'Pro',
      price: 39,
      quarterly_price: null,
      annual_price: 398,
      billing_frequency: 1,
      billing_frequency_type: 'month',
      currency: 'ARS'
    });

    expect(variants).toEqual([
      {
        cadence: 'monthly',
        frequency: 1,
        frequencyType: 'months',
        transactionAmount: 39,
        planIdField: 'mercado_pago_plan_id'
      },
      {
        cadence: 'annual',
        frequency: 12,
        frequencyType: 'months',
        transactionAmount: 398,
        planIdField: 'mercado_pago_annual_plan_id'
      }
    ]);
  });
});
