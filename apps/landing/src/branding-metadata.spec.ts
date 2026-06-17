import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const landingRoot = resolve(__dirname, '..');
const productionOrigin = 'https://orvel.pro';
const approvedSeoTitle = 'Orvel - Organizá tus turnos sin vueltas';
const approvedVisibleCta = 'Probalo hoy';
const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(landingRoot, relativePath), 'utf8');

describe('landing branding metadata', () => {
  it('uses the approved Orvel SEO title and propagates it through the shared layout metadata', () => {
    const indexPage = readProjectFile('src/pages/index.astro');
    const layout = readProjectFile('src/layouts/Layout.astro');
    const titleMatch = indexPage.match(/<Layout\s+title="([^"]+)"/);

    expect(titleMatch, 'Homepage must pass an explicit title to the shared layout.').not.toBeNull();

    const homepageTitle = titleMatch?.[1] ?? '';

    expect(homepageTitle).toBe(approvedSeoTitle);
    expect(homepageTitle).not.toMatch(/Probalo hoje|No necesit[aá]s aprender nada/i);

    expect(layout).toContain('<title>{title}</title>');
    expect(layout).toContain('property="og:title" content={title}');
    expect(layout).toContain('name="twitter:title" content={title}');
  });

  it('keeps stale SEO and CTA copy out of homepage metadata and CTA source files', () => {
    const homepageMetadataSources = [
      readProjectFile('src/pages/index.astro'),
      readProjectFile('src/layouts/Layout.astro'),
      readProjectFile('src/components/organisms/Hero.astro'),
      readProjectFile('src/components/organisms/CTA.astro')
    ].join('\n');

    expect(homepageMetadataSources).not.toMatch(/Probalo hoje/i);
    expect(homepageMetadataSources).not.toMatch(/No necesit[aá]s aprender nada/i);
  });

  it('uses the approved visible CTA copy in launch entry points', () => {
    const ctaSources = [
      readProjectFile('src/components/organisms/Hero.astro'),
      readProjectFile('src/components/organisms/CTA.astro')
    ].join('\n');

    expect(ctaSources).toContain(approvedVisibleCta);
    expect(ctaSources).not.toMatch(/Probalo hoje|Comenzar ahora|Activar Orvel/i);
  });

  it('publishes absolute production URLs for canonical and social image metadata', () => {
    const layout = readProjectFile('src/layouts/Layout.astro');
    const absoluteLogoUrl = `${productionOrigin}/logo.png`;

    expect(layout).toContain(`<link rel="canonical" href="${productionOrigin}/" />`);
    expect(layout).toContain(`property="og:url" content="${productionOrigin}/"`);
    expect(layout).toContain(`property="og:image" content="${absoluteLogoUrl}"`);
    expect(layout).toContain(`name="twitter:image" content="${absoluteLogoUrl}"`);
    expect(layout).not.toContain('content="/logo.png"');
  });

  it('references real Orvel favicon assets including Google-friendly raster or ico icons', () => {
    const layout = readProjectFile('src/layouts/Layout.astro');
    const faviconPath = resolve(landingRoot, 'public/favicon.svg');
    const googleFriendlyIconCandidates = [
      {
        path: resolve(landingRoot, 'public/favicon.ico'),
        markup: '<link rel="icon" href="/favicon.ico" sizes="any" />'
      },
      {
        path: resolve(landingRoot, 'public/favicon-32x32.png'),
        markup: '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />'
      }
    ];

    expect(layout).toContain(
      '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />'
    );
    expect(existsSync(faviconPath)).toBe(true);
    expect(readFileSync(faviconPath, 'utf8')).toContain('Orvel');

    expect(
      googleFriendlyIconCandidates.some(({ path, markup }) => existsSync(path) && layout.includes(markup)),
      'Google search results should have at least one raster/ico favicon reference backed by a real public asset.'
    ).toBe(true);
  });
});
