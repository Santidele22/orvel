import { describe, expect, it } from 'vitest';

type DashboardConfig = {
  dashboards: Array<{
    businessType: string;
    theme: string;
  }>;
};

type ResolveDashboardConfigFn = (selectedBusinessTypes?: string[]) => DashboardConfig;

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

describe('Single theme: resolveDashboardConfig always returns zen', () => {
  it('returns single dashboard with theme zen by default when selectedBusinessTypes is omitted', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig();

    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].theme).toBe('zen');
  });

  it('returns single dashboard with theme zen when empty array', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig([]);

    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].theme).toBe('zen');
  });

  it('returns single dashboard with theme zen for any single business type', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig(['peluqueria']);

    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0].businessType).toBe('peluqueria');
    expect(result.dashboards[0].theme).toBe('zen');
  });

  it('returns all dashboards with theme zen for multiple business types', async () => {
    const resolveDashboardConfig = await loadResolver();
    const result = resolveDashboardConfig(['spa', 'unas', 'peluqueria']);

    expect(result.dashboards).toHaveLength(3);
    expect(result.dashboards.map((d) => d.businessType)).toEqual(['spa', 'unas', 'peluqueria']);
    for (const dashboard of result.dashboards) {
      expect(dashboard.theme).toBe('zen');
    }
  });

  it('every possible business type receives theme zen', async () => {
    const resolveDashboardConfig = await loadResolver();
    const allTypes = ['unas', 'peluqueria', 'barberia', 'spa', 'pestanas', 'cejas', 'masajes', 'otro'];
    const result = resolveDashboardConfig(allTypes);

    expect(result.dashboards).toHaveLength(8);
    for (const dashboard of result.dashboards) {
      expect(dashboard.theme).toBe('zen');
    }
  });
});
