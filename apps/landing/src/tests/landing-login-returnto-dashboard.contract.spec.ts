import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { sanitizeLandingAuthReturnTo } from '../lib/auth-return-to';
import { loginWithProvider } from '../lib/auth-provider';

describe('Contract: landing login returnTo resolves to dashboard app', () => {
  it('falls back to the production dashboard origin outside local development when PUBLIC_DASHBOARD_URL is absent', () => {
    expect(
      sanitizeLandingAuthReturnTo('/dashboard/inicio', {
        currentOrigin: 'https://orvel.pro'
      })
    ).toBe('https://dashboard.orvel.pro/dashboard/inicio');

    expect(
      sanitizeLandingAuthReturnTo(null, {
        currentOrigin: 'https://orvel.pro'
      })
    ).toBe('https://dashboard.orvel.pro/dashboard/inicio');
  });

  it('infers the local dashboard origin from localhost landing when PUBLIC_DASHBOARD_URL is absent', () => {
    expect(
      sanitizeLandingAuthReturnTo('/dashboard/inicio', {
        currentOrigin: 'http://localhost:4321'
      })
    ).toBe('http://localhost:4200/dashboard/inicio');
  });

  it('keeps proxied localhost:3000 login returnTo on the proxy dashboard origin and never falls back to bare /inicio', () => {
    expect(
      sanitizeLandingAuthReturnTo('/dashboard/inicio', {
        currentOrigin: 'http://localhost:3000'
      })
    ).toBe('http://localhost:3000/dashboard/inicio');

    expect(
      sanitizeLandingAuthReturnTo('/inicio', {
        currentOrigin: 'http://localhost:3000'
      })
    ).toBe('http://localhost:3000/dashboard/inicio');
  });

  it('keeps the resolved absolute dashboard returnTo through email/password login', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost:4321' } }
    });

    try {
      const resolvedReturnTo = sanitizeLandingAuthReturnTo('/dashboard/inicio', {
        currentOrigin: 'http://localhost:4321'
      });

      const result = await loginWithProvider({
        attempt: { email: 'santi@example.com', password: 'secret', returnTo: resolvedReturnTo },
        supabaseLogin: async () => ({
          ok: true,
          token: 'token',
          user: {
            id: 'user_1',
            email: 'santi@example.com'
          }
        })
      });

      expect(result).toEqual({
        ok: true,
        redirectTo: 'http://localhost:4200/dashboard/inicio'
      });
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('does not expose a Google login entrypoint from the user-facing login page', () => {
    const loginPage = readFileSync(resolve(process.cwd(), 'src/pages/auth/login.astro'), 'utf8');

    expect(loginPage).not.toContain('id="googleBtn"');
    expect(loginPage).not.toContain("id='googleBtn'");
    expect(loginPage).not.toMatch(/Continuar\s+con\s+Google|Google disponible|Registrarse\s+con\s+Google/i);
    expect(loginPage).not.toContain("document.getElementById('googleBtn')");
    expect(loginPage).not.toContain('loginWithGoogle');
    expect(loginPage).not.toContain('createSupabaseOAuthAdapter');
    expect(loginPage).not.toContain('signInWithOAuth');
  });

  it('rejects token/payment-bearing and external returnTo values', () => {
    for (const unsafeReturnTo of [
      'https://evil.example/dashboard/inicio',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio?payment_id=123',
      '/dashboard/inicio#refresh_token=secret'
    ]) {
      expect(
        sanitizeLandingAuthReturnTo(unsafeReturnTo, {
          currentOrigin: 'http://localhost:4321'
        })
      ).toBe('http://localhost:4200/dashboard/inicio');
    }
  });

  it('rejects token/payment-bearing and external returnTo values to the production fallback outside localhost', () => {
    for (const unsafeReturnTo of [
      'https://evil.example/dashboard/inicio',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio?payment_id=123',
      '/dashboard/inicio#refresh_token=secret'
    ]) {
      expect(
        sanitizeLandingAuthReturnTo(unsafeReturnTo, {
          currentOrigin: 'https://orvel.pro'
        })
      ).toBe('https://dashboard.orvel.pro/dashboard/inicio');
    }
  });
});
