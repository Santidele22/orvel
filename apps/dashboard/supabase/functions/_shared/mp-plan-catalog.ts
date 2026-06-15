export type MpPlanCatalogRow = {
  tier: string;
  cadence: string;
  tier_code: string;
  preapproval_plan_id: string;
};

export function buildTierCode(tier: string, cadence: string): string {
  return `${tier}_${cadence}`.trim().toUpperCase();
}

function normalizeTierAlias(tier: string): string {
  const normalized = tier.trim().toLowerCase();
  return normalized === 'started' ? 'starter' : normalized;
}

export function resolvePlanCatalogRow(
  rows: MpPlanCatalogRow[],
  tier: string,
  cadence: string
): MpPlanCatalogRow | undefined {
  const normalizedTier = normalizeTierAlias(tier);
  const normalizedCadence = cadence.trim().toLowerCase();

  return rows.find((row) => {
    const rowTier = normalizeTierAlias(row.tier);
    const rowCadence = row.cadence.trim().toLowerCase();
    const rowTierCode = row.tier_code.trim().toUpperCase();
    return (
      (rowTier === normalizedTier && rowCadence === normalizedCadence) ||
      rowTierCode === buildTierCode(tier, cadence) ||
      rowTierCode === buildTierCode(normalizedTier, normalizedCadence)
    );
  });
}
