import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const BUILD_VERCEL_PATH = new URL('../../../../../../scripts/build-vercel.mjs', import.meta.url);

describe('Contract: combined Vercel build injects dashboard runtime env', () => {
  it('writes runtime-env.js from PUBLIC_* process env into the dashboard browser dist', async () => {
    const source = await readFile(BUILD_VERCEL_PATH, 'utf8');

    expect(source).toContain('runtime-env.js');
    expect(source).toContain('__ORVEL_DASHBOARD_ENV__');
  });
});
