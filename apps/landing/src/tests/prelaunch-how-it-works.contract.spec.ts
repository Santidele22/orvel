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
    expect(source).toContain('¿Cómo funciona?');
    expect(source).toContain('Elige el servicio');
    expect(source).toContain('Elige fecha y hora');
    expect(source).toContain('Reserva confirmada');
    expect(source).toContain('data-mock-booking-preview');
    expect(source).toContain('/auth/signup/plan');
    expect(source).toMatch(/<section\b[^>]*\bbg-bg-primary\b/);
    expect(source).not.toMatch(/cloxy/i);
    expect(source).not.toMatch(/\b(walk-in|no-show|buffers?|cta|saas|pwa|whatsapp)\b/i);
    expect(source).not.toMatch(/fundadores?/i);
  });
});
