import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SECTION_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchPublicTurnero.astro',
  import.meta.url
);
const INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const PRELANZAMIENTO_PATH = new URL('../pages/prelanzamiento.astro', import.meta.url);
const HOW_IT_WORKS_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchHowItWorks.astro',
  import.meta.url
);
const SHOWCASE_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchProductShowcase.astro',
  import.meta.url
);
const PORTAL_SHOT_PATH = new URL(
  '../../public/prelaunch/public-turnero-portal.png',
  import.meta.url
);
const FORM_SHOT_PATH = new URL(
  '../../public/prelaunch/public-turnero-form.png',
  import.meta.url
);

const JARGON = /\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp)\b/i;
const FORBIDDEN_CLAIMS =
  /whatsapp|seña|cobro online|mercado pago|fundadores?|walk-in|no-show|\bbuffers?\b|\bpwa\b|\bsaas\b/i;

describe('Contract: prelaunch public turnero section', () => {
  it('is composed on home after Cómo funciona, without replacing the hero or launch route', async () => {
    const index = await readFile(INDEX_PATH, 'utf8');
    const prelanzamiento = await readFile(PRELANZAMIENTO_PATH, 'utf8');

    for (const page of [index, prelanzamiento]) {
      expect(page).toMatch(/organisms\/prelaunch\/PrelaunchPublicTurnero/);
      expect(page).toMatch(
        /organisms\/prelaunch\/PrelaunchHowItWorks[\s\S]*organisms\/prelaunch\/PrelaunchPublicTurnero[\s\S]*organisms\/prelaunch\/PrelaunchProductShowcase/
      );
      expect(page).toMatch(
        /<PrelaunchHowItWorks\s*\/>\s*<PrelaunchPublicTurnero\s*\/>\s*<PrelaunchProductShowcase\s*\/>/
      );
      expect(page).not.toMatch(/organisms\/prelaunch\/PrelaunchNovedades/);
      expect(page).not.toMatch(/organisms\/prelaunch\/PrelaunchFeatures/);
      expect(page).not.toMatch(/<PrelaunchFeatures/);
    }

    expect(index).toMatch(/organisms\/prelaunch\/PrelaunchHero/);
    expect(index).not.toContain('/lanzamiento');
  });

  it('explains the public booking link with a two-column fold, numbered list, and signup CTA', async () => {
    const source = await readFile(SECTION_PATH, 'utf8');
    const headline = source.match(/<h2\b[\s\S]*?<\/h2>/)?.[0] ?? '';
    const chipsOpen = source.match(/<(?:ol|ul)\b[^>]*data-public-turnero-chips[^>]*>/)?.[0] ?? '';

    expect(source).toContain('id="turnero-publico"');
    expect(source).toMatch(/<section\b[^>]*\blanding-section\b/);
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).toContain('landing-container');
    expect(source).toContain('landing-title');
    expect(source).not.toContain('landing-eyebrow');

    expect(source).toContain('Turnero público — disponible ahora');
    expect(source).toMatch(/rounded-full/);

    expect(headline).toMatch(/reservan desde el celular, sin llamarte/);
    expect(headline).not.toMatch(/\bitalic\b/);
    expect(headline).toContain('font-headline');
    expect(headline).toContain('font-bold');

    expect(source).toMatch(/sin instalar nada/i);
    expect(source).toMatch(/sin cuenta/i);

    expect(source).toContain('01');
    expect(source).toContain('02');
    expect(source).toContain('03');
    expect(source).toContain('El link funciona a cualquier hora');
    expect(source).toContain('Confirmación al instante');
    expect(source).toContain('Nadie se queda sin turno');
    expect(source).toMatch(/ida y vuelta/);
    expect(source).toContain('border-t');
    expect(source).toContain('border-border');

    expect(chipsOpen).toBeTruthy();
    expect(chipsOpen).not.toMatch(/\babsolute\b/);

    expect(source).toContain('/auth/signup/plan');
    expect(source).toContain('Empezá gratis');
    expect(source).toContain('No necesitás tarjeta para probarlo');

    expect(source).not.toMatch(/cloxy/i);
    expect(source).not.toMatch(JARGON);
    expect(source).not.toMatch(FORBIDDEN_CLAIMS);
    expect(source).not.toMatch(/multi-?profesional/i);
  });

  it('shows overlapping real booking screenshots instead of an HTML booking-card mock', async () => {
    const source = await readFile(SECTION_PATH, 'utf8');
    const portalShot = await readFile(PORTAL_SHOT_PATH);
    const formShot = await readFile(FORM_SHOT_PATH);
    const chipsOpen = source.match(/<(?:ol|ul)\b[^>]*data-public-turnero-chips[^>]*>/)?.[0] ?? '';
    const shotsOpen = source.match(/<[^>]*data-public-turnero-shots[^>]*>/)?.[0] ?? '';
    const shotsChunk =
      source.match(/data-public-turnero-shots[\s\S]*?(?=<\/section>)/)?.[0] ?? '';
    const imgTags = [...source.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);

    expect(source).toContain('id="turnero-publico"');
    expect(portalShot.byteLength).toBeGreaterThan(1000);
    expect(formShot.byteLength).toBeGreaterThan(1000);

    expect(imgTags.some((tag) => tag.includes('src="/prelaunch/public-turnero-portal.png"'))).toBe(
      true
    );
    expect(imgTags.some((tag) => tag.includes('src="/prelaunch/public-turnero-form.png"'))).toBe(
      true
    );
    expect(imgTags.every((tag) => tag.includes('object-cover'))).toBe(true);

    expect(chipsOpen).not.toMatch(/\babsolute\b/);
    expect(shotsOpen).toMatch(/\brelative\b/);
    expect(shotsOpen).toContain('min-h-[540px]');
    expect(shotsChunk).toMatch(/\babsolute\b/);

    expect(source).toContain('Así se ve el link público de reservas.');
    expect(source).toContain('Turnero público: el cliente elige servicio y día');
    expect(source).toContain('Turnero público: el cliente confirma la reserva');

    expect(source).not.toContain('Portal de reservas online');
    expect(source).not.toContain('barber shop');
    expect(source).not.toContain('Afeitado clásico');
    expect(source).not.toContain('Corte clásico');
    expect(source).not.toContain('2 de junio');
    expect(source).not.toContain('Vista de ejemplo');
    expect(source).not.toContain('data-product-phone');
    expect(source).not.toContain('data-product-desktop');
  });

  it('does not rewrite Cómo funciona or the product showcase, and keeps #como-funciona', async () => {
    const howItWorks = await readFile(HOW_IT_WORKS_PATH, 'utf8');
    const showcase = await readFile(SHOWCASE_PATH, 'utf8');
    const index = await readFile(INDEX_PATH, 'utf8');

    expect(howItWorks).toContain('id="como-funciona"');
    expect(howItWorks).toContain('data-how-it-works');
    expect(howItWorks).toContain('data-how-stage');
    expect(showcase).toContain('data-product-showcase');
    expect(showcase).toContain('Agenda');
    expect(showcase).toContain('Clientes');
    expect(index).toMatch(/id="como-funciona"|PrelaunchHowItWorks/);
    expect(`${index}\n${howItWorks}`).not.toMatch(/id="turnero-publico"/);
  });

  it('keeps forbidden booking claims out of the new section and the home composition', async () => {
    const section = await readFile(SECTION_PATH, 'utf8');
    const index = await readFile(INDEX_PATH, 'utf8');

    expect(section).not.toMatch(FORBIDDEN_CLAIMS);
    expect(index).not.toMatch(/whatsapp|seña|cobro online|mercado pago|fundadores?/i);
    expect(index).not.toMatch(JARGON);
  });
});
