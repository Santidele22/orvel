import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const inlineScriptBlocks = (sourceText: string) =>
  Array.from(sourceText.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)).map((match) => match[1] ?? '');

describe('RED contract: landing Svelte/forms/performance preparation', () => {
  it('configures Astro with the Svelte integration before Svelte components are introduced', () => {
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const astroConfig = source('astro.config.mjs');
    const configuredPackages = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    };

    expect(configuredPackages).toHaveProperty('@astrojs/svelte');
    expect(astroConfig).toMatch(/from ['"]@astrojs\/svelte['"]/);
    expect(astroConfig).toMatch(/integrations\s*:\s*\[[\s\S]*svelte\s*\(/);
  });

  it('does not keep landing-owned signup validation on auth redirect pages', () => {
    const credentialsPage = source('src/pages/auth/signup/account.astro');

    expect(credentialsPage).toMatch(/buildInAppAuthRedirect/);
    expect(credentialsPage).not.toContain('signup-account-validation');
    expect(credentialsPage).not.toContain('signup-credentials-validation');
  });

  it('does not mount the global preloader on auth pages where it can block credentials/auth work', () => {
    const layout = source('src/layouts/Layout.astro');
    const authPages = [
      source('src/pages/auth/login.astro'),
      source('src/pages/auth/signup/plan.astro'),
      source('src/pages/auth/signup/account.astro'),
      source('src/pages/auth/signup/complete.astro')
    ];

    expect(layout).toMatch(/showPreloader\??\s*:\s*boolean/);
    expect(layout).toMatch(/const\s*\{[\s\S]*showPreloader\s*=\s*true[\s\S]*\}\s*=\s*Astro\.props/);
    expect(layout).toMatch(/\{\s*showPreloader\s*&&\s*<Preloader\s*\/?>\s*\}/);

    for (const authPage of authPages) {
      expect(authPage).toMatch(/buildInAppAuthRedirect/);
      expect(authPage).not.toMatch(/<Layout\b/);
      expect(authPage).not.toContain('Preloader');
    }
  });

  it('moves global reveal/preloader scripts out of large inline Astro scripts for performance preparation', () => {
    const layout = source('src/layouts/Layout.astro');
    const preloader = source('src/components/organisms/Preloader.astro');
    const layoutScripts = inlineScriptBlocks(layout).join('\n');
    const preloaderScripts = inlineScriptBlocks(preloader).join('\n');

    expect(layout).toContain("from '../lib/scroll-reveal'");
    expect(preloader).toContain("from '../../lib/preloader-controller'");
    expect(layoutScripts).not.toMatch(/new\s+IntersectionObserver|document\.addEventListener\(['"]astro:page-load['"]/);
    expect(preloaderScripts).not.toMatch(/window\.addEventListener\(['"]load['"]|document\.body\.style\.overflow|setTimeout\(/);
    expect(layoutScripts.length).toBeLessThan(500);
    expect(preloaderScripts.length).toBeLessThan(500);
  });

  it('keeps auth pages as thin redirects without legacy form controllers', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const credentialsPage = source('src/pages/auth/signup/account.astro');
    const loginScripts = inlineScriptBlocks(loginPage).join('\n');
    const credentialsScripts = inlineScriptBlocks(credentialsPage).join('\n');

    expect(loginPage).toMatch(/buildInAppAuthRedirect/);
    expect(credentialsPage).toMatch(/buildInAppAuthRedirect/);
    expect(loginPage).not.toContain('login-page-controller');
    expect(credentialsPage).not.toContain('signup-account-page-controller');
    expect(loginScripts.length).toBe(0);
    expect(credentialsScripts.length).toBe(0);
  });
});
