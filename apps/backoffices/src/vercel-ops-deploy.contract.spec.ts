import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Vercel ops deploy contract', () => {
  it('builds backoffices and copies dist to landing static/ops', async () => {
    const source = await readFile(resolve(repoRoot, 'scripts/build-vercel.mjs'), 'utf8');

    expect(source).toContain("'apps/backoffices'");
    expect(source).toContain("join(landingOutputDir, 'static', 'ops')");
  });

  it('routes /ops to the backoffice SPA through the shared hosting routes', async () => {
    // Hosting rewrites were centralised in scripts/vercel-output-config.mjs, so
    // the /ops route is declared there instead of inline in build-vercel.mjs.
    const source = await readFile(resolve(repoRoot, 'scripts/vercel-output-config.mjs'), 'utf8');

    expect(source).toContain("src: '/ops(?:/.*)?'");
    expect(source).toContain("dest: '/ops/index.html'");
    expect(source).toContain('OPS_SPA_REWRITE');
  });
});
