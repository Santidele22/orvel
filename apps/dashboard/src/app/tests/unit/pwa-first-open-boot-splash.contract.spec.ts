import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const linkTags = (html: string) => html.match(/<link\b[^>]*>/gi) ?? [];

const isRenderBlockingGoogleFontStylesheet = (tag: string): boolean => {
  if (!/fonts\.googleapis\.com/i.test(tag)) {
    return false;
  }
  if (!/\brel=["']stylesheet["']/i.test(tag)) {
    return false;
  }
  const media = tag.match(/\bmedia=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  const hasOnload = /\bonload=/i.test(tag);
  if (media === 'print' && hasOnload) {
    return false;
  }
  if (media && media !== 'all' && media !== 'screen') {
    return false;
  }
  return true;
};

describe('Contract: PWA first-open boot splash', () => {
  it('paints a boot splash inside app-root before Angular bootstrap', () => {
    const html = source('src/index.html');
    const appRoot = html.match(/<app-root>([\s\S]*?)<\/app-root>/)?.[1] ?? '';

    expect(appRoot).toContain('data-testid="pwa-boot-splash"');
    expect(appRoot).toContain('/dashboard/icons/icon-192x192.png');
    expect(appRoot).toContain('Cargando');
  });

  it('does not leave the Inter Google Fonts stylesheet render-blocking', () => {
    const html = source('src/index.html');
    const withoutNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/gi, '');
    const googleFontSheets = linkTags(withoutNoscript).filter((tag) =>
      /fonts\.googleapis\.com/i.test(tag),
    );
    const blockingSheets = googleFontSheets.filter(isRenderBlockingGoogleFontStylesheet);

    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('fonts.gstatic.com');
    expect(html).toMatch(/<noscript>[\s\S]*fonts\.googleapis\.com[\s\S]*<\/noscript>/i);
    expect(blockingSheets).toEqual([]);
  });

  it('captures beforeinstallprompt before app-root', () => {
    const html = source('src/index.html');
    const appRootIndex = html.indexOf('<app-root>');
    const beforeAppRoot = html.slice(0, appRootIndex);

    expect(appRootIndex).toBeGreaterThan(-1);
    expect(beforeAppRoot).toContain('beforeinstallprompt');
    expect(beforeAppRoot).toContain('__ORVEL_DEFERRED_INSTALL_PROMPT');
  });

  it('keeps the Angular boot splash until router-outlet activate', () => {
    const template = source('src/app/app.html');
    const appTs = source('src/app/app.ts');

    expect(template).toContain('pwa-boot-splash');
    expect(template).toContain('Cargando');
    expect(template).toMatch(/<router-outlet[\s\S]*\(activate\)=/);
    expect(appTs).toContain('signal(true)');
    expect(appTs).toContain('.set(false)');
  });

  it('keeps the PWA start_url and immediate service-worker registration', () => {
    const manifest = source('src/manifest.webmanifest');
    const config = source('src/app/app.config.ts');

    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(config).toContain('registerImmediately');
  });
});
