import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('deploy-promotion combined site', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/deploy-promotion.yml'),
    'utf8'
  );

  it('builds the landing+dashboard site for qa so /api/signup exists', () => {
    expect(workflow).toMatch(/site=combined/);
    expect(workflow).toMatch(/vercel_alias=qa\.orvel\.pro/);
    expect(workflow).toContain('git switch -C ${{ github.ref_name }}');
    expect(workflow).not.toMatch(/alias "\$URL".*--yes/);
  });

  it('lets Vercel build combined QA on branch qa instead of a secretless prebuilt', () => {
    expect(workflow).not.toMatch(/env pull \.vercel\/qa\.env/);
    expect(workflow).toContain('git switch -C ${{ github.ref_name }}');
    expect(workflow).toContain('dashboard_url=https://qa.orvel.pro');
    expect(workflow).toContain('PUBLIC_DASHBOARD_URL=${{ steps.target.outputs.dashboard_url }}');
    expect(workflow).not.toMatch(/npx vercel@59\.11\.7 deploy[^\n]*--prebuilt/);
  });

  it('builds combined production so installed PWA can POST /api/signup on orvel.pro', () => {
    const mainTarget = workflow.split('refs/heads/main')[1]?.split('else')[0] ?? '';
    expect(mainTarget).toMatch(/site=combined/);
    expect(mainTarget).not.toMatch(/site=dashboard/);
    expect(workflow).toContain('landing_url=https://orvel.pro');
    expect(workflow).toContain('dashboard_url=https://orvel.pro');
    expect(workflow).toContain('PUBLIC_LANDING_URL=${{ steps.target.outputs.landing_url }}');
    expect(workflow).toContain('steps.target.outputs.vercel_args');
  });
});
