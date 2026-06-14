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

  it('keeps signup credentials validation Zod-backed and framework-agnostic', () => {
    const validationModule = source('src/lib/signup-credentials-validation.ts');
    const credentialsPage = source('src/pages/auth/signup/credentials.astro');

    expect(validationModule).toMatch(/from ['"]zod['"]/);
    expect(validationModule).toMatch(/z\.object\(/);
    expect(validationModule).toMatch(/safeParse\(/);
    expect(credentialsPage).toContain("from '../../../lib/signup-credentials-validation'");
    expect(validationModule).not.toMatch(/\b(window|document|HTMLElement|HTMLFormElement|Astro)\b/);
    expect(validationModule).not.toMatch(/\.astro['"]/);
  });

  it('does not mount the global preloader on auth pages where it can block credentials/auth work', () => {
    const layout = source('src/layouts/Layout.astro');
    const authPages = [
      source('src/pages/auth/login.astro'),
      source('src/pages/auth/signup/plan.astro'),
      source('src/pages/auth/signup/credentials.astro'),
      source('src/pages/auth/signup/complete.astro'),
      source('src/pages/auth/callback.astro'),
      source('src/pages/auth/oauth/onboarding-callback.astro')
    ];

    expect(layout).toMatch(/showPreloader\??\s*:\s*boolean/);
    expect(layout).toMatch(/const\s*\{[\s\S]*showPreloader\s*=\s*true[\s\S]*\}\s*=\s*Astro\.props/);
    expect(layout).toMatch(/\{\s*showPreloader\s*&&\s*<Preloader\s*\/?>\s*\}/);

    for (const authPage of authPages) {
      expect(authPage).toMatch(/<Layout\b[^>]*showPreloader=\{false\}/);
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

  it('keeps auth page inline scripts thin by delegating page behavior to testable modules', () => {
    const loginPage = source('src/pages/auth/login.astro');
    const credentialsPage = source('src/pages/auth/signup/credentials.astro');
    const loginScripts = inlineScriptBlocks(loginPage).join('\n');
    const credentialsScripts = inlineScriptBlocks(credentialsPage).join('\n');

    expect(loginPage).toContain("from '../../lib/login-page-controller'");
    expect(credentialsPage).toContain("from '../../../lib/signup-credentials-page-controller'");
    expect(loginScripts.length).toBeLessThan(2500);
    expect(credentialsScripts.length).toBeLessThan(5000);
    expect(credentialsScripts).not.toMatch(/const\s+createProtectedPendingSignupIntent\s*=|form\.addEventListener\(['"]submit['"]/);
  });
});
