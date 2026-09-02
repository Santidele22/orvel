import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const HOW_IT_WORKS_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchHowItWorks.astro',
  import.meta.url
);

const FORBIDDEN_VISITOR =
  /\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp|cloxy)\b|seña|cobro online|mercado pago|fundadores?/i;

describe('Contract: prelaunch Cómo funciona section', () => {
  it('shows the client booking flow with underline tabs and a sibling phone', async () => {
    const source = await readFile(HOW_IT_WORKS_PATH, 'utf8');

    expect(source).toContain('id="como-funciona"');
    expect(source).toContain('Cómo funciona');
    expect(source).toContain('De la búsqueda al turno confirmado');
    expect(source).toContain(
      'Tus clientes entran al link del negocio, eligen el servicio, la fecha y confirman. Sin apps, sin registro, sin llamadas.'
    );
    expect(source).toContain('Elige el servicio');
    expect(source).toContain('Elige fecha y hora');
    expect(source).toContain('Reserva confirmada');
    expect(source).toContain('01');
    expect(source).toContain('02');
    expect(source).toContain('03');
    expect(source).toContain('Disponibilidad en tiempo real');
    expect(source).toContain('Precios y duración visibles');
    expect(source).toContain('Sin ida y vuelta');
    expect(source).toContain('Bloqueos automáticos');
    expect(source).toContain('Recordatorio automático');
    expect(source).toContain('Reprogramar en un toque');
    expect(source).toContain('Vista de ejemplo');
    expect(source).toContain('data-mock-booking-preview');
    expect(source).toContain('data-mock-calendar');
    expect(source).toContain('/auth/signup/plan');
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).toMatch(/border-b-2/);
    expect(source).not.toContain('data-how-audience');
    expect(source).not.toContain('Para tu negocio');
    expect(source).not.toContain('Para tus clientes');
    expect(source).not.toContain('businessSteps');
    expect(source).not.toContain('Paso a paso');
    expect(source).not.toMatch(FORBIDDEN_VISITOR);
  });

  it('auto-advances three distinct mocks and respects reduced motion', async () => {
    const source = await readFile(HOW_IT_WORKS_PATH, 'utf8');

    expect(source).toContain('data-how-step-index');
    expect(source).toContain('data-how-mock');
    expect(source).toContain('data-how-mock-step="0"');
    expect(source).toContain('data-how-mock-step="1"');
    expect(source).toContain('data-how-mock-step="2"');
    expect(source).toMatch(/data-how-autoplay/);
    expect(source).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(source).toMatch(/setInterval|setTimeout/);
    expect(source).toContain('IntersectionObserver');
    expect(source).toContain('visibilityState');
    expect(source).toMatch(/<button\b[^>]*\bdata-how-step-index=/);

    const mockStepValues = [...source.matchAll(/data-how-mock-step="(\d+)"/g)].map(
      (match) => match[1]
    );
    expect(new Set(mockStepValues)).toEqual(new Set(['0', '1', '2']));
    expect(mockStepValues.filter((value) => value === '0').length).toBeGreaterThanOrEqual(1);
    expect(mockStepValues.filter((value) => value === '1').length).toBeGreaterThanOrEqual(1);
    expect(mockStepValues.filter((value) => value === '2').length).toBeGreaterThanOrEqual(1);

    expect(source).not.toContain('data-how-audience');
    expect(source).not.toMatch(FORBIDDEN_VISITOR);
  });

  it('uses underline tabs and a copy+phone stage instead of pills or a timeline fold', async () => {
    const source = await readFile(HOW_IT_WORKS_PATH, 'utf8');

    expect(source).toContain('data-how-stage');
    expect(source).toContain('data-how-stage-copy');
    expect(source).toContain('data-how-step-index');
    expect(source).toMatch(
      /(?:class="[^"]*\bflex\b[^"]*"[^>]*data-how-steps=|data-how-steps="[^"]*"[^>]*class="[^"]*\bflex\b|class="[^"]*\bborder-b\b[^"]*"[^>]*role="tablist"|role="tablist"[^>]*class="[^"]*\bborder-b\b)/
    );
    expect(source).toMatch(
      /<button\b[^>]*\bmin-h-\[44px\][^>]*\bdata-how-step-index=|<button\b[^>]*\bdata-how-step-index=[^>]*\bmin-h-\[44px\]/
    );
    expect(source).not.toContain('data-how-dot-index');
    expect(source).not.toContain('absolute left-[22px]');
    expect(source).not.toContain('w-px bg-white/10');
    expect(source).not.toMatch(/absolute\s+-left-6/);
    expect(source).not.toMatch(/top-24/);
    expect(source).not.toMatch(/absolute\s+inset-0/);
    expect(source).not.toMatch(/<ol\b[^>]*\bspace-y-4\b/);
  });

  it('locks step height with a CSS grid stack instead of display:none', async () => {
    const source = await readFile(HOW_IT_WORKS_PATH, 'utf8');

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
    expect(mockStepTags.length).toBeGreaterThanOrEqual(3);
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
