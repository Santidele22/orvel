import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('RED: canonical landing auth UI contract', () => {
  it('makes landing /auth/login the canonical auth implementation instead of forwarding to dashboard auth', () => {
    const loginPage = source('src/pages/auth/login.astro');

    expect(loginPage).toContain("from '../../lib/auth-provider'");
    expect(loginPage).toMatch(/loginWithProvider|createSupabaseLoginAdapterFromEnv/);
    expect(loginPage).not.toContain("from '../../lib/dashboard-auth-handoff'");
    expect(loginPage).not.toContain('buildDashboardAuthUrl');
    expect(loginPage).not.toMatch(/window\.location\.href\s*=\s*dashboardAuthUrl/);
  });

  it('offers Google OAuth from the canonical UI through Supabase, not a dashboard redirect or local session mock', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const authProvider = source('src/lib/auth-provider.ts');
    const supabaseAdapter = source('src/lib/supabase-auth-adapter.ts');

    expect(loginPage).toContain('id="googleBtn"');
    expect(loginPage).toMatch(/loginWithGoogle\(/);
    expect(authProvider).toMatch(/createSupabaseOAuthAdapter/);
    expect(supabaseAdapter).toMatch(/auth\.signInWithOAuth\(\{\s*provider/s);
    expect(supabaseAdapter).toContain("provider: 'google'");
    expect(loginPage).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
  });

  it('offers manual email/password auth from the canonical UI through Supabase credentials APIs', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const supabaseAdapter = source('src/lib/supabase-auth-adapter.ts');

    expect(loginPage).toContain('name="email"');
    expect(loginPage).toContain('name="password"');
    expect(loginPage).toMatch(/loginWithProvider\(/);
    expect(supabaseAdapter).toMatch(/auth\.signInWithPassword\(/);
    expect(supabaseAdapter).toMatch(/auth\.signUp\(/);
    expect(loginPage).not.toMatch(/dev_|fake|mock|generateToken|localStorage\.setItem\([^)]*token/i);
  });

  it('sanitizes returnTo/handoff and does not treat query params as auth credentials', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const handoff = source('src/lib/dashboard-auth-handoff.ts');

    expect(handoff).toMatch(/PARAM_BLOCKLIST/);
    expect(handoff).toMatch(/access_token|refresh_token|id_token/);
    expect(loginPage).toMatch(/returnTo/);
    expect(loginPage).not.toMatch(/new URLSearchParams\([^)]*\)\.(get|has)\(['"](?:access_token|refresh_token|token|id_token|code)['"]/);
    expect(loginPage).not.toMatch(/localStorage\.getItem\([^)]*(auth|session|token)/i);
  });
});
