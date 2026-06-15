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

const THEME_BY_BUSINESS_TYPE: Record<BusinessType, DashboardThemeName> = {
  uñas: 'zen',
  pestañas: 'zen',
  cejas: 'zen',
  spa: 'zen',
  masajes: 'zen',
  peluqueria: 'zen',
  barberia: 'zen',
  otro: 'zen'
};

const DEFAULT_BUSINESS_TYPE: BusinessType = 'spa';

export function resolveDashboardConfig(selectedBusinessTypes?: BusinessType[]): DashboardConfig {
  const resolvedBusinessTypes = selectedBusinessTypes ?? [];

  if (!resolvedBusinessTypes.length) {
    return {
      dashboards: [
        {
          businessType: DEFAULT_BUSINESS_TYPE,
          theme: THEME_BY_BUSINESS_TYPE[DEFAULT_BUSINESS_TYPE]
        }
      ]
    };
  }

  if (resolvedBusinessTypes.length === 1) {
    const businessType = resolvedBusinessTypes[0];

    return {
      dashboards: [
        {
          businessType,
          theme: THEME_BY_BUSINESS_TYPE[businessType]
        }
      ]
    };
  }

  return {
    dashboards: resolvedBusinessTypes.map((businessType) => ({
      businessType,
      theme: THEME_BY_BUSINESS_TYPE[businessType]
    }))
  };
}
