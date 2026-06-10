/**
 * Mandatory onboarding contracts (RED): dashboard must not mask incomplete
 * auth/onboarding records with generic defaults.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CANONICAL_PLAN_CODES,
  PLAN_CODE_ALIASES,
  getPlanEntitlements,
  normalizePlanCode
} from '../../core/plans/plan-entitlements';
import { TURNERA_SESSION_KEY } from '../../core/auth/session-contract';

const supabaseAuthClientMock = {
  getSession: vi.fn(),
  signOut: vi.fn()
};

vi.mock('../../core/auth/supabase-auth.client', () => ({
  createSupabaseAuthClient: () => supabaseAuthClientMock
}));

vi.mock('../../core/auth/supabase-config', () => ({
  SUPABASE_CONFIG: {
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key'
  }
}));

function ensureLocalStorage(): Storage {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }

  const store = new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value)
  } as Storage;

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true
  });
  Object.defineProperty(globalThis, 'window', {
    value: globalThis,
    writable: true,
    configurable: true
  });

  return storage;
}

const ALLOWED_BUSINESS_TYPES = ['unas', 'peluqueria', 'barberia', 'spa', 'pestanas', 'cejas', 'masajes', 'otro'] as const;

type BusinessType = (typeof ALLOWED_BUSINESS_TYPES)[number];

type BusinessTypeDefaults = {
  businessType: BusinessType;
  businessName: string;
  slugSeed: string;
  plan: 'STARTER' | 'GROWTH' | 'PRO';
  capacity: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  slotIntervalMinutes: number;
  workingHours: Record<string, { enabled: boolean; start: string; end: string }>;
};

type BusinessTypeDefaultsModule = {
  ALLOWED_ONBOARDING_BUSINESS_TYPES: readonly BusinessType[];
  buildInitialBusinessSettingsForOnboarding: (input: {
    businessId: string;
    businessName: string;
    businessType: BusinessType;
    plan: unknown;
    now?: string;
  }) => BusinessTypeDefaults & { businessId: string; updatedAt: string };
};

async function loadBusinessTypeDefaultsModule(): Promise<BusinessTypeDefaultsModule> {
  const mod = await import('../../features/onboarding/data-access/business-type-defaults');
  return mod as BusinessTypeDefaultsModule;
}

function readDashboardOnboardingSources(): { facade: string; authGuard: string; routes: string; merged: string } {
  const paths = {
    facade: resolve(process.cwd(), 'src/app/features/settings/data-access/business-settings.facade.ts'),
    authGuard: resolve(process.cwd(), 'src/app/core/auth/dashboard-auth.guard.ts'),
    routes: resolve(process.cwd(), 'src/app/app.routes.ts')
  };

  const facade = existsSync(paths.facade) ? readFileSync(paths.facade, 'utf-8') : '';
  const authGuard = existsSync(paths.authGuard) ? readFileSync(paths.authGuard, 'utf-8') : '';
  const routes = existsSync(paths.routes) ? readFileSync(paths.routes, 'utf-8') : '';

  return {
    facade,
    authGuard,
    routes,
    merged: `${facade}\n${authGuard}\n${routes}`
  };
}

describe('Mandatory onboarding dashboard guard contracts', () => {
  beforeEach(() => {
    ensureLocalStorage().clear();
    supabaseAuthClientMock.getSession.mockClear();
    supabaseAuthClientMock.signOut.mockClear();
  });

  it('uses canonical STARTER/GROWTH/PRO plan codes for new onboarding and keeps legacy read aliases only', () => {
    expect(CANONICAL_PLAN_CODES).toEqual(['FREE', 'STARTER', 'GROWTH', 'PRO']);
    expect(PLAN_CODE_ALIASES).toEqual({ STARTER: 'STARTER', BASIC: 'STARTER', MEDIUM: 'GROWTH' });
    expect(normalizePlanCode('FREE')).toBe('FREE');
    expect(normalizePlanCode('medium')).toBe('GROWTH');
    expect(getPlanEntitlements('PRO')).toEqual({
      maxLocales: 1,
      maxRubros: 10,
      maxMonthlyBookings: null,
      aiCreditsMonthly: 2000
    });
  });

  it('creates deterministic initial settings for every allowed business type and persists capacity', async () => {
    const defaults = await loadBusinessTypeDefaultsModule();

    expect(defaults.ALLOWED_ONBOARDING_BUSINESS_TYPES).toEqual(ALLOWED_BUSINESS_TYPES);

    for (const businessType of ALLOWED_BUSINESS_TYPES) {
      const first = defaults.buildInitialBusinessSettingsForOnboarding({
        businessId: `biz-${businessType}`,
        businessName: `Studio ${businessType}`,
        businessType,
        plan: 'FREE',
        now: '2026-05-05T10:00:00.000Z'
      });
      const second = defaults.buildInitialBusinessSettingsForOnboarding({
        businessId: `biz-${businessType}`,
        businessName: `Studio ${businessType}`,
        businessType,
        plan: 'FREE',
        now: '2026-05-05T10:00:00.000Z'
      });

      expect(first).toEqual(second);
      expect(first.businessType).toBe(businessType);
      expect(first.plan).toBe('FREE');
      expect(first.capacity).toBeGreaterThanOrEqual(1);
      expect(first.workingHours).toBeTruthy();
      expect(first.slugSeed).not.toMatch(/^mi-negocio$|^mi-salon$/i);
    }
  });

  it('dashboard guard blocks incomplete onboarding instead of routing to dashboard with generic auto-repair', () => {
    const { merged } = readDashboardOnboardingSources();

    expect(merged).toMatch(/onboardingCompleted|onboarding_complete|requiresOnboarding|onboarding_required/i);
    expect(merged).toMatch(/plan/i);
    expect(merged).toMatch(/tipoNegocio|businessType|business_type/i);
    expect(merged).toMatch(/\/auth\/onboarding|\/onboarding/);
    expect(merged).not.toMatch(/businessName\s*\|\|\s*['"]Mi Negocio['"]|negocioNombre\s*\|\|\s*['"]Mi Negocio['"]/);
  });

  it('security regression: forged legacy localStorage session does not grant dashboard access without Supabase onboarding', async () => {
    const now = new Date('2026-05-05T12:00:00.000Z').getTime();
    localStorage.setItem(
      TURNERA_SESSION_KEY,
      JSON.stringify({
        version: 'v1',
        token: 'forged-token-that-only-exists-in-local-storage',
        user: {
          id: 'attacker-controlled-user-id',
          email: 'attacker@example.com',
          name: 'Forged User'
        },
        selectedBusinessTypes: ['zen'],
        issuedAt: now - 60_000,
        expiresAt: now + 60 * 60_000
      })
    );
    supabaseAuthClientMock.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const { canAccessDashboardAsync } = await import('../../core/auth/route-protection');
    const result = await canAccessDashboardAsync(now);

    expect(result.allowed).toBe(false);
    expect(result.redirectTo).toMatch(/^\/login\?returnTo=|^\/auth\/onboarding\?/);
    expect(supabaseAuthClientMock.getSession).toHaveBeenCalledTimes(1);
  });

  it('Google OAuth login reaches dashboard only after Supabase has persisted complete onboarding metadata', async () => {
    const { canAccessDashboardAsync } = await import('../../core/auth/route-protection');

    supabaseAuthClientMock.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'oauth-token-incomplete',
          user: {
            id: 'google-user-1',
            email: 'santi@orvel.app',
            user_metadata: {
              plan: 'GROWTH',
              tipoNegocio: 'peluqueria',
              onboardingCompleted: false
            }
          }
        }
      },
      error: null
    });

    await expect(canAccessDashboardAsync()).resolves.toEqual({
      allowed: false,
      redirectTo: '/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard'
    });

    supabaseAuthClientMock.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'oauth-token-complete',
          user: {
            id: 'google-user-1',
            email: 'santi@orvel.app',
            user_metadata: {
              plan: 'GROWTH',
              tipoNegocio: 'peluqueria',
              onboardingCompleted: true
            }
          }
        }
      },
      error: null
    });

    await expect(canAccessDashboardAsync()).resolves.toEqual({ allowed: true });
  });

  it('security regression: OAuth onboarding cannot complete from localStorage business type selection alone', async () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/features/onboarding/pages/signup-business-types-step.page.ts'),
      'utf-8'
    );
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const navigations: string[] = [];

    const page = new SignupBusinessTypesStepPage();
    page.setRouter({ navigateByUrl: (url: string) => navigations.push(url) });
    page.toggleType('peluqueria');
    page.submit();

    expect(source).toMatch(/updateUser|user_metadata|business_settings|saveBusinessSettings|upsert/i);
    expect(navigations).not.toContain('/dashboard/inicio');
  });

  it('settings save path maps capacity to Supabase payload when onboarding defaults are persisted', () => {
    const { facade } = readDashboardOnboardingSources();

    expect(facade).toMatch(/capacity\?:\s*number|capacity:\s*number/);
    expect(facade).toMatch(/capacity\s*:\s*persistedLocal\.capacity|capacity\s*:\s*payload\.capacity/i);
    expect(facade).toMatch(/capacity\s*>=\s*1|Math\.max\(\s*1|Number\.isFinite\([^)]*capacity/i);
  });
});
