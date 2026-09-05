import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Vercel ops deploy contract', () => {
  it('builds backoffices and copies dist to landing static/ops with an /ops SPA rewrite', async () => {
    const source = await readFile(resolve(repoRoot, 'scripts/build-vercel.mjs'), 'utf8');

    expect(source).toContain("'apps/backoffices'");
    expect(source).toContain("join(landingOutputDir, 'static', 'ops')");
    expect(source).toContain("src: '/ops(?:/.*)?'");
    expect(source).toContain("dest: '/ops/index.html'");
  });
});
