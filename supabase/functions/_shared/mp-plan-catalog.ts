export type BillingTier = 'premium';
export type BillingCadence = 'monthly';

export type MpPlanCatalogRow = {
  tier: string;
  cadence: string;
  tier_code: string;
  preapproval_plan_id: string | null;
};

const TIER_ALIASES: Record<string, BillingTier> = {
  basic: 'premium',
  started: 'premium',
  starter: 'premium',
  medium: 'premium',
  growth: 'premium',
  pro: 'premium',
  simple: 'premium',
  crece: 'premium',
  escala: 'premium',
  premium: 'premium',
};

export function normalizeTier(tier: string): BillingTier | null {
  return TIER_ALIASES[tier.trim().toLowerCase()] ?? null;
}

export function normalizeCadence(cadence: string): BillingCadence | null {
  const normalized = cadence.trim().toLowerCase();
  if (normalized === 'monthly') return normalized;
  return null;
}

export function buildTierCode(tier: string, cadence: string): string {
  const canonicalTier = normalizeTier(tier);
  const canonicalCadence = normalizeCadence(cadence);
  if (!canonicalTier || !canonicalCadence) return `${tier}_${cadence}`.toUpperCase();
  return `${canonicalTier}_${canonicalCadence}`.toUpperCase();
}

export function resolvePlanCatalogRow(
  rows: MpPlanCatalogRow[],
  tier: string,
  cadence: string
): MpPlanCatalogRow | null {
  const canonicalTier = normalizeTier(tier);
  const canonicalCadence = normalizeCadence(cadence);
  if (!canonicalTier || !canonicalCadence) return null;

  const normalizedCode = buildTierCode(canonicalTier, canonicalCadence);

  for (const row of rows) {
    const rowTier = normalizeTier(String(row.tier ?? ''));
    const rowCadence = normalizeCadence(String(row.cadence ?? ''));
    const rowCode = String(row.tier_code ?? '').trim().toUpperCase();

    if (rowTier === canonicalTier && rowCadence === canonicalCadence) return row;
    if (rowCode === normalizedCode) return row;
  }

  return null;
}
