import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const fromRoot = (relativePath: string) => resolve(process.cwd(), relativePath);

const HOME_TS = 'src/app/pages/dashboard/home/dashboard-home.page.ts';
const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';

describe('KB015 · NG0203 runtime + shell visibility contracts (RED)', () => {
  it('forbids effect() usage inside ngAfterViewInit (must run in injection context only)', async () => {
    const source = await readFile(fromRoot(HOME_TS), 'utf-8');

    expect(source).not.toMatch(/ngAfterViewInit\s*\([^)]*\)\s*:\s*void\s*\{[\s\S]*?\beffect\s*\(/m);
  });

  it('keeps dashboard shell rendering contract for sidebar/topbar visibility hooks', async () => {
    const shellHtml = await readFile(fromRoot(SHELL_HTML), 'utf-8');

    expect(shellHtml).toContain('data-testid="sidebar"');
    expect(shellHtml).toContain('data-testid="topbar"');
    expect(shellHtml).toContain('<app-dashboard-sidebar');
    expect(shellHtml).toContain('<app-dashboard-topbar');
    expect(shellHtml).not.toMatch(/<app-dashboard-sidebar[^>]*\b(hidden|\*ngIf)=/);
    expect(shellHtml).not.toMatch(/<app-dashboard-topbar[^>]*\b(hidden|\*ngIf)=/);
  });
});
