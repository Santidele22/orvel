import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const SHELL_TS = 'src/app/shared/dashboard-shell/dashboard-shell.component.ts';
const ROUTES_TS = 'src/app/app.routes.ts';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const ZEN_TOPBAR_TS = 'src/app/shared/dashboard-topbar/templates/zen-topbar.component.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function parseHtml(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('Mobile shell: bottom nav integration', () => {
  it('renders app-mobile-bottom-nav inside shell', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('app-mobile-bottom-nav');
  });

  it('imports MobileBottomNavComponent', async () => {
    const source = await readFile(fromRoot(SHELL_TS), 'utf-8');
    expect(source).toContain('MobileBottomNavComponent');
    expect(source).toContain('MobileBottomNavComponent');
  });

  it('adds pb-16 to main for bottom nav clearance', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('pb-16');
  });

  it('has lg:pb-0 to reset padding on desktop', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('lg:pb-0');
  });
});

describe('Mobile shell: FAB activation', () => {
  it('does not render a floating + action over the bottom nav', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).not.toContain('data-testid="dashboard-shell-global-action"');
    expect(html).not.toContain('ri-add-line');
  });
});

describe('Mobile shell: notificaciones and perfil routes', () => {
  it('shows an empty-state icon on the notifications page', async () => {
    const source = await readFile(fromRoot('src/app/features/notificaciones/pages/notificaciones.page.ts'), 'utf-8');
    expect(source).toContain('data-testid="notificaciones-empty-state"');
    expect(source).toContain('ri-notification-off-line');
  });

  it('adds notificaciones route', async () => {
    const routes = await readFile(fromRoot(ROUTES_TS), 'utf-8');
    expect(routes).toContain('notificaciones');
  });

  it('adds perfil route', async () => {
    const routes = await readFile(fromRoot(ROUTES_TS), 'utf-8');
    expect(routes).toContain('perfil');
  });
});

describe('Mobile shell: hide desktop topbar below lg', () => {
  it('wraps topbar with hidden lg:block without hiding the host tag', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    const hostIndex = html.indexOf('<app-dashboard-topbar');
    const topbarIndex = html.indexOf('data-testid="topbar"');
    const hostMatch = html.match(/<app-dashboard-topbar\b[^>]*>/);
    const preceding = html.slice(Math.max(0, hostIndex - 240), hostIndex);

    expect(hostIndex).toBeGreaterThan(-1);
    expect(topbarIndex).toBeGreaterThan(hostIndex);
    expect(preceding).toMatch(/<div[^>]*class=["'][^"']*\bhidden lg:block\b/);
    expect(preceding.indexOf('hidden lg:block')).toBeGreaterThan(-1);
    expect(preceding.indexOf('hidden lg:block')).toBeLessThan(preceding.length);
    expect(hostMatch?.[0]).toContain('class="z-40 shrink-0"');
    expect(hostMatch?.[0]).not.toMatch(/\bhidden\b|\*ngIf/);
  });

  it('wraps sidebar with hidden lg:block without hiding the host tag', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    const sidebarHookIndex = html.indexOf('data-testid="sidebar"');
    const hostIndex = html.indexOf('<app-dashboard-sidebar');
    const hostMatch = html.match(/<app-dashboard-sidebar\b[^>]*>/);
    const preceding = html.slice(Math.max(0, sidebarHookIndex - 280), sidebarHookIndex);

    expect(sidebarHookIndex).toBeGreaterThan(-1);
    expect(hostIndex).toBeGreaterThan(-1);
    expect(hostIndex).toBeLessThan(sidebarHookIndex);
    expect(preceding).toMatch(/<div[^>]*class=["'][^"']*\bhidden lg:block\b/);
    expect(preceding.indexOf('hidden lg:block')).toBeGreaterThan(-1);
    expect(hostMatch?.[0]).not.toMatch(/\bhidden\b|\*ngIf/);
  });

  it('gates topbar wrappers and Zen header at hidden lg:block', async () => {
    const [topbarHtml, zenTopbar] = await Promise.all([
      readFile(fromRoot(TOPBAR_HTML), 'utf-8'),
      readFile(fromRoot(ZEN_TOPBAR_TS), 'utf-8')
    ]);

    expect(topbarHtml).toMatch(/class=["'][^"']*\bhidden lg:block\b/);
    expect(topbarHtml).toMatch(/dashboard-topbar-contract[^"']*\bhidden lg:block\b|\bhidden lg:block\b[^"']*dashboard-topbar-contract/);
    expect(zenTopbar).toMatch(/<header[^>]*\bhidden lg:flex\b/);
  });
});
