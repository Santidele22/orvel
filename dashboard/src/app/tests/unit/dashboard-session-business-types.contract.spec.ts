import { describe, expect, it } from 'vitest';

type DemoBusinessType = 'zen';

type DashboardFromSession = {
  dashboards: Array<{
    businessType: DemoBusinessType;
    theme: DemoBusinessType;
  }>;
};

type ResolveDashboardConfigFromSessionFn = (session: unknown) => DashboardFromSession;
type SanitizeSelectedBusinessTypesFn = (input: unknown) => DemoBusinessType[];

async function loadResolver(): Promise<ResolveDashboardConfigFromSessionFn> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/theming/dashboard-session-business-types');
  } catch {
    throw new Error(
      'Missing module src/app/core/theming/dashboard-session-business-types.ts with resolveDashboardConfigFromSession(session).'
    );
  }

  const resolver = module['resolveDashboardConfigFromSession'] as
    | ResolveDashboardConfigFromSessionFn
    | undefined;

  if (!resolver) {
    throw new Error(
      'Missing resolveDashboardConfigFromSession(session) export in src/app/core/theming/dashboard-session-business-types.ts'
    );
  }

  return resolver;
}

async function loadBusinessTypeSanitizer(): Promise<SanitizeSelectedBusinessTypesFn> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/auth/mock-login-business-types');
  } catch {
    throw new Error(
      'Missing module src/app/core/auth/mock-login-business-types.ts with sanitizeSelectedBusinessTypes(input).'
    );
  }

  const sanitizer = module['sanitizeSelectedBusinessTypes'] as
    | SanitizeSelectedBusinessTypesFn
    | undefined;

  if (!sanitizer) {
    throw new Error(
      'Missing sanitizeSelectedBusinessTypes(input) export in src/app/core/auth/mock-login-business-types.ts'
    );
  }

  return sanitizer;
}

describe('TDD contract: dashboard business rules consume selectedBusinessTypes from session', () => {
  it('returns single dashboard when selectedBusinessTypes is empty or missing', async () => {
    const resolveDashboardConfigFromSession = await loadResolver();

    expect(resolveDashboardConfigFromSession({ dashboards: true }).dashboards).toHaveLength(1);
    expect(resolveDashboardConfigFromSession({ selectedBusinessTypes: [] }).dashboards).toHaveLength(1);
    expect(resolveDashboardConfigFromSession({ selectedBusinessTypes: [] }).dashboards[0]).toEqual({
      businessType: 'zen',
      theme: 'zen'
    });
  });

  it('returns single zen dashboard when exactly one supported business type is selected', async () => {
    const resolveDashboardConfigFromSession = await loadResolver();
    const result = resolveDashboardConfigFromSession({ selectedBusinessTypes: ['zen'] });

    expect(result.dashboards).toHaveLength(1);
    expect(result.dashboards[0]).toEqual({ businessType: 'zen', theme: 'zen' });
  });

  it('ignores removed templates at runtime and keeps zen as single fallback dashboard', async () => {
    const resolveDashboardConfigFromSession = await loadResolver();
    const sanitizeSelectedBusinessTypes = await loadBusinessTypeSanitizer();
    const sanitized = sanitizeSelectedBusinessTypes(['industrial', 'chic', 'ink']);
    const result = resolveDashboardConfigFromSession({ selectedBusinessTypes: sanitized });

    expect(sanitized).toEqual([]);
    expect(result.dashboards).toEqual([{ businessType: 'zen', theme: 'zen' }]);
  });

  it('filters non-zen values and preserves zen when mixed input comes from session', async () => {
    const resolveDashboardConfigFromSession = await loadResolver();
    const sanitizeSelectedBusinessTypes = await loadBusinessTypeSanitizer();
    const sanitized = sanitizeSelectedBusinessTypes(['industrial', 'zen', 'evil', 'ink']);
    const result = resolveDashboardConfigFromSession({ selectedBusinessTypes: sanitized });

    expect(sanitized).toEqual(['zen']);
    expect(result.dashboards).toEqual([{ businessType: 'zen', theme: 'zen' }]);
  });
});
