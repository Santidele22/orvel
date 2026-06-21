import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingRoot = resolve(__dirname, '..', '..');

describe('landing build idempotency contract', () => {
  it('pre-cleans ignored generated outputs before astro build', async () => {
    const packageJson = JSON.parse(await readFile(resolve(landingRoot, 'package.json'), 'utf8'));
    const cleanScript = await readFile(resolve(landingRoot, 'scripts', 'clean-build-output.mjs'), 'utf8');

    expect(packageJson.scripts.prebuild).toBe('node ./scripts/clean-build-output.mjs');
    expect(cleanScript).toContain("'dist'");
    expect(cleanScript).toContain("'.vercel/output'");
    expect(cleanScript).toContain('rm(');
    expect(cleanScript).not.toMatch(/rm\s*\([^)]*force:\s*false/);
  });
});
