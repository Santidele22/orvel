import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deploy-promotion QA combined site', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/deploy-promotion.yml'),
    'utf8'
  );

  it('builds the landing+dashboard site for qa so /api/signup exists', () => {
    expect(workflow).toMatch(/site=combined/);
    expect(workflow).toMatch(/vercel_alias=qa\.orvel\.pro/);
    expect(workflow).toMatch(/git switch -C qa/);
    expect(workflow).not.toMatch(/alias "\$URL".*--yes/);
  });

  it('lets Vercel build combined QA on branch qa instead of a secretless prebuilt', () => {
    expect(workflow).not.toMatch(/env pull \.vercel\/qa\.env/);
    expect(workflow).toMatch(/git switch -C qa/);
    expect(workflow).toMatch(/--build-env PUBLIC_DASHBOARD_URL=https:\/\/qa\.orvel\.pro/);
    const combinedDeploy = workflow.match(
      /site == "combined"[\s\S]*?npx vercel@59\.11\.7 deploy([^\n]*)/
    )?.[1] ?? '';
    expect(combinedDeploy).not.toMatch(/--prebuilt/);
  });
});
