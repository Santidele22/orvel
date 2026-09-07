import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ROADMAP = new URL('../components/organisms/Roadmap.astro', import.meta.url);
const FEATURES = new URL('../components/organisms/Features.astro', import.meta.url);
const RESULTS = new URL('../components/organisms/Results.astro', import.meta.url);

const MP_AS_PROCESSOR =
  /se procesan con Mercado Pago|Integración con[\s\S]*Mercado Pago|cobrar turnos[\s\S]*Mercado Pago/i;

describe('Contract: parked launch marketing copy matches v1', () => {
  it('does not sell Mercado Pago checkout on /plan and names señas plus several professionals', async () => {
    const source = await readFile(ROADMAP, 'utf8');

    expect(source).toMatch(/seña/i);
    expect(source).toMatch(/alias o CBU|alias\/CBU/i);
    expect(source).toMatch(/varios profesionales/i);
    expect(source).not.toMatch(MP_AS_PROCESSOR);
  });

  it('does not claim facturación lift on /lanzamiento Features', async () => {
    const source = await readFile(FEATURES, 'utf8');

    expect(source).not.toMatch(/aumenta tu facturación/i);
    expect(source).not.toMatch(/Buffers y preparación/i);
    expect(source).toMatch(/turno|reserva/i);
  });

  it('does not invent impact metrics on /lanzamiento Results', async () => {
    const source = await readFile(RESULTS, 'utf8');

    expect(source).not.toMatch(/\+38%/);
    expect(source).not.toMatch(/-5h/);
    expect(source).not.toMatch(/Turnos cobrados/);
  });
});
