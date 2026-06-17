import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const landingRoot = resolve(__dirname, '..');
const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(landingRoot, relativePath), 'utf8');

describe('landing branding metadata', () => {
  it('uses an Orvel-branded homepage title aligned with turnos for beauty businesses', () => {
    const indexPage = readProjectFile('src/pages/index.astro');
    const layout = readProjectFile('src/layouts/Layout.astro');
    const titleMatch = indexPage.match(/<Layout\s+title="([^"]+)"/);

    expect(titleMatch, 'Homepage must pass an explicit title to the shared layout.').not.toBeNull();

    const homepageTitle = titleMatch?.[1] ?? '';

    expect(homepageTitle).toMatch(/Orvel/i);
    expect(homepageTitle).toMatch(/turnos?/i);
    expect(homepageTitle).toMatch(/belleza|sal[oó]n|peluquer[ií]a|est[eé]tica/i);
    expect(homepageTitle).not.toMatch(/Probalo hoje|No necesit[aá]s aprender nada/i);

    expect(layout).toContain('<title>{title}</title>');
    expect(layout).toContain('property="og:title" content={title}');
    expect(layout).toContain('name="twitter:title" content={title}');
  });

  it('keeps known irrelevant Google-result copy out of homepage title/meta sources', () => {
    const homepageMetadataSources = [
      readProjectFile('src/pages/index.astro'),
      readProjectFile('src/layouts/Layout.astro')
    ].join('\n');

    expect(homepageMetadataSources).not.toMatch(/Probalo hoje/i);
    expect(homepageMetadataSources).not.toMatch(/No necesit[aá]s aprender nada/i);
  });

  it('references a real Orvel favicon asset', () => {
    const layout = readProjectFile('src/layouts/Layout.astro');
    const faviconPath = resolve(landingRoot, 'public/favicon.svg');

    expect(layout).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'
    );
    expect(existsSync(faviconPath)).toBe(true);
    expect(readFileSync(faviconPath, 'utf8')).toContain('Orvel');
  });
});
