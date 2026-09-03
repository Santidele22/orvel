import { describe, expect, it } from 'vitest';
import { readFile, stat } from 'node:fs/promises';

const HOW_IT_WORKS_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchHowItWorks.astro',
  import.meta.url
);
const PRELAUNCH_PUBLIC = new URL('../../public/prelaunch/', import.meta.url);

const FORBIDDEN_VISITOR =
  /\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp|cloxy)\b|seña|cobro online|mercado pago|fundadores?/i;

const REAL_SHOTS = [
  'public-turnero-portal.png',
  'public-turnero-form.png',
  'showcase-inicio-web.png',
  'showcase-inicio-mobile.jpg',
  'showcase-agenda-web.png',
  'showcase-agenda-mobile.jpg',
  'showcase-clientes-web.png',
  'showcase-clientes-mobile.jpg'
] as const;

async function howItWorksSource(): Promise<string> {
  return readFile(HOW_IT_WORKS_PATH, 'utf8');
}

function audiencePanelSource(source: string, audience: 'client' | 'business'): string {
  const marker = `data-how-audience-panel="${audience}"`;
  const start = source.indexOf(marker);
  if (start < 0) return '';

  const other = audience === 'client' ? 'business' : 'client';
  const otherPos = source.indexOf(`data-how-audience-panel="${other}"`, start + marker.length);
  const ctaPos = source.indexOf('Empezá gratis', start);
  const end = otherPos > start ? otherPos : ctaPos > start ? ctaPos : source.length;
  return source.slice(start, end);
}

