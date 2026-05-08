export type MercadoPagoPlanCadence = 'monthly' | 'quarterly' | 'annual';

export type MercadoPagoPlanRow = {
  code: string;
  name: string;
  price: number | string | null;
  currency?: string | null;
  billing_frequency?: number | null;
  billing_frequency_type?: string | null;
  quarterly_price?: number | string | null;
  annual_price?: number | string | null;
  mercado_pago_plan_id?: string | null;
  mercado_pago_quarterly_plan_id?: string | null;
  mercado_pago_annual_plan_id?: string | null;
};

export type MercadoPagoPlanVariant = {
  cadence: MercadoPagoPlanCadence;
  frequency: number;
  frequencyType: 'months';
  transactionAmount: number;
  planIdField: 'mercado_pago_plan_id' | 'mercado_pago_quarterly_plan_id' | 'mercado_pago_annual_plan_id';
};

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildMercadoPagoPlanVariants(plan: MercadoPagoPlanRow): MercadoPagoPlanVariant[] {
  const variants: MercadoPagoPlanVariant[] = [];

  const monthlyAmount = toNumber(plan.price);
  if (monthlyAmount !== null) {
    variants.push({
      cadence: 'monthly',
      frequency: Number(plan.billing_frequency ?? 1),
      frequencyType: 'months',
      transactionAmount: monthlyAmount,
      planIdField: 'mercado_pago_plan_id'
    });
  }

  const quarterlyAmount = toNumber(plan.quarterly_price);
  if (quarterlyAmount !== null) {
    variants.push({
      cadence: 'quarterly',
      frequency: 3,
      frequencyType: 'months',
      transactionAmount: quarterlyAmount,
      planIdField: 'mercado_pago_quarterly_plan_id'
    });
  }

  const annualAmount = toNumber(plan.annual_price);
  if (annualAmount !== null) {
    variants.push({
      cadence: 'annual',
      frequency: 12,
      frequencyType: 'months',
      transactionAmount: annualAmount,
      planIdField: 'mercado_pago_annual_plan_id'
    });
  }

  return variants;
}
