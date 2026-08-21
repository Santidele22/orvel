import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const TURNOS_HTML = 'src/app/features/booking/pages/turnos-list.page.html';
const STATUS_BADGE_TS = 'src/app/shared/components/status-badge/status-badge.component.ts';

const REQUIRED_TEMPLATE_MARKERS = ['isZen'] as const;
const REQUIRED_SEMANTIC_TOKEN_KEYS = [
  'background',
  'surface',
  'primary',
  'secondary',
  'accent',
  'text',
  'success',
  'warning',
  'danger'
] as const;
const REQUIRED_CANONICAL_STATUSES = ['confirmed', 'pending', 'in_progress', 'completed'] as const;

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

async function loadThemeTokens(): Promise<Record<string, Record<string, unknown>>> {
  const module = await import('../../core/theming/theme.tokens');
  const tokens = module.DASHBOARD_THEME_TOKENS as Record<string, Record<string, unknown>> | undefined;

  if (!tokens) {
    throw new Error('Missing DASHBOARD_THEME_TOKENS export in src/app/core/theming/theme.tokens.ts');
  }

  return tokens;
}

describe('DESIGN.md normalization contract: dashboard templates', () => {
  it('keeps common structure evidence for sidebar/main_agenda/right_panel', async () => {
    const [shellHtml, turnosHtml] = await Promise.all([
      readFile(fromRoot(SHELL_HTML), 'utf-8'),
      readFile(fromRoot(TURNOS_HTML), 'utf-8')
    ]);

    // Sidebar contract evidence (shell-level shared layout)
    expect(shellHtml).toContain('data-testid="sidebar"');
    expect(shellHtml).toContain('<main');

    // Template contract evidence: zen marker remains
    for (const marker of REQUIRED_TEMPLATE_MARKERS) {
      expect(turnosHtml).toContain(marker);
    }

    // main_agenda / right_panel evidence through two-column dashboard layout
    const mainAgendaColumns = (turnosHtml.match(/col-span-8/g) ?? []).length;
    const rightPanelColumns = (turnosHtml.match(/col-span-4/g) ?? []).length;

    expect(mainAgendaColumns).toBeGreaterThanOrEqual(1);
    expect(rightPanelColumns).toBeGreaterThanOrEqual(1);
  });

  it('requires semantic token keys in DASHBOARD_THEME_TOKENS', async () => {
    const themeTokensMap = await loadThemeTokens();

    for (const [theme, tokens] of Object.entries(themeTokensMap)) {
      const missingKeys = REQUIRED_SEMANTIC_TOKEN_KEYS.filter((key) => {
        const value = tokens[key];
        return typeof value !== 'string' || value.trim().length === 0;
      });

      expect(missingKeys, `Theme "${theme}" missing semantic token keys`).toEqual([]);
    }
  });

  it('requires canonical status handling availability (confirmed/pending/in_progress/completed)', async () => {
    const statusBadgeSource = await readFile(fromRoot(STATUS_BADGE_TS), 'utf-8');

    const missingCanonicalStatuses = REQUIRED_CANONICAL_STATUSES.filter((status) => {
      return !statusBadgeSource.toLowerCase().includes(status.toLowerCase());
    });

    expect(missingCanonicalStatuses, 'Missing canonical statuses in status handling layer').toEqual([]);
  });

  it('keeps zen as the only declared dashboard theme token map key', async () => {
    const themeTokensMap = await loadThemeTokens();
    expect(Object.keys(themeTokensMap)).toEqual(['zen']);
  });
});