describe('Contract: prelaunch Cómo funciona section', () => {
  it('covers client and business with an audience toggle and honest copy', async () => {
    const source = await howItWorksSource();

    expect(source).toContain('id="como-funciona"');
    expect(source).toContain('Cómo funciona');
    expect(source).toContain('Tanto para el negocio como para el cliente.');
    expect(source).toContain('data-how-audience');
    expect(source).toContain('Para tus clientes');
    expect(source).toContain('Para tu negocio');
    expect(source).toContain('data-how-audience-panel="client"');
    expect(source).toContain('data-how-audience-panel="business"');
    expect(source).toMatch(
      /<button\b[^>]*\bmin-h-\[44px\][^>]*\bcursor-pointer[^>]*\bdata-how-audience=|<button\b[^>]*\bdata-how-audience=[^>]*\bmin-h-\[44px\][^>]*\bcursor-pointer/
    );
    expect(source).toMatch(/data-how-audience="client"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*data-how-audience="client"/);

    expect(source).toContain('Elige el servicio');
    expect(source).toContain('Elige fecha y hora');
    expect(source).toContain('Reserva confirmada');
    expect(source).toContain('Disponibilidad en tiempo real');
    expect(source).toContain('Precios y duración visibles');
    expect(source).toContain('Sin ida y vuelta');
    expect(source).toContain('Bloqueos automáticos');
    expect(source).toContain('Recordatorio automático');
    expect(source).toContain('Reprogramar en un toque');

    expect(source).toContain('Creá tu cuenta');
    expect(source).toContain('En minutos, sin tarjeta. Cargás servicios, precios y horarios.');
    expect(source).toContain('Compartís el link');
    expect(source).toContain('Un link del negocio. Lo ponés en tu perfil o se lo mandás al cliente.');
    expect(source).toContain('El turno llega solo');
    expect(source).toContain('El cliente reserva con disponibilidad real. Queda en la agenda; los detalles van por email.');
    expect(source).toContain('Gestionás el día');
    expect(source).toContain('Agenda y clientes juntos. Desde el celular o la computadora.');

    expect(source).toContain('01');
    expect(source).toContain('02');
    expect(source).toContain('03');
    expect(source).toContain('04');
    expect(source).toContain('Empezá gratis');
    expect(source).toContain('/auth/signup/plan');
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).toMatch(/border-b-2/);

    expect(source).not.toContain('Vista de ejemplo');
    expect(source).not.toContain('Corte clásico');
    expect(source).not.toContain('10:37');
    expect(source).not.toContain('data-mock-calendar');
    expect(source).not.toContain('data-mock-booking-preview');
    expect(source).not.toMatch(FORBIDDEN_VISITOR);
  });

  it('uses real booking screenshots for the client flow', async () => {
    const source = await howItWorksSource();
    const business = audiencePanelSource(source, 'business');

    expect(source).toContain('/prelaunch/public-turnero-portal.png');
    expect(source).toContain('/prelaunch/public-turnero-form.png');
    expect(source).not.toContain('/prelaunch/showcase-inicio-web.png');
    expect(source).not.toContain('/prelaunch/showcase-inicio-mobile.jpg');
    expect(source).not.toContain('/prelaunch/showcase-agenda-web.png');
    expect(source).not.toContain('/prelaunch/showcase-agenda-mobile.jpg');
    expect(source).not.toContain('/prelaunch/showcase-clientes-web.png');
    expect(source).not.toContain('/prelaunch/showcase-clientes-mobile.jpg');
    expect(business).not.toContain('/prelaunch/showcase-inicio');
    expect(business).not.toContain('/prelaunch/showcase-agenda');
    expect(business).not.toContain('/prelaunch/showcase-clientes');

    for (const file of REAL_SHOTS) {
      const info = await stat(new URL(file, PRELAUNCH_PUBLIC));
      expect(info.size).toBeGreaterThan(1000);
    }
  });

  it('auto-advances the active audience and respects reduced motion', async () => {
    const source = await howItWorksSource();

    expect(source).toContain('data-how-step-index');
    expect(source).toContain('data-how-mock');
    expect(source).toContain('data-how-mock-step="0"');
    expect(source).toContain('data-how-mock-step="1"');
    expect(source).toContain('data-how-mock-step="2"');
    expect(source).not.toContain('data-how-mock-step="3"');
    expect(source).toMatch(/data-how-autoplay/);
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(source).toMatch(/setInterval|setTimeout/);
    expect(source).toContain('IntersectionObserver');
    expect(source).toContain('visibilityState');
    expect(source).toMatch(/<button\b[^>]*\bdata-how-step-index=/);
    expect(source).toMatch(/client:\s*3/);
    expect(source).not.toMatch(/business:\s*4/);

    const mockStepValues = [...source.matchAll(/data-how-mock-step="(\d+)"/g)].map(
      (match) => match[1]
    );
    expect(new Set(mockStepValues)).toEqual(new Set(['0', '1', '2']));

    expect(source).not.toMatch(FORBIDDEN_VISITOR);
  });

  it('shows the business audience as a 2×2 landing-card grid', async () => {
    const source = await howItWorksSource();
    const business = audiencePanelSource(source, 'business');

    expect(business.length).toBeGreaterThan(0);
    expect(business).toMatch(/\bgrid\b/);
    expect(business).toMatch(/grid-cols-2/);
    expect(business).toContain('landing-card');
    expect(business).not.toContain('aspect-square');
    expect(business).toMatch(/PASO \{step\.n\}/);
    expect(source).toContain("n: '01'");
    expect(source).toContain("n: '02'");
    expect(source).toContain("n: '03'");
    expect(source).toContain("n: '04'");
    expect(source).toMatch(/icon: 'ri-/);
    expect(business).toContain('step.icon');
    expect(business).not.toContain('data-how-step-index');
    expect(business).not.toContain('data-how-mock');
    expect(business).not.toContain('data-how-mock-step');
    expect(business).not.toContain('/prelaunch/showcase-inicio');
    expect(business).not.toContain('/prelaunch/showcase-agenda');
    expect(business).not.toContain('/prelaunch/showcase-clientes');
    expect(business).not.toContain('-bottom-4 -right-3');
  });

  it('uses underline tabs and a copy+visual stage instead of pills or a timeline fold', async () => {
    const source = await howItWorksSource();
    const client = audiencePanelSource(source, 'client');

    expect(client).toContain('data-how-stage');
    expect(client).toContain('data-how-stage-copy');
    expect(client).toContain('data-how-step-index');
    expect(client).toMatch(
      /(?:class="[^"]*\bflex\b[^"]*"[^>]*data-how-steps=|data-how-steps="[^"]*"[^>]*class="[^"]*\bflex\b|class="[^"]*\bborder-b\b[^"]*"[^>]*role="tablist"|role="tablist"[^>]*class="[^"]*\bborder-b\b)/
    );
    expect(client).toMatch(
      /<button\b[^>]*\bmin-h-\[44px\][^>]*\bdata-how-step-index=|<button\b[^>]*\bdata-how-step-index=[^>]*\bmin-h-\[44px\]/
    );
    expect(client).toContain('border-b-2');
    expect(source).not.toContain('data-how-dot-index');
    expect(source).not.toContain('absolute left-[22px]');
    expect(source).not.toContain('w-px bg-white/10');
    expect(source).not.toMatch(/absolute\s+-left-6/);
    expect(source).not.toMatch(/top-24/);
    expect(source).not.toMatch(/absolute\s+inset-0/);
    expect(source).not.toMatch(/<ol\b[^>]*\bspace-y-4\b/);
  });

  it('locks step height with a CSS grid stack instead of display:none', async () => {
    const source = await howItWorksSource();

    expect(source).toContain('col-start-1');
    expect(source).toContain('row-start-1');
    expect(source).toContain('invisible');
    expect(source).toMatch(/min-h-\[[5-9]\d{2}px\]/);

    const stageCopyTags = source.match(/<div\b[^>]*data-how-stage-copy[^>]*>/g) ?? [];
    expect(stageCopyTags.length).toBeGreaterThanOrEqual(1);
    expect((source.match(/data-how-stage-copy/g) ?? []).length).toBeGreaterThanOrEqual(1);
    for (const tag of stageCopyTags) {
      expect(tag).not.toMatch(/(?:^|\s)hidden(?:\s|=|>|$)/);
      expect(tag).not.toMatch(/\bclass="[^"]*\bhidden\b/);
      expect(tag).not.toMatch(/class:list=\{[^}]*['"]hidden['"]/);
    }

    const mockStepTags = source.match(/<div\b[^>]*data-how-mock-step[^>]*>/g) ?? [];
    expect(mockStepTags.length).toBe(3);
    for (const tag of mockStepTags) {
      expect(tag).not.toMatch(/(?:^|\s)hidden(?:\s|=|>|$)/);
      expect(tag).not.toMatch(/\bclass="[^"]*\bhidden\b/);
      expect(tag).not.toMatch(/class:list=\{[^}]*['"]hidden['"]/);
    }

    const showStep = source.match(/function showStep\([\s\S]*?\n    \}/)?.[0] ?? '';
    expect(showStep).toContain('invisible');
    expect(showStep).not.toContain("toggleAttribute('hidden'");
    expect(showStep).not.toMatch(/classList\.toggle\('hidden'/);

    expect(source).not.toContain('data-how-dot-index');
    expect(source).not.toMatch(/absolute\s+-left-6/);
  });
});
