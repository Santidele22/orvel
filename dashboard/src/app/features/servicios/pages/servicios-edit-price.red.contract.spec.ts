import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('./servicios.page.html', import.meta.url), 'utf8');

describe('Issue #355 — service edit price input', () => {
  it('exposes an enabled price field in the service form', () => {
    const priceInput =
      html.match(/<input\b(?=[^>]*formControlName=["']precio["'])[^>]*>/i)?.[0] ?? '';

    expect(priceInput, 'edit/create service form must have a precio input').not.toBe('');
    expect(priceInput).toMatch(/data-testid=["']service-price-input["']/);
    expect(priceInput).not.toMatch(/\bdisabled\b/);
    expect(priceInput).not.toMatch(/\breadonly\b/);
    expect(priceInput).toMatch(/inputmode=["']decimal["']/);
  });

  it('keeps the price field full-width and tappable on a phone', () => {
    expect(html).toMatch(/data-testid=["']service-price-input["']/);
    expect(html).toMatch(/pointer-events-none[\s\S]{0,120}service-price-input|service-price-input[\s\S]{0,200}pointer-events-none/);
    expect(html).toMatch(/grid-cols-1[\s\S]{0,80}sm:grid-cols-2|service-price-field/);
    expect(html).toMatch(/max-h-\[92vh\][\s\S]{0,80}overflow-y-auto|overflow-y-auto[\s\S]{0,80}max-h-\[92vh\]/);
  });
});
