import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1133 — `main` is the only deployed environment, so this file asserts the combined site the way
 * the workflow builds it today (production only). It used to describe a qa target whose hostnames,
 * site flag and alias no longer exist.
 */
describe('deploy-promotion combined site', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/deploy-promotion.yml'),
    'utf8'
  );

  it('lets Vercel build the site instead of shipping a secretless prebuilt', () => {
    expect(workflow).not.toMatch(/env pull \.vercel\//);
    expect(workflow).not.toMatch(/--prebuilt/);
    expect(workflow).toContain('git switch -C ${{ github.ref_name }}');
  });

  it('deploys the combined site with the production build env', () => {
    expect(workflow).toContain('landing_url=https://orvel.pro');
    expect(workflow).toContain('dashboard_url=https://orvel.pro');
    expect(workflow).toContain('PUBLIC_LANDING_URL=${{ steps.target.outputs.landing_url }}');
    expect(workflow).toContain('PUBLIC_DASHBOARD_URL=${{ steps.target.outputs.dashboard_url }}');
    expect(workflow).toMatch(/npx vercel@59\.11\.7 deploy[^\n]*--prod/);
  });

  it('is production only, with no qa target left behind', () => {
    expect(workflow).not.toContain('site=combined');
    expect(workflow).not.toContain('qa.orvel.pro');
    expect(workflow).not.toContain('vercel_alias');
  });
});
