type PlanInput = {
  code: string;
  name: string;
  price: number | null;
  quarterly_price: number | null;
  annual_price: number | null;
  billing_frequency: number;
  billing_frequency_type: string;
  currency: string;
};

type MercadoPagoPlanVariant = {
  cadence: 'monthly' | 'quarterly' | 'annual';
  frequency: 1 | 3 | 12;
  frequencyType: 'months';
  transactionAmount: number;
  planIdField: 'mercado_pago_plan_id' | 'mercado_pago_quarterly_plan_id' | 'mercado_pago_annual_plan_id';
};

export function buildMercadoPagoPlanVariants(plan: PlanInput): MercadoPagoPlanVariant[] {
  const variants: MercadoPagoPlanVariant[] = [];

  if (plan.price !== null) {
    variants.push({ cadence: 'monthly', frequency: 1, frequencyType: 'months', transactionAmount: plan.price, planIdField: 'mercado_pago_plan_id' });
  }

  if (plan.quarterly_price !== null) {
    variants.push({ cadence: 'quarterly', frequency: 3, frequencyType: 'months', transactionAmount: plan.quarterly_price, planIdField: 'mercado_pago_quarterly_plan_id' });
  }

  if (plan.annual_price !== null) {
    variants.push({ cadence: 'annual', frequency: 12, frequencyType: 'months', transactionAmount: plan.annual_price, planIdField: 'mercado_pago_annual_plan_id' });
  }

  return variants;
}
