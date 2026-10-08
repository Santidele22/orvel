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

  it('keeps the combined Vercel deploy with its build env and no per-environment alias', async () => {
    const workflow = await readFile(WORKFLOW_PATH, 'utf8');

    expect(workflow).toContain('npx vercel@59.11.7 deploy --token "$VERCEL_TOKEN" --yes --prod');
    expect(workflow).toContain('--build-env PUBLIC_LANDING_URL=');
    expect(workflow).toContain('--build-env PUBLIC_DASHBOARD_URL=');
    // #1133 retired the qa environment: the combined project's production domain is assigned in
    // Vercel, so the workflow assigns no alias for it. The console, which has none, still gets one.
    expect(workflow).not.toContain('vercel_alias');
    expect(workflow).toContain('alias "$URL" "$CONSOLE_ALIAS"');
  });
});
