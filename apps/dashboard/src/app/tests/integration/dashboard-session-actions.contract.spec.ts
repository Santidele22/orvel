import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_TS = 'src/app/shared/dashboard-shell/dashboard-shell.component.ts';
const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const TOPBAR_TS = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.ts';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const ZEN_TOPBAR_TS = 'src/app/shared/dashboard-topbar/templates/zen-topbar.component.ts';
const SIDEBAR_TS = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.ts';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';
const ZEN_SIDEBAR_TS = 'src/app/shared/dashboard-sidebar/templates/zen-sidebar.component.ts';

function fromDashboardRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

async function source(relativePath: string): Promise<string> {
  return readFile(fromDashboardRoot(relativePath), 'utf-8');
}

describe('Integration contract: dashboard session actions are functional', () => {
  it('shell owns the logout redirect by importing logoutAndRedirect and Router', async () => {
    const shellTs = await source(SHELL_TS);

    expect(shellTs).toMatch(/import\s+\{[^}]*\blogoutAndRedirect\b[^}]*\}\s+from\s+['"][^'"]*core\/auth\/route-protection['"]/);
    expect(shellTs).toMatch(/import\s+\{[^}]*\bRouter\b[^}]*\}\s+from\s+['"]@angular\/router['"]/);
    expect(shellTs).toMatch(/\b(?:private|protected|public)?\s+readonly\s+router\s*=\s*inject\(Router\)/);
  });

  it('shell exposes one handleLogout that signs out and uses logout navigation helper', async () => {
    const shellTs = await source(SHELL_TS);

    expect(shellTs).toMatch(/\b(?:protected|public)\s+async\s+handleLogout\s*\(\s*\)\s*:\s*Promise<void>/);
    expect(shellTs).toMatch(/\bhandleLogout[\s\S]*\blogoutAndRedirect\s*\(\s*\)/);
    expect(shellTs).toMatch(/\bhandleLogout[\s\S]*\bnavigateAfterLogout\s*\(\s*redirectTo\s*,\s*this\.router/);
  });

  it('shell wires sidebar logout confirmation and preserves topbar logout input compatibility', async () => {
    const shellHtml = await source(SHELL_HTML);

    expect(shellHtml).toMatch(/<app-dashboard-sidebar[\s\S]*\(logoutConfirm\)=["']handleLogout\(\)["']/);
    expect(shellHtml).toMatch(/<app-dashboard-topbar[\s\S]*\[onLogout\]=["']handleLogout["']/);
  });

  it('DashboardTopbarComponent accepts onLogout and forwards it into the dynamic template inputs', async () => {
    const topbarTs = await source(TOPBAR_TS);
    const topbarHtml = await source(TOPBAR_HTML);

    expect(topbarTs).toMatch(/@Input\(\)\s+onLogout\s*:\s*\(\s*\)\s*=>\s*(?:void|Promise<void>)/);
    expect(topbarTs).toMatch(/\btemplateInputs\b[\s\S]*\bonLogout\s*:/);
    expect(topbarHtml).toMatch(/\*ngComponentOutlet=["'][^"']*activeTemplate\(\)\.topbarComponent[\s\S]*inputs:\s*templateInputs\(\)/);
  });

  it('ZenTopbar removes decorative account menu actions while accepting legacy logout input', async () => {
    const zenTopbar = await source(ZEN_TOPBAR_TS);

    expect(zenTopbar).toMatch(/@Input\(\)\s+onLogout\s*:/);
    expect(zenTopbar).not.toMatch(/data-testid=["']dashboard-topbar-profile-action["']/);
    expect(zenTopbar).not.toMatch(/data-testid=["']dashboard-topbar-settings-action["']/);
    expect(zenTopbar).not.toMatch(/data-testid=["']dashboard-topbar-logout-action["']/);
    expect(zenTopbar).not.toMatch(/\(click\)=["']onLogout\(\)["']/);
  });

  it('ZenTopbar removes the dark-mode toggle from the user menu', async () => {
    const zenTopbar = await source(ZEN_TOPBAR_TS);

    expect(zenTopbar).not.toMatch(/Modo\s+Oscuro/i);
    expect(zenTopbar).not.toMatch(/toggleDarkMode\s*\(/);
    expect(zenTopbar).not.toMatch(/isDarkMode\s*\(/);
  });

  it('ZenTopbar does not render authenticated user/profile identity copy', async () => {
    const zenTopbar = await source(ZEN_TOPBAR_TS);

    expect(zenTopbar).not.toMatch(/userDisplayName\s*=\s*computed/);
    expect(zenTopbar).not.toMatch(/userInitials\s*=\s*computed/);
    expect(zenTopbar).not.toMatch(/businessFacade\.settings\(\)[\s\S]*firstName[\s\S]*lastName/);
    expect(zenTopbar).not.toMatch(/authService\.user\(\)[\s\S]*nombre[\s\S]*apellido/);
    expect(zenTopbar).not.toMatch(/['"]Usuario['"]/);
  });

  it('ZenSidebar exposes a stable logout testid and routes the click through onLogout confirmation', async () => {
    const sidebarTs = await source(SIDEBAR_TS);
    const sidebarHtml = await source(SIDEBAR_HTML);
    const zenSidebar = await source(ZEN_SIDEBAR_TS);

    expect(sidebarTs).toMatch(/@Output\(\)\s+logoutConfirm\s*=\s*new\s+EventEmitter<void>\(\)/);
    expect(sidebarTs).toMatch(/onLogout:\s*\(\)\s*=>\s*this\.openLogoutConfirmModal\(\)/);
    expect(sidebarHtml).toMatch(/data-testid=["']logout-confirm-action["'][\s\S]*\(click\)=["']confirmLogout\(\)["']/);
    expect(zenSidebar).toMatch(/@Input\(\)\s+onLogout\s*:/);
    expect(zenSidebar).toMatch(/data-testid=["']dashboard-sidebar-logout-action["']/);
    expect(zenSidebar).toMatch(/\(click\)=["']onLogout\(\)["']/);
  });
});
