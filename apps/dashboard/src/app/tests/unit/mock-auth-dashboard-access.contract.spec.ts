import { describe, it, expect, beforeEach } from 'vitest';
import { ALLOWED_SELECTED_BUSINESS_TYPES } from '../../core/auth/mock-login-business-types';
import { LEGACY_DASHBOARD_SESSION_STORAGE_KEY, validateSessionSchema } from '@orvel/auth';
import {
  buildLandingLoginRedirect,
  canAccessDashboard,
  logoutAndRedirect,
  sanitizeReturnTo
} from '../../core/auth/route-protection';

describe('Legacy mock auth contract - dashboard access fails closed', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('session schema validation', () => {
    it('can still validate exact legacy contract schema for cleanup/migration only', () => {
      const now = 1_700_000_000_000;
      const selectedBusinessType = ALLOWED_SELECTED_BUSINESS_TYPES[0];
      const session = {
        version: 'v1',
        token: 'mock.jwt.token',
        user: {
          id: 'user-1',
          email: 'demo@turnea.app',
          name: 'Demo User'
        },
        selectedBusinessTypes: [selectedBusinessType],
        issuedAt: now - 1_000,
        expiresAt: now + 3_600_000
      };

      expect(validateSessionSchema(session, now)).toBe(true);
    });

    it('rejects session when selectedBusinessTypes is not an array', () => {
      const now = 1_700_000_000_000;
      const invalidSession = {
        version: 'v1',
        token: 'mock.jwt.token',
        user: {
          id: 'user-1',
          email: 'demo@turnea.app',
          name: 'Demo User'
        },
        selectedBusinessTypes: 'industrial',
        issuedAt: now - 1_000,
        expiresAt: now + 3_600_000
      };

      expect(validateSessionSchema(invalidSession, now)).toBe(false);
    });

    it('rejects session when selectedBusinessTypes contains invalid values', () => {
      const now = 1_700_000_000_000;
      const invalidSession = {
        version: 'v1',
        token: 'mock.jwt.token',
        user: {
          id: 'user-1',
          email: 'demo@turnea.app',
          name: 'Demo User'
        },
        selectedBusinessTypes: ['industrial', 'evil-template'],
        issuedAt: now - 1_000,
        expiresAt: now + 3_600_000
      };

      expect(validateSessionSchema(invalidSession, now)).toBe(false);
    });

    it('rejects session missing required fields', () => {
      const now = 1_700_000_000_000;
      const invalidSession = {
        token: 'mock.jwt.token',
        user: { email: 'demo@turnea.app' },
        issuedAt: now - 1_000
      };

      expect(validateSessionSchema(invalidSession, now)).toBe(false);
    });
  });

  describe('dashboard access with/without valid session', () => {
    it('redirects to canonical landing login path with returnTo when no valid Supabase session exists', () => {
      const access = canAccessDashboard();

      expect(access.allowed).toBe(false);
      expect(access.redirectTo).toBe('https://orvel.pro/auth/login?returnTo=%2Fdashboard');
    });

    it('does not allow dashboard access from a legacy local/mock session', () => {
      const now = 1_700_000_000_000;
      localStorage.setItem(
        LEGACY_DASHBOARD_SESSION_STORAGE_KEY,
        JSON.stringify({
          version: 'v1',
          token: 'mock.jwt.token',
          user: { id: 'user-1', email: 'demo@turnea.app', name: 'Demo User' },
          selectedBusinessTypes: [ALLOWED_SELECTED_BUSINESS_TYPES[0]],
          issuedAt: now - 1_000,
          expiresAt: now + 10_000
        })
      );

      const access = canAccessDashboard(now);

      expect(access.allowed).toBe(false);
      expect(access.redirectTo).toBe('https://orvel.pro/auth/login?returnTo=%2Fdashboard');
    });
  });

  describe('returnTo handling (safe)', () => {
    it('keeps internal dashboard path as safe returnTo', () => {
      expect(sanitizeReturnTo('/dashboard/turnos?filtro=hoy')).toBe('/dashboard/turnos?filtro=hoy');
    });

    it('blocks open redirects and falls back to /dashboard', () => {
      expect(sanitizeReturnTo('https://evil.com/pwn')).toBe('/dashboard');
      expect(sanitizeReturnTo('//evil.com')).toBe('/dashboard');
      expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/dashboard');
    });

    it('encodes returnTo into login URL', () => {
      expect(buildLandingLoginRedirect('/dashboard/turnos?filtro=hoy')).toBe(
        'https://orvel.pro/auth/login?returnTo=%2Fdashboard%2Fturnos%3Ffiltro%3Dhoy'
      );
    });
  });

  describe('logout', () => {
    it('clears legacy session and redirects to canonical external landing login path', async () => {
      localStorage.setItem(
        LEGACY_DASHBOARD_SESSION_STORAGE_KEY,
        JSON.stringify({
          version: 'v1',
          token: 'mock.jwt.token',
          user: { id: 'user-1', email: 'demo@turnea.app', name: 'Demo User' },
          selectedBusinessTypes: [],
          issuedAt: Date.now(),
          expiresAt: Date.now() + 1_000
        })
      );

      const redirectTo = await logoutAndRedirect();

      expect(localStorage.getItem(LEGACY_DASHBOARD_SESSION_STORAGE_KEY)).toBeNull();
      expect(redirectTo).toBe('https://orvel.pro/auth/login?returnTo=%2Fdashboard');
    });
  });
});
