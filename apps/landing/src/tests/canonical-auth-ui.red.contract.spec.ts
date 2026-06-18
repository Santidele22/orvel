import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const elementByIdSource = (sourceText: string, id: string) => {
  const match = sourceText.match(new RegExp(`<[^>]+id=["']${id}["'][\\s\\S]*?<\\/[a-z0-9-]+>`, 'i'));
  return match?.[0] ?? '';
};

describe('RED: canonical landing auth UI contract', () => {
  it('makes landing /auth/login the canonical auth implementation instead of forwarding to dashboard auth', () => {
    const loginPage = `${source('src/pages/auth/login.astro')}\n${source('src/lib/login-page-controller.ts')}`;

    expect(loginPage).toMatch(/from ['"](?:\.\/auth-provider|\.\.\/\.\.\/lib\/auth-provider)['"]/);
    expect(loginPage).toMatch(/loginWithProvider|createSupabaseLoginAdapterFromEnv/);
    expect(loginPage).not.toContain("from '../../lib/dashboard-auth-handoff'");
    expect(loginPage).not.toContain('buildDashboardAuthUrl');
    expect(loginPage).not.toMatch(/window\.location\.href\s*=\s*dashboardAuthUrl/);
  });

  it('removes Google from the user-facing login page so OAuth cannot be invoked from the UI', () => {
    const loginPage = source('src/pages/auth/login.astro');

    expect(loginPage).not.toContain('id="googleBtn"');
    expect(loginPage).not.toContain("id='googleBtn'");
    expect(loginPage).not.toMatch(/Continuar\s+con\s+Google|Google disponible|Registrarse\s+con\s+Google/i);
    expect(loginPage).not.toMatch(/<svg[\s\S]{0,1200}Google|Google[\s\S]{0,1200}<svg/i);
    expect(loginPage).not.toContain('googlePlanSelectionNotice');
    expect(loginPage).not.toContain('loginWithGoogle');
    expect(loginPage).not.toContain('createSupabaseOAuthAdapter');
    expect(loginPage).not.toContain('signInWithOAuth');
    expect(loginPage).not.toContain("document.getElementById('googleBtn')");
    expect(loginPage).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
  });

  it('does not render a Google plan-first modal or Google CTA copy in the canonical login page', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const inlineNotice = elementByIdSource(loginPage, 'googlePlanSelectionNotice');

    expect(inlineNotice).toBe('');
    expect(loginPage).not.toContain('No tenés cuenta, ¿querés crear una?');
    expect(loginPage).not.toContain('actionLabel="Crear cuenta"');
    expect(loginPage).not.toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(loginPage).not.toMatch(/google/i);
  });

  it('offers manual email/password auth from the canonical UI through Supabase credentials APIs', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const loginController = source('src/lib/login-page-controller.ts');
    const supabaseAdapter = source('src/lib/supabase-auth-adapter.ts');

    expect(loginPage).toContain('name="email"');
    expect(loginPage).toContain('name="password"');
    expect(loginController).toMatch(/loginWithProvider\(/);
    expect(supabaseAdapter).toMatch(/auth\.signInWithPassword\(/);
    expect(supabaseAdapter).toMatch(/auth\.signUp\(/);
    expect(loginPage).not.toMatch(/dev_|fake|mock|generateToken|localStorage\.setItem\([^)]*token/i);
  });

  it('never persists password values in browser storage from user-facing auth pages', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const signupCredentialsPage = source('src/pages/auth/signup/account.astro');
    const authPageSources = `${loginPage}\n${signupCredentialsPage}`;

    expect(authPageSources).not.toMatch(/(?:sessionStorage|localStorage)\.setItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(authPageSources).not.toMatch(/(?:sessionStorage|localStorage)\.getItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(authPageSources).not.toMatch(/(?:sessionStorage|localStorage)\[[^\]]*(?:password|confirmPassword|contraseñ)/i);
  });

  it('sanitizes returnTo/handoff and does not treat query params as auth credentials', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const loginController = source('src/lib/login-page-controller.ts');
    const handoff = source('src/lib/dashboard-auth-handoff.ts');

    expect(handoff).toMatch(/PARAM_BLOCKLIST/);
    expect(handoff).toMatch(/access_token|refresh_token|id_token/);
    expect(loginController).toMatch(/returnTo/);
    expect(`${loginPage}\n${loginController}`).not.toMatch(/new URLSearchParams\([^)]*\)\.(get|has)\(['"](?:access_token|refresh_token|token|id_token|code)['"]/);
    expect(`${loginPage}\n${loginController}`).not.toMatch(/localStorage\.getItem\([^)]*(auth|session|token)/i);
  });
});
