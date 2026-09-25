import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MOCK_LOGIN_TS = 'src/app/core/auth/mock-login-business-types.ts';
const DASHBOARD_SHELL_TS = 'src/app/shared/dashboard-shell/dashboard-shell.component.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Integration contract: landing + dashboard mock flow carries onboarding preload state', () => {
  it('landing mock session wiring includes selectedRubros + selectedTemplateIds + preloadedCatalog', async () => {
    const loginTs = await readFile(fromRoot(MOCK_LOGIN_TS), 'utf-8');

    expect(loginTs).toMatch(/selectedRubros/);
    expect(loginTs).toMatch(/selectedTemplateIds/);
    expect(loginTs).toMatch(/preloadedCatalog/);
  });

  it('dashboard shell consumes onboarding preload state from session/storage', async () => {
    const shellTs = await readFile(fromRoot(DASHBOARD_SHELL_TS), 'utf-8');

    expect(shellTs).toMatch(/selectedRubros/);
    expect(shellTs).toMatch(/selectedTemplateIds/);
    expect(shellTs).toMatch(/preloadedCatalog/);
  });
});
