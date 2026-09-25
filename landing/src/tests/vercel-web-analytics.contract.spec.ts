import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve(process.cwd(), 'src/layouts/Layout.astro'), 'utf8');

describe('Contract: landing Vercel Web Analytics', () => {
  it('imports the Astro Analytics component and renders it in the layout', () => {
    expect(layout).toMatch(/from ['"]@vercel\/analytics\/astro['"]/);
    expect(layout).toContain('<Analytics');
  });
});
