import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const landingRoot = resolve(__dirname, '..');
const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(landingRoot, relativePath), 'utf8');

describe('landing branding metadata', () => {
  it('uses a descriptive Spanish page title for Orvel', () => {
    const indexPage = readProjectFile('src/pages/index.astro');

    expect(indexPage).toContain(
      'title="Orvel - Turnos online simples para organizar tu negocio"'
    );
    expect(indexPage).not.toContain('Probalo hoje');
    expect(indexPage).not.toContain('No necesitás aprender nada');
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
