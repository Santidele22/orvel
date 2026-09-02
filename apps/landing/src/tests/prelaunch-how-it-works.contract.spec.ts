import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const HOW_IT_WORKS_PATH = new URL(
  '../components/organisms/prelaunch/PrelaunchHowItWorks.astro',
  import.meta.url
);

describe('Contract: prelaunch Cómo funciona section', () => {
  it('shows the client booking flow with a mocked phone, not competitor UI', async () => {
    const source = await readFile(HOW_IT_WORKS_PATH, 'utf8');

    expect(source).toContain('id="como-funciona"');
    expect(source).toContain('¿Cómo');
    expect(source).toContain('funciona');
    expect(source).toContain('Elige el servicio');
    expect(source).toContain('Elige fecha y hora');
    expect(source).toContain('Reserva confirmada');
    expect(source).toContain('data-mock-booking-preview');
    expect(source).toContain('data-mock-calendar');
    expect(source).toContain('data-how-audience');
    expect(source).toContain('Para tus clientes');
    expect(source).toContain('Para tu negocio');
    expect(source).toContain('/auth/signup/plan');
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).not.toMatch(/cloxy/i);
    expect(source).not.toMatch(/\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp)\b/i);
    expect(source).not.toMatch(/fundadores?/i);
  });

  it('auto-advances three distinct mocks per audience and respects reduced motion', async () => {
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
    expect(mockStepValues.filter((value) => value === '0').length).toBeGreaterThanOrEqual(2);
    expect(mockStepValues.filter((value) => value === '1').length).toBeGreaterThanOrEqual(2);
    expect(mockStepValues.filter((value) => value === '2').length).toBeGreaterThanOrEqual(2);

    expect(source).not.toMatch(/cloxy/i);
    expect(source).not.toMatch(/\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp)\b/i);
    expect(source).not.toMatch(/fundadores?/i);
  });
});
