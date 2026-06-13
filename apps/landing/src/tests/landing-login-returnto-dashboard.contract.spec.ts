import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { sanitizeLandingAuthReturnTo } from '../lib/auth-return-to';
import { loginWithProvider } from '../lib/auth-provider';
import { createSupabaseOAuthAdapter, parseSupabaseOAuthRedirectDiagnostics } from '../lib/supabase-auth-adapter';

describe('Contract: landing login returnTo resolves to dashboard app', () => {
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

  it('starts Google OAuth with a local landing callback carrying the resolved dashboard returnTo', async () => {
    const signInWithOAuth = async (input: unknown) => {
      captured.push(input);
      return { error: null };
    };
    const captured: unknown[] = [];
    const oauth = createSupabaseOAuthAdapter(
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key'
      },
      {
        createClient: () => ({ auth: { signInWithOAuth } }) as never
      }
    ) as unknown as (provider: 'google', input: { redirectTo: string }) => Promise<{ ok: boolean }>;

    const returnTo = sanitizeLandingAuthReturnTo('/dashboard/inicio', {
      currentOrigin: 'http://localhost:4321'
    });
    const callbackUrl = new URL('/auth/callback', 'http://localhost:4321');
    callbackUrl.searchParams.set('returnTo', returnTo);

    const result = await oauth('google', { redirectTo: callbackUrl.toString() });

    expect(result.ok).toBe(true);
    expect(captured).toEqual([
      {
        provider: 'google',
        options: {
          redirectTo: 'http://localhost:4321/auth/callback?returnTo=http%3A%2F%2Flocalhost%3A4200%2Fdashboard%2Finicio',
          queryParams: undefined
        }
      }
    ]);
  });

  it('exposes the Supabase OAuth authorization URL so the login UI can navigate explicitly', async () => {
    const oauthUrl = 'https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A4321%2Fauth%2Fcallback';
    const oauth = createSupabaseOAuthAdapter(
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key'
      },
      {
        createClient: () => ({
          auth: {
            signInWithOAuth: async () => ({
              data: { url: oauthUrl },
              error: null
            })
          }
        }) as never
      }
    ) as unknown as (provider: 'google', input: { redirectTo: string }) => Promise<{ ok: boolean; redirectTo?: string }>;

    await expect(
      oauth('google', {
        redirectTo: 'http://localhost:4321/auth/callback?returnTo=http%3A%2F%2Flocalhost%3A4200%2Fdashboard%2Finicio'
      })
    ).resolves.toEqual({
      ok: true,
      redirectTo: oauthUrl
    });
  });

  it('parses safe OAuth redirect diagnostics without exposing token-like data', () => {
    const diagnostics = parseSupabaseOAuthRedirectDiagnostics(
      'https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback%3FreturnTo%3Dhttp%253A%252F%252Flocalhost%253A3000%252Fdashboard%252Finicio&code=secret-code'
    );

    expect(diagnostics).toEqual({
      urlOrigin: 'https://example.supabase.co',
      urlPathname: '/auth/v1/authorize',
      redirectTo: 'http://localhost:3000/auth/callback?returnTo=http%3A%2F%2Flocalhost%3A3000%2Fdashboard%2Finicio',
      redirectToOrigin: 'http://localhost:3000',
      redirectToPathname: '/auth/callback'
    });
    expect(JSON.stringify(diagnostics)).not.toContain('secret-code');
  });

  it('blocks localhost:3000 OAuth navigation when Supabase returns an authorization URL for a different callback origin', async () => {
    const oauth = createSupabaseOAuthAdapter(
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key'
      },
      {
        createClient: () => ({
          auth: {
            signInWithOAuth: async () => ({
              data: {
                url: 'https://example.supabase.co/auth/v1/authorize?provider=google&redirect_to=http%3A%2F%2Flocalhost%3A4321%2Fauth%2Fcallback%3FreturnTo%3D%252Finicio'
              },
              error: null
            })
          }
        }) as never
      }
    ) as unknown as (provider: 'google', input: { redirectTo: string }) => Promise<{ ok: boolean; error?: string; oauthDiagnostics?: unknown }>;

    const result = await oauth('google', {
        redirectTo: 'http://localhost:3000/auth/callback?returnTo=http%3A%2F%2Flocalhost%3A3000%2Fdashboard%2Finicio'
      });

    expect(result).toMatchObject({
      ok: false,
      code: 'unknown',
      error: 'Supabase OAuth devolvió redirect_to=http://localhost:4321/auth/callback pero el proxy local necesita http://localhost:3000/auth/callback. Agregá http://localhost:3000/auth/callback a Supabase Auth URL allowlist y usá el proxy como Site URL local.'
    });
    expect(result.oauthDiagnostics).toMatchObject({
      urlOrigin: 'https://example.supabase.co',
      urlPathname: '/auth/v1/authorize',
      redirectToOrigin: 'http://localhost:4321',
      redirectToPathname: '/auth/callback'
    });
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

  it('returns a visible safe configuration error when Supabase env is missing for Google OAuth', async () => {
    const oauth = createSupabaseOAuthAdapter({}) as unknown as (
      provider: 'google',
      input: { redirectTo: string }
    ) => Promise<{ ok: boolean; error?: string }>;

    const result = await oauth('google', {
      redirectTo: 'http://localhost:4321/auth/callback?returnTo=http%3A%2F%2Flocalhost%3A4200%2Fdashboard%2Finicio'
    });

    expect(result).toEqual({
      ok: false,
      code: 'unavailable',
      error: 'Autenticación no configurada: faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY.'
    });
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
});
