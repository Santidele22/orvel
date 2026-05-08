import { describe, it, expect, beforeEach } from 'vitest';
import { TURNERA_SESSION_KEY, validateSessionSchema } from '../../core/auth/session-contract';
import {
  buildLandingLoginRedirect,
  canAccessDashboard,
  logoutAndRedirect,
  sanitizeReturnTo
} from '../../core/auth/route-protection';

describe('Mock Auth Contract - Dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('session schema validation', () => {
    it('accepts exact contract schema with non-expired session', () => {
      const now = 1_700_000_000_000;
      const session = {
        version: 'v1',
        token: 'mock.jwt.token',
        user: {
          id: 'user-1',
          email: 'demo@turnea.app',
          name: 'Demo User'
        },
        selectedBusinessTypes: ['industrial', 'zen'],
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
    it('redirects to landing login with returnTo when no valid session exists', () => {
      const access = canAccessDashboard();

      expect(access.allowed).toBe(false);
      expect(access.redirectTo).toBe('/login?returnTo=%2Fdashboard');
    });

    it('allows dashboard access when session is valid', () => {
      const now = 1_700_000_000_000;
      localStorage.setItem(
        TURNERA_SESSION_KEY,
        JSON.stringify({
          version: 'v1',
          token: 'mock.jwt.token',
          user: { id: 'user-1', email: 'demo@turnea.app', name: 'Demo User' },
          selectedBusinessTypes: ['industrial'],
          issuedAt: now - 1_000,
          expiresAt: now + 10_000
        })
      );

      const access = canAccessDashboard(now);

      expect(access.allowed).toBe(true);
      expect(access.redirectTo).toBeUndefined();
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
        '/login?returnTo=%2Fdashboard%2Fturnos%3Ffiltro%3Dhoy'
      );
    });
  });

  describe('logout', () => {
    it('clears session and redirects to landing login', () => {
      localStorage.setItem(
        TURNERA_SESSION_KEY,
        JSON.stringify({
          version: 'v1',
          token: 'mock.jwt.token',
          user: { id: 'user-1', email: 'demo@turnea.app', name: 'Demo User' },
          selectedBusinessTypes: [],
          issuedAt: Date.now(),
          expiresAt: Date.now() + 1_000
        })
      );

      const redirectTo = logoutAndRedirect();

      expect(localStorage.getItem(TURNERA_SESSION_KEY)).toBeNull();
      expect(redirectTo).toBe('/login');
    });
  });
});
