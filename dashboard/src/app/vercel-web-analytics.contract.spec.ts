import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const main = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf8');

describe('Contract: dashboard Vercel Web Analytics', () => {
  it('imports inject from @vercel/analytics and calls inject()', () => {
    expect(main).toMatch(/import\s*\{\s*inject\s*\}\s*from\s*['"]@vercel\/analytics['"]/);
    expect(main).toMatch(/\binject\s*\(/);
  });
});
