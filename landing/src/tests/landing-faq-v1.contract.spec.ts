import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const PRELAUNCH_FAQ = new URL(
  '../components/organisms/prelaunch/PrelaunchFaq.astro',
  import.meta.url
);
const LAUNCH_FAQ = new URL('../components/organisms/FAQ.astro', import.meta.url);

const MP_AS_PROCESSOR =
  /se procesan con Mercado Pago|Integración con[\s\S]*Mercado Pago|cobrar turnos[\s\S]*Mercado Pago/i;

describe('Contract: landing FAQs describe v1 (señas + multi-profesional, no MP checkout)', () => {
  it('tells home/prelaunch visitors about several professionals and alias/CBU señas', async () => {
    const source = await readFile(PRELAUNCH_FAQ, 'utf8');

    expect(source).toMatch(/varios profesionales/i);
    expect(source).toMatch(/seña/i);
    expect(source).toMatch(/alias o CBU|alias\/CBU/i);
    expect(source).not.toMatch(MP_AS_PROCESSOR);
  });

  it('keeps the parked /lanzamiento FAQ on Free/Premium without Mercado Pago checkout', async () => {
    const source = await readFile(LAUNCH_FAQ, 'utf8');

    expect(source).toMatch(/Premium/i);
    expect(source).toMatch(/Turnos ilimitados/i);
    expect(source).toMatch(/seña/i);
    expect(source).toMatch(/varios profesionales/i);
    expect(source).not.toMatch(MP_AS_PROCESSOR);
  });
});
