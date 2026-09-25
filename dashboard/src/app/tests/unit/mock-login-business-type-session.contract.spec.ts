import { describe, expect, it } from 'vitest';

type DemoBusinessType = 'industrial' | 'zen' | 'chic' | 'ink';

type MockLoginInput = {
  email: string;
  selectedBusinessTypes?: unknown;
};

type MockSession = {
  version: 'v1';
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  issuedAt: number;
  expiresAt: number;
  selectedBusinessTypes: DemoBusinessType[];
};

type CreateMockSessionFromLoginFn = (input: MockLoginInput) => MockSession;
type SanitizeSelectedBusinessTypesFn = (input: unknown) => DemoBusinessType[];

async function loadSessionBuilders(): Promise<{
  createMockSessionFromLogin: CreateMockSessionFromLoginFn;
  sanitizeSelectedBusinessTypes: SanitizeSelectedBusinessTypesFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/auth/mock-login-business-types');
  } catch {
    throw new Error(
      'Missing module src/app/core/auth/mock-login-business-types.ts with createMockSessionFromLogin() and sanitizeSelectedBusinessTypes().'
    );
  }

  const createMockSessionFromLogin = module['createMockSessionFromLogin'] as
    | CreateMockSessionFromLoginFn
    | undefined;
  const sanitizeSelectedBusinessTypes = module['sanitizeSelectedBusinessTypes'] as
    | SanitizeSelectedBusinessTypesFn
    | undefined;

  if (!createMockSessionFromLogin || !sanitizeSelectedBusinessTypes) {
    throw new Error(
      'Missing exports createMockSessionFromLogin(input) and sanitizeSelectedBusinessTypes(input) in src/app/core/auth/mock-login-business-types.ts'
    );
  }

  return {
    createMockSessionFromLogin,
    sanitizeSelectedBusinessTypes
  };
}

describe('TDD contract: landing login business-type selector (mock)', () => {
  it('login handler accepts selected business types (single and multiple)', async () => {
    const { createMockSessionFromLogin } = await loadSessionBuilders();

    const single = createMockSessionFromLogin({
      email: 'demo@turnea.app',
      selectedBusinessTypes: ['industrial']
    });

    const multiple = createMockSessionFromLogin({
      email: 'demo@turnea.app',
      selectedBusinessTypes: ['industrial', 'chic', 'ink']
    });

    expect(single.selectedBusinessTypes).toEqual(['industrial']);
    expect(multiple.selectedBusinessTypes).toEqual(['industrial', 'chic', 'ink']);
  });

  it('session payload always includes selectedBusinessTypes as sanitized array', async () => {
    const { createMockSessionFromLogin } = await loadSessionBuilders();

    const session = createMockSessionFromLogin({
      email: 'demo@turnea.app',
      selectedBusinessTypes: ['industrial', 'invalid-value', 'zen', 'industrial']
    });

    expect(Array.isArray(session.selectedBusinessTypes)).toBe(true);
    expect(session.selectedBusinessTypes).toEqual(['industrial', 'zen']);
  });

  it('filters invalid values and keeps only allowed business types', async () => {
    const { sanitizeSelectedBusinessTypes } = await loadSessionBuilders();

    const sanitized = sanitizeSelectedBusinessTypes([
      'industrial',
      'unknown',
      'zen',
      'CHIC',
      'ink',
      42,
      null
    ]);

    expect(sanitized).toEqual(['industrial', 'zen', 'ink']);
  });

  it('handles none selected safely with empty array', async () => {
    const { sanitizeSelectedBusinessTypes, createMockSessionFromLogin } = await loadSessionBuilders();

    expect(sanitizeSelectedBusinessTypes(undefined)).toEqual([]);
    expect(sanitizeSelectedBusinessTypes(null)).toEqual([]);
    expect(sanitizeSelectedBusinessTypes([])).toEqual([]);

    const session = createMockSessionFromLogin({ email: 'demo@turnea.app' });
    expect(session.selectedBusinessTypes).toEqual([]);
  });
});
