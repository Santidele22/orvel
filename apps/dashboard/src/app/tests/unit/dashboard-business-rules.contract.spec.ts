import { describe, expect, it } from 'vitest';

type DashboardTheme = 'industrial' | 'zen' | 'chic' | 'ink';
type BusinessType = 'uñas' | 'peluqueria' | 'barberia' | 'spa' | 'pestañas' | 'cejas' | 'masajes' | 'otro';

type DashboardConfig = {
  dashboards: Array<{
    businessType: BusinessType;
    theme: DashboardTheme;
  }>;
};

type ResolveDashboardConfigFn = (selectedBusinessTypes?: BusinessType[]) => DashboardConfig;

const THEME_BY_BUSINESS_TYPE: Record<BusinessType, DashboardTheme> = {
  uñas: 'chic',
  pestañas: 'chic',
  cejas: 'chic',
  spa: 'zen',
  masajes: 'zen',
  peluqueria: 'industrial',
  barberia: 'ink',
  otro: 'industrial'
};

async function loadResolver(): Promise<ResolveDashboardConfigFn> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/theming/dashboard-business-rules');
  } catch {
    throw new Error(
      'Missing module src/app/core/theming/dashboard-business-rules.ts with resolveDashboardConfig(selectedBusinessTypes).'
    );
  }

  const resolver = module['resolveDashboardConfig'] as ResolveDashboardConfigFn | undefined;

  if (!resolver) {
    throw new Error(
      'Missing resolveDashboardConfig(selectedBusinessTypes) export in src/app/core/theming/dashboard-business-rules.ts'
    );
  }

  return resolver;
}

describe('Business contract: single vs multiple dashboards + strict template colors', () => {
  it('returns single dashboard by default when selectedBusinessTypes is omitted', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig();

    expect(result.dashboards).toHaveLength(1);
  });

  it('returns single dashboard by default (no selected business types)', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig([]);

    expect(result.dashboards).toHaveLength(1);
  });

  it('returns single dashboard when one business type is selected', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig(['spa']);

    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].businessType).toBe('spa');
    expect(result.dashboards[0].theme).toBe(THEME_BY_BUSINESS_TYPE['spa']);
  });

  it('returns multiple dashboards only when user selected multiple business types', async () => {
    const resolveDashboardConfig = await loadResolver();
    const selected: BusinessType[] = ['spa', 'uñas', 'peluqueria'];
    const result = resolveDashboardConfig(selected);

    expect(result.dashboards).toHaveLength(3);
    expect(result.dashboards.map((d) => d.businessType)).toEqual(selected);
  });

  it('maps every selected business type to its strict template color theme', async () => {
    const resolveDashboardConfig = await loadResolver();
    const selected: BusinessType[] = ['spa', 'masajes', 'uñas', 'pestañas', 'cejas', 'peluqueria', 'barberia', 'otro'];
    const result = resolveDashboardConfig(selected);

    for (const dashboard of result.dashboards) {
      expect(dashboard.theme).toBe(THEME_BY_BUSINESS_TYPE[dashboard.businessType]);
    }
  });

  it('never cross-mixes themes between selected business types in the same response', async () => {
    const resolveDashboardConfig = await loadResolver();
    const selected: BusinessType[] = ['barberia', 'uñas', 'spa', 'peluqueria'];
    const result = resolveDashboardConfig(selected);

    expect(result.dashboards).toHaveLength(4);
    expect(result.dashboards).toEqual([
      { businessType: 'barberia', theme: 'ink' },
      { businessType: 'uñas', theme: 'chic' },
      { businessType: 'spa', theme: 'zen' },
      { businessType: 'peluqueria', theme: 'industrial' }
    ]);
  });
});
