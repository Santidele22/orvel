import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TAILWIND_CONFIG = 'tailwind.config.js';
const POSTCSS_CONFIG = 'postcss.config.js';
const STYLES_CSS = 'src/styles.css';
const ANGULAR_JSON = 'angular.json';
const INDEX_HTML = 'src/index.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Tailwind: CDN → build local migration', () => {
  it('tailwind.config.js exists and is valid JS', async () => {
    const raw = await readFile(fromRoot(TAILWIND_CONFIG), 'utf-8');
    expect(raw).toContain('tailwindcss');
    expect(raw).toContain('darkMode');
    expect(raw).toContain('content');
    expect(raw).toContain('./src/**/*.{html,ts}');
  });

  it('postcss.config.js exists with tailwind and autoprefixer', async () => {
    const raw = await readFile(fromRoot(POSTCSS_CONFIG), 'utf-8');
    expect(raw).toContain('tailwindcss');
    expect(raw).toContain('autoprefixer');
  });

  it('src/styles.css has @tailwind directives', async () => {
    const raw = await readFile(fromRoot(STYLES_CSS), 'utf-8');
    expect(raw).toContain('@tailwind base');
    expect(raw).toContain('@tailwind components');
    expect(raw).toContain('@tailwind utilities');
  });

  it('angular.json references src/styles.css in build styles', async () => {
    const raw = await readFile(fromRoot(ANGULAR_JSON), 'utf-8');
    const config = JSON.parse(raw) as {
      projects?: Record<string, {
        architect?: {
          build?: {
            options?: { styles?: unknown[] };
          };
        };
      }>;
    };

    const styles = config.projects?.['salon-de-belleza']?.architect?.build?.options?.styles ?? [];
    expect(styles.some((s: unknown) => typeof s === 'string' && s.includes('styles.css'))).toBe(true);
  });

  it('index.html no longer loads Tailwind from CDN', async () => {
    const html = await readFile(fromRoot(INDEX_HTML), 'utf-8');
    expect(html).not.toContain('cdn.tailwindcss.com');
    expect(html).not.toContain('tailwind.config');
  });

  it('angular.json has serviceWorker pointing to ngsw-config.json', async () => {
    const raw = await readFile(fromRoot(ANGULAR_JSON), 'utf-8');
    const config = JSON.parse(raw) as {
      projects?: Record<string, {
        architect?: {
          build?: {
            options?: { serviceWorker?: string };
          };
        };
      }>;
    };

    const serviceWorker = config.projects?.['salon-de-belleza']?.architect?.build?.options?.serviceWorker;
    expect(serviceWorker).toBe('src/ngsw-config.json');
  });
});
