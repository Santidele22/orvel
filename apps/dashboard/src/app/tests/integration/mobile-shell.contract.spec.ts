import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const SHELL_TS = 'src/app/shared/dashboard-shell/dashboard-shell.component.ts';
const ROUTES_TS = 'src/app/app.routes.ts';

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
  it('FAB does NOT have opacity-0 pointer-events-none', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).not.toContain('opacity-0');
    expect(html).not.toContain('pointer-events-none');
  });

  it('FAB is hidden on lg breakpoint', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('lg:hidden');
  });

  it('FAB has click handler for navigation', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('(click)');
  });

  it('FAB navigates to /dashboard/turnos/new', async () => {
    const source = await readFile(fromRoot(SHELL_TS), 'utf-8');
    expect(source).toContain('/dashboard/turnos/new');
  });

  it('FAB has circular shape and primary color', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('rounded-full');
    expect(html).toContain('bg-primary');
    expect(html).toContain('text-white');
  });

  it('FAB is positioned above bottom nav with bottom-20', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('bottom-20');
  });

  it('keeps data-testid="dashboard-shell-global-action"', async () => {
    const html = await readFile(fromRoot(SHELL_HTML), 'utf-8');
    expect(html).toContain('data-testid="dashboard-shell-global-action"');
  });

  it('has navigateToNewTurno method in shell component', async () => {
    const source = await readFile(fromRoot(SHELL_TS), 'utf-8');
    expect(source).toContain('navigateToNewTurno');
  });
});

describe('Mobile shell: notificaciones and perfil routes', () => {
  it('adds notificaciones route', async () => {
    const routes = await readFile(fromRoot(ROUTES_TS), 'utf-8');
    expect(routes).toContain('notificaciones');
  });

  it('adds perfil route', async () => {
    const routes = await readFile(fromRoot(ROUTES_TS), 'utf-8');
    expect(routes).toContain('perfil');
  });
});
