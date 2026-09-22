import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const WORKFLOW_PATH = new URL(
  '../../../../../../.github/workflows/deploy-promotion.yml',
  import.meta.url
);

describe('TDD contract: deploy-promotion has no dead standalone-dashboard path', () => {
  it('always deploys the combined site and never branches on a site mode', async () => {
    const workflow = await readFile(WORKFLOW_PATH, 'utf8');

    expect(workflow).not.toContain('site=');
    expect(workflow).not.toContain('angular_config');
    expect(workflow).not.toContain('Build dashboard');
    expect(workflow).not.toContain('deploy "$OUT"');
  });

  it('keeps the combined Vercel deploy with its build env and the qa alias', async () => {
    const workflow = await readFile(WORKFLOW_PATH, 'utf8');

    expect(workflow).toContain('npx vercel@59.11.7 deploy --token "$VERCEL_TOKEN" --yes');
    expect(workflow).toContain('--build-env PUBLIC_LANDING_URL=');
    expect(workflow).toContain('--build-env PUBLIC_DASHBOARD_URL=');
    expect(workflow).toContain('vercel_alias=qa.orvel.pro');
    expect(workflow).toContain('alias "$URL"');
  });
});
