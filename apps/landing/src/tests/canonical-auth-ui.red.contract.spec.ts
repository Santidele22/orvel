import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('RED: landing auth pages redirect into dashboard in-app auth', () => {
  it('redirects landing /auth/login to dashboard in-app login instead of owning the form', () => {
    const loginPage = source('src/pages/auth/login.astro');

    expect(loginPage).toMatch(/buildInAppAuthRedirect/);
    expect(loginPage).toMatch(/Astro\.redirect/);
    expect(loginPage).toMatch(/['"]login['"]/);
    expect(loginPage).not.toContain('name="email"');
    expect(loginPage).not.toContain('name="password"');
    expect(loginPage).not.toContain('initLoginPage');
  });

  it('does not expose Google OAuth on the login redirect page', () => {
    const loginPage = source('src/pages/auth/login.astro');

    expect(loginPage).not.toContain('id="googleBtn"');
    expect(loginPage).not.toMatch(/Continuar\s+con\s+Google|Google disponible|Registrarse\s+con\s+Google/i);
    expect(loginPage).not.toContain('loginWithGoogle');
    expect(loginPage).not.toContain('signInWithOAuth');
  });

  it('redirects landing signup pages to dashboard in-app signup', () => {
    const signupPages = [
      'src/pages/auth/signup/plan.astro',
      'src/pages/auth/signup/account.astro',
      'src/pages/auth/signup/credentials.astro',
      'src/pages/auth/signup/onboarding.astro',
      'src/pages/auth/signup/complete.astro'
    ];

    for (const path of signupPages) {
      const page = source(path);
      expect(page, path).toMatch(/buildInAppAuthRedirect/);
      expect(page, path).toMatch(/Astro\.redirect/);
      expect(page, path).toMatch(/['"]signup['"]/);
      expect(page, path).not.toContain('name="password"');
    }
  });

  it('never persists password values from landing auth redirect pages', () => {
    const authPageSources = [
      source('src/pages/auth/login.astro'),
      source('src/pages/auth/signup/credentials.astro'),
      source('src/pages/auth/signup/account.astro')
    ].join('\n');

    expect(authPageSources).not.toMatch(/(?:sessionStorage|localStorage)\.setItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
  });
});
