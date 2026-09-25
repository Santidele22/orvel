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

  it('landing /auth/login 302-redirects into dashboard in-app login instead of local proxy canonicalization on the page', () => {
    const loginPage = readFileSync(resolve(process.cwd(), 'src/pages/auth/login.astro'), 'utf8');

    expect(loginPage).toContain("import { buildInAppAuthRedirect } from '../../lib/in-app-auth-redirect'");
    expect(loginPage).toContain("buildInAppAuthRedirect(Astro.url, 'login', import.meta.env.PUBLIC_DASHBOARD_URL)");
    expect(loginPage).toMatch(/Astro\.redirect\([\s\S]*302/);
    expect(loginPage).not.toContain('initLoginPage');
    expect(loginPage).not.toContain('buildLocalProxyAuthCanonicalUrl');
  });

  it('landing /auth/signup/plan 302-redirects into dashboard in-app signup instead of local proxy canonicalization on the page', () => {
    const planPage = readFileSync(resolve(process.cwd(), 'src/pages/auth/signup/plan.astro'), 'utf8');

    expect(planPage).toContain("import { buildInAppAuthRedirect } from '../../../lib/in-app-auth-redirect'");
    expect(planPage).toContain("buildInAppAuthRedirect(Astro.url, 'signup', import.meta.env.PUBLIC_DASHBOARD_URL)");
    expect(planPage).toMatch(/Astro\.redirect\([\s\S]*302/);
    expect(planPage).not.toContain('buildLocalProxyAuthCanonicalUrl');
  });
});
