import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MANIFEST_PATH = 'src/manifest.webmanifest';
const NGSW_CONFIG_PATH = 'src/ngsw-config.json';
const INDEX_HTML_PATH = 'src/index.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('PWA: manifest.webmanifest contract', () => {
  it('is valid JSON with required fields', async () => {
    const raw = await readFile(fromRoot(MANIFEST_PATH), 'utf-8');
    const manifest = JSON.parse(raw) as Record<string, unknown>;

    expect(manifest.name).toBe('Orvel');
    expect(manifest.short_name).toBe('Orvel');
    expect(manifest.theme_color).toBe('#0F172A');
    expect(manifest.background_color).toBe('#0F172A');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/dashboard/turnos');
    expect(manifest.scope).toBe('/dashboard/');
  });

  it('has at least 192x192 and 512x512 icons', async () => {
    const raw = await readFile(fromRoot(MANIFEST_PATH), 'utf-8');
    const manifest = JSON.parse(raw) as { icons?: Array<{ sizes: string }> };

    expect(manifest.icons).toBeDefined();
    expect(manifest.icons!.length).toBeGreaterThanOrEqual(2);

    const sizes = manifest.icons!.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('has at least one maskable icon', async () => {
    const raw = await readFile(fromRoot(MANIFEST_PATH), 'utf-8');
    const manifest = JSON.parse(raw) as {
      icons?: Array<{ purpose?: string }>;
    };

    const maskable = manifest.icons?.filter((i) => i.purpose === 'maskable');
    expect(maskable?.length).toBeGreaterThanOrEqual(1);
  });
});

describe('PWA: ngsw-config.json contract', () => {
  it('is valid JSON', async () => {
    const raw = await readFile(fromRoot(NGSW_CONFIG_PATH), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('has app and assets assetGroups', async () => {
    const raw = await readFile(fromRoot(NGSW_CONFIG_PATH), 'utf-8');
    const config = JSON.parse(raw) as {
      assetGroups?: Array<{ name: string }>;
    };

    expect(config.assetGroups).toBeDefined();
    expect(config.assetGroups!.length).toBeGreaterThanOrEqual(2);

    const names = config.assetGroups!.map((g) => g.name);
    expect(names).toContain('app');
    expect(names).toContain('assets');
  });
});

describe('PWA: index.html meta tags for iOS', () => {
  it('has apple-mobile-web-app-capable meta tag', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).toContain('apple-mobile-web-app-capable');
  });

  it('has apple-mobile-web-app-status-bar-style meta tag', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).toContain('black-translucent');
  });

  it('has apple-mobile-web-app-title meta tag', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).toContain('apple-mobile-web-app-title');
  });

  it('has viewport-fit=cover', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).toContain('viewport-fit=cover');
  });

  it('has apple-touch-icon link', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).toContain('apple-touch-icon');
  });

  it('has theme-color meta tag', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).toContain('theme-color');
  });

  it('has a web app manifest link for Chrome Android installability', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    const manifestLink = html.match(/<link\b[^>]*>/gi)?.find(
      (tag) =>
        /\brel=["']manifest["']/i.test(tag) &&
        /\bhref=["']manifest\.webmanifest["']/i.test(tag),
    );

    expect(manifestLink).toBeDefined();
  });

  it('no longer loads Tailwind from CDN', async () => {
    const html = await readFile(fromRoot(INDEX_HTML_PATH), 'utf-8');
    expect(html).not.toContain('cdn.tailwindcss.com');
  });
});
