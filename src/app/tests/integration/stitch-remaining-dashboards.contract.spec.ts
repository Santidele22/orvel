import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const TURNOS_HTML = 'src/app/features/booking/pages/turnos-list.page.html';
const TOKENS_TS = 'src/app/core/theming/theme.tokens.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Dashboard contract: cross-theme structure (product aligned)', () => {
  it('keeps shell composition stable for sidebar/topbar/content/fab flow', async () => {
    const shellHtml = await readFile(fromRoot(SHELL_HTML), 'utf-8');

    expect(shellHtml).toContain('data-testid="dashboard-shell-responsive-root"');
    expect(shellHtml).toContain('<app-dashboard-sidebar');
    expect(shellHtml).toContain('<app-dashboard-topbar');
    expect(shellHtml).toContain('<router-outlet');
    expect(shellHtml).toContain('data-testid="dashboard-shell-global-action"');
    expect(shellHtml).toContain('aria-label="Crear nuevo registro"');
  });

  it('keeps four themed dashboard variants declared in topbar and turnos templates', async () => {
    const [topbarHtml, turnosHtml] = await Promise.all([
      readFile(fromRoot(TOPBAR_HTML), 'utf-8'),
      readFile(fromRoot(TURNOS_HTML), 'utf-8')
    ]);

    const themeMarkers = ['isZen', 'isIndustrial', 'isChic', 'isInk'];

    for (const marker of themeMarkers) {
      expect(topbarHtml).toContain(marker);
      expect(turnosHtml).toContain(marker);
    }

    expect((topbarHtml.match(/data-testid="dashboard-topbar-responsive"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('keeps strict token sets for industrial/chic/ink without cross-mixing token values', async () => {
    const tokensSource = await readFile(fromRoot(TOKENS_TS), 'utf-8');

    const expectedTriples: Record<'industrial' | 'chic' | 'ink', [string, string, string]> = {
      industrial: ['#0F0F0F', '#C6C6C7', '#B8860B'],
      chic: ['#FBFAFB', '#E8B4B8', '#D4C1EC'],
      ink: ['#050505', '#A10000', '#DAA520']
    };

    for (const [theme, [bg, primary, accent]] of Object.entries(expectedTriples)) {
      const blockMatch = tokensSource.match(new RegExp(`${theme}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
      expect(blockMatch, `Missing token block for theme ${theme}`).not.toBeNull();

      const block = blockMatch?.[1] ?? '';
      expect(block).toContain(`bg: '${bg}'`);
      expect(block).toContain(`primary: '${primary}'`);
      expect(block).toContain(`accent: '${accent}'`);

      for (const [otherTheme, [otherBg, otherPrimary, otherAccent]] of Object.entries(expectedTriples)) {
        if (otherTheme === theme) continue;

        expect(block).not.toContain(`bg: '${otherBg}'`);
        expect(block).not.toContain(`primary: '${otherPrimary}'`);
        expect(block).not.toContain(`accent: '${otherAccent}'`);
      }
    }
  });
});
