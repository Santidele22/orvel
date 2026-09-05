import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deploy-promotion QA combined site', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/deploy-promotion.yml'),
    'utf8'
  );

  it('builds the landing+dashboard site for qa so /api/signup exists', () => {
    expect(workflow).toMatch(/pnpm run build:vercel/);
    expect(workflow).toMatch(/site=combined/);
    expect(workflow).toMatch(/vercel_alias=qa\.orvel\.pro/);
    expect(workflow).toMatch(/deploy --prebuilt/);
    expect(workflow).not.toMatch(/alias "\$URL".*--yes/);
  });
});
