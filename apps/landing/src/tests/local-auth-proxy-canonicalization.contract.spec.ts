import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildLocalProxyAuthCanonicalUrl } from '../lib/local-auth-proxy-canonicalizer';

describe('Contract: local landing auth login canonicalizes to dev proxy', () => {
  it('redirects direct localhost:4321 /auth/login hits to localhost:3000 while preserving query params', () => {
    expect(
      buildLocalProxyAuthCanonicalUrl('http://localhost:4321/auth/login?plan=pro')
    ).toBe('http://localhost:3000/auth/login?plan=pro');
  });

  it('redirects direct 127.0.0.1:4321 /auth/login hits to localhost:3000', () => {
    expect(
      buildLocalProxyAuthCanonicalUrl('http://127.0.0.1:4321/auth/login?returnTo=%2Fdashboard%2Finicio')
    ).toBe('http://localhost:3000/auth/login?returnTo=%2Fdashboard%2Finicio');
  });

  it('keeps /auth/signup/plan create-account notices proxy-aware instead of bouncing back to bare 4321', () => {
    expect(
      buildLocalProxyAuthCanonicalUrl('http://localhost:4321/auth/signup/plan?reason=missing_plan&intent=create_account')
    ).toBe('http://localhost:3000/auth/signup/plan?reason=missing_plan&intent=create_account');

    expect(
      buildLocalProxyAuthCanonicalUrl('http://127.0.0.1:4321/auth/signup/plan?reason=invalid_plan&intent=create_account#plans-container')
    ).toBe('http://localhost:3000/auth/signup/plan?reason=invalid_plan&intent=create_account#plans-container');
  });

  it('normalizes stale returnTo=/inicio or returnTo=inicio during proxy canonicalization', () => {
    expect(
      buildLocalProxyAuthCanonicalUrl('http://localhost:4321/auth/login?returnTo=%2Finicio')
    ).toBe('http://localhost:3000/auth/login?returnTo=%2Fdashboard%2Finicio');

    expect(
      buildLocalProxyAuthCanonicalUrl('http://localhost:4321/auth/login?returnTo=inicio&utm_source=test')
    ).toBe('http://localhost:3000/auth/login?returnTo=%2Fdashboard%2Finicio&utm_source=test');
  });

  it('does not redirect when already on proxy or on production origins', () => {
    expect(buildLocalProxyAuthCanonicalUrl('http://localhost:3000/auth/login?returnTo=%2Finicio')).toBeNull();
    expect(buildLocalProxyAuthCanonicalUrl('https://orvel.example/auth/login?returnTo=%2Finicio')).toBeNull();
  });

  it('initializes login through the controller and runs canonical redirect before Supabase auth handlers', () => {
    const loginPage = readFileSync(resolve(process.cwd(), 'src/pages/auth/login.astro'), 'utf8');
    const loginController = readFileSync(resolve(process.cwd(), 'src/lib/login-page-controller.ts'), 'utf8');

    expect(loginPage).toContain("import { initLoginPage } from '../../lib/login-page-controller'");
    expect(loginPage).toContain('initLoginPage(import.meta.env)');

    const canonicalRedirectIndex = loginController.indexOf('buildLocalProxyAuthCanonicalUrl(window.location.href)');
    const supabaseAdapterIndex = loginController.indexOf('const supabaseLogin = createSupabaseLoginAdapterFromEnv');

    expect(canonicalRedirectIndex).toBeGreaterThan(-1);
    expect(supabaseAdapterIndex).toBeGreaterThan(-1);
    expect(canonicalRedirectIndex).toBeLessThan(supabaseAdapterIndex);
    expect(loginController).toMatch(/window\.location\.replace\(canonicalRedirectTo\)/);
  });

  it('runs the canonical redirect on the plan-selection page before plan-card click handlers initialize', () => {
    const planPage = readFileSync(resolve(process.cwd(), 'src/pages/auth/signup/plan.astro'), 'utf8');
    const planCards = readFileSync(resolve(process.cwd(), 'src/components/organisms/SignupPlanCards.astro'), 'utf8');

    expect(planPage).toContain("buildLocalProxyAuthCanonicalUrl(window.location.href)");
    expect(planPage).toMatch(/window\.location\.replace\(canonicalRedirectTo\)/);
    expect(planCards).toContain('isCreateAccountRedirectNoticeIntent');
  });
});
