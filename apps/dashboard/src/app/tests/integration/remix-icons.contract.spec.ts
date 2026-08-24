import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const PACKAGE_JSON = 'package.json';
const ANGULAR_JSON = 'angular.json';
const GLOBAL_STYLES = 'src/styles.scss';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const TURNOS_HTML = 'src/app/features/booking/pages/turnos-list.page.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function parseHtml(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document;
}

function hasRemixClass(element: Element | null): boolean {
  if (!element) return false;

  if (Array.from(element.classList).some((className) => className.startsWith('ri-'))) {
    return true;
  }

  return Array.from(element.querySelectorAll('[class]')).some((node) =>
    Array.from(node.classList).some((className) => className.startsWith('ri-'))
  );
}

describe('TDD contract: Remix Icons adoption in dashboard', () => {
  it('integrates Remix Icon package and stylesheet in build inputs', async () => {
    const packageJsonRaw = await readFile(fromRoot(PACKAGE_JSON), 'utf-8');
    const angularJsonRaw = await readFile(fromRoot(ANGULAR_JSON), 'utf-8');
    const stylesRaw = await readFile(fromRoot(GLOBAL_STYLES), 'utf-8');

    const packageJson = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const angularJson = JSON.parse(angularJsonRaw) as {
      projects?: Record<string, { architect?: { build?: { options?: { styles?: string[] } } } }>;
    };

    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    expect(deps.remixicon).toBeDefined();

    const buildStyles = angularJson.projects?.['salon-de-belleza']?.architect?.build?.options?.styles ?? [];
    const remixFromBuild = buildStyles.some((entry) => /remixicon/i.test(entry));
    const remixFromStylesFile = /@(?:import|use)\s+['"](?:~)?remixicon\//i.test(stylesRaw);

    expect(remixFromBuild || remixFromStylesFile).toBe(true);
  });

  it('keeps remix icons in critical navigation and notification touchpoints', async () => {
    const sidebar = parseHtml(await readFile(fromRoot(SIDEBAR_HTML), 'utf-8'));
    const topbar = parseHtml(await readFile(fromRoot(TOPBAR_HTML), 'utf-8'));
    const shell = parseHtml(await readFile(fromRoot(SHELL_HTML), 'utf-8'));

    const sidebarLinks = Array.from(sidebar.querySelectorAll('a[routerLink]'));
    expect(sidebarLinks.length).toBeGreaterThanOrEqual(4);
    expect(sidebarLinks.every((link) => hasRemixClass(link))).toBe(true);

    const notificationButtons = Array.from(topbar.querySelectorAll('[data-testid="dashboard-topbar-notifications"]'));
    expect(notificationButtons.length).toBeGreaterThanOrEqual(4);
    expect(
      notificationButtons.every((button) => (button.getAttribute('aria-label') ?? '').trim().length > 0)
    ).toBe(true);
    expect(notificationButtons.every((button) => hasRemixClass(button))).toBe(true);

    expect(shell.querySelector('[data-testid="dashboard-shell-global-action"]')).toBeNull();
  });

  it('keeps turnos admin actions as labeled controls (not glyph-only buttons)', async () => {
    const turnos = parseHtml(await readFile(fromRoot(TURNOS_HTML), 'utf-8'));
    const actionControls = [
      ...Array.from(turnos.querySelectorAll('[data-testid="turno-admin-cancel-action"]')),
      ...Array.from(turnos.querySelectorAll('[data-testid="turno-admin-reschedule-action"]'))
    ];

    expect(actionControls.length).toBeGreaterThan(0);

    for (const control of actionControls) {
      expect(control.tagName.toLowerCase()).toBe('button');
      expect(control.textContent?.trim()).not.toMatch(/^[✓▶✎✕+]$/);
      expect((control.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });
});
