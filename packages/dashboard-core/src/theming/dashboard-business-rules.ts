import { DashboardThemeName } from './theme.tokens';

export type BusinessType =
  | 'uñas'
  | 'peluqueria'
  | 'barberia'
  | 'spa'
  | 'pestañas'
  | 'cejas'
  | 'masajes'
  | 'otro';

export type DashboardConfig = {
  dashboards: Array<{
    businessType: BusinessType;
    theme: DashboardThemeName;
  }>;
};

const DEFAULT_BUSINESS_TYPE: BusinessType = 'spa';

export function resolveDashboardConfig(selectedBusinessTypes?: BusinessType[]): DashboardConfig {
  const resolvedBusinessTypes = selectedBusinessTypes ?? [];

  if (!resolvedBusinessTypes.length) {
    return {
      dashboards: [
        {
          businessType: DEFAULT_BUSINESS_TYPE,
          theme: 'zen'
        }
      ]
    };
  }

  if (resolvedBusinessTypes.length === 1) {
    return {
      dashboards: [
        {
          businessType: resolvedBusinessTypes[0],
          theme: 'zen'
        }
      ]
    };
  }

  return {
    dashboards: resolvedBusinessTypes.map((businessType) => ({
      businessType,
      theme: 'zen'
    }))
  };
}
