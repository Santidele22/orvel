export type MercadoPagoPlanCadence = 'monthly';

export type MercadoPagoPlanRow = {
  code: string;
  name: string;
  price: number | string | null;
  currency?: string | null;
  billing_frequency?: number | null;
  billing_frequency_type?: string | null;
  mercado_pago_plan_id?: string | null;
};

export type MercadoPagoPlanVariant = {
  cadence: MercadoPagoPlanCadence;
  frequency: number;
  frequencyType: 'months';
  transactionAmount: number;
  planIdField: 'mercado_pago_plan_id';
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

  return variants;
}
