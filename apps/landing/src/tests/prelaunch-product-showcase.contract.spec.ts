import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SHOWCASE_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchProductShowcase.astro',
  import.meta.url
);
const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const PRELANZAMIENTO_PATH = new URL('../pages/prelanzamiento.astro', import.meta.url);
const AGENDA_WEB_PATH = new URL(
  '../../public/prelaunch/showcase-agenda-web.png',
  import.meta.url
);
const AGENDA_MOBILE_PATH = new URL(
  '../../public/prelaunch/showcase-agenda-mobile.jpg',
  import.meta.url
);
const CLIENTES_WEB_PATH = new URL(
  '../../public/prelaunch/showcase-clientes-web.png',
  import.meta.url
);
const CLIENTES_MOBILE_PATH = new URL(
  '../../public/prelaunch/showcase-clientes-mobile.jpg',
  import.meta.url
);

const JARGON = /\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp)\b/i;

describe('Contract: prelaunch product showcase section', () => {
  it('exists as a dark Orvel organism with Agenda and Clientes tabs, no Reportes', async () => {
    const source = await readFile(SHOWCASE_PATH, 'utf8');

    expect(source).toMatch(/id="[^"]+"|data-product-showcase/);
    expect(source).toMatch(/<section\b[^>]*\blanding-section\b/);
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).toContain('role="tablist"');
    expect(source).toMatch(/<button\b[^>]*\btype="button"/);
    expect(source).toContain('role="tab"');
    expect(source).toContain('aria-selected');
    expect(source).toContain('Agenda');
    expect(source).toContain('Clientes');
    expect(source).not.toMatch(/Reportes/i);
    expect(source).toContain('data-product-desktop');
    expect(source).toContain('data-product-phone');
    expect(source).toContain('landing-card');
    expect(source).toContain('text-text-primary');
    expect(source).not.toMatch(/cloxy/i);
    expect(source).not.toMatch(JARGON);
    expect(source).not.toMatch(/fundadores?/i);
  });

  it('uses an Orvel command-desk composition, not Cloxy product-ad chrome', async () => {
    const source = await readFile(SHOWCASE_PATH, 'utf8');
    const tablistAnchor = source.indexOf('Superficies del producto');
    const tablistWindow = source.slice(Math.max(0, tablistAnchor - 220), tablistAnchor + 80);
    const phoneOpen = source.match(/<div\b[^>]*data-product-phone[^>]*>/)?.[0] ?? '';
    const viewportChunk =
      source.match(/data-product-viewport-tab[\s\S]*?data-product-desktop[\s\S]*?data-product-phone/)?.[0] ??
      '';
    const tabButton =
      (source.match(/<button\b[\s\S]*?<\/button>/g) ?? []).find((button) =>
        button.includes('data-product-tab')
      ) ?? '';
    const viewportButton =
      (source.match(/<button\b[\s\S]*?<\/button>/g) ?? []).find((button) =>
        button.includes('data-product-viewport-tab')
      ) ?? '';

    expect(tablistAnchor).toBeGreaterThan(-1);
    expect(tablistWindow).toMatch(/flex-col/);
    expect(source).not.toMatch(/(?:<span\b[^>]*\brounded-full\b[^>]*>\s*<\/span>\s*){3}/);
    expect(phoneOpen).not.toMatch(/\babsolute\b/);
    expect(phoneOpen).not.toMatch(/-bottom/);
    expect(phoneOpen).not.toMatch(/-right/);
    expect(viewportChunk).toBeTruthy();
    expect(viewportChunk).not.toMatch(/orvel\.pro/i);
    expect(source).not.toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_minmax\(9\.5rem,11rem\)\]/);
    expect(tabButton).toContain('data-product-tab');
    expect(tabButton).not.toMatch(/\brounded-full\b/);
    expect(tabButton).toMatch(/\bcursor-pointer\b/);
    expect(tabButton).toMatch(/min-h-\[44px\]|\bmin-h-11\b/);
    expect(viewportButton).toContain('data-product-viewport-tab');
    expect(viewportButton).toMatch(/\bcursor-pointer\b/);
    expect(viewportButton).toMatch(/min-h-\[44px\]|\bmin-h-11\b/);
  });

  it('shows real Agenda and Clientes screenshots with a Web/Celular toggle', async () => {
    const source = await readFile(SHOWCASE_PATH, 'utf8');
    const agendaWeb = await readFile(AGENDA_WEB_PATH);
    const agendaMobile = await readFile(AGENDA_MOBILE_PATH);
    const clientesWeb = await readFile(CLIENTES_WEB_PATH);
    const clientesMobile = await readFile(CLIENTES_MOBILE_PATH);
    const imgTags = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);

    expect(agendaWeb.byteLength).toBeGreaterThan(1000);
    expect(agendaMobile.byteLength).toBeGreaterThan(1000);
    expect(clientesWeb.byteLength).toBeGreaterThan(1000);
    expect(clientesMobile.byteLength).toBeGreaterThan(1000);

    expect(imgTags.some((tag) => tag.includes('src="/prelaunch/showcase-agenda-web.png"'))).toBe(
      true
    );
    expect(imgTags.some((tag) => tag.includes('src="/prelaunch/showcase-agenda-mobile.jpg"'))).toBe(
      true
    );
    expect(imgTags.some((tag) => tag.includes('src="/prelaunch/showcase-clientes-web.png"'))).toBe(
      true
    );
    expect(
      imgTags.some((tag) => tag.includes('src="/prelaunch/showcase-clientes-mobile.jpg"'))
    ).toBe(true);

    expect(source).toContain('data-product-viewport-tab');
    expect(source).toContain('data-product-viewport-tab="web"');
    expect(source).toContain('data-product-viewport-tab="mobile"');
    expect(source).toContain('Web');
    expect(source).toContain('Celular');
    expect(source).toContain('Así se ve Orvel en la web y en el celular.');
    expect(source).not.toContain('Vista de ejemplo');
    expect(source).not.toContain('Corte clásico');
    expect(source).not.toContain('Ana López');
    expect(source).not.toContain('10:37');
  });

  it('is composed after Cómo funciona on index and prelanzamiento', async () => {
    const index = await readFile(INDEX_PATH, 'utf8');
    const prelanzamiento = await readFile(PRELANZAMIENTO_PATH, 'utf8');

    for (const page of [index, prelanzamiento]) {
      expect(page).toMatch(/organisms\/prelaunch\/PrelaunchProductShowcase/);
      expect(page).toMatch(
        /organisms\/prelaunch\/PrelaunchHowItWorks[\s\S]*organisms\/prelaunch\/PrelaunchProductShowcase/
      );
      expect(page).not.toMatch(/organisms\/prelaunch\/PrelaunchNovedades/);
      expect(page).not.toMatch(/organisms\/prelaunch\/WaitlistModal/);
    }
  });
});
