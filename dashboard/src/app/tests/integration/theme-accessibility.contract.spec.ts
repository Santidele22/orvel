import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type ThemeName = 'industrial' | 'zen' | 'chic' | 'ink';

type ThemeTokens = {
  bg?: string;
  primary?: string;
  focusRing?: string;
  onPrimary?: string;
  '--bg'?: string;
  '--primary'?: string;
  '--focus-ring'?: string;
  '--on-primary'?: string;
};

type ThemeMap = Record<ThemeName, ThemeTokens>;

const INTERACTIVE_TEMPLATE_FILES = [
  'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html',
  'src/app/shared/dashboard-topbar/dashboard-topbar.component.html',
  'src/app/features/booking/pages/turnos-list.page.html'
];

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function extractToken(theme: ThemeTokens, tokenName: 'bg' | 'primary' | 'focusRing' | 'onPrimary'): string {
  if (tokenName === 'focusRing') {
    return (theme.focusRing ?? theme['--focus-ring'] ?? '').trim();
  }

  if (tokenName === 'onPrimary') {
    return (theme.onPrimary ?? theme['--on-primary'] ?? '').trim();
  }

  return (theme[tokenName] ?? theme[`--${tokenName}` as '--bg' | '--primary'] ?? '').trim();
}

function parseHexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '').trim();
  if (normalized.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function luminanceChannel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(colorA: string, colorB: string): number {
  const [r1, g1, b1] = parseHexToRgb(colorA);
  const [r2, g2, b2] = parseHexToRgb(colorB);

  const l1 =
    0.2126 * luminanceChannel(r1) +
    0.7152 * luminanceChannel(g1) +
    0.0722 * luminanceChannel(b1);

  const l2 =
    0.2126 * luminanceChannel(r2) +
    0.7152 * luminanceChannel(g2) +
    0.0722 * luminanceChannel(b2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

async function loadThemeMap(): Promise<ThemeMap> {
  const module = await import('../../core/theming/theme.tokens');
  const tokens =
    (module.DASHBOARD_THEME_TOKENS as ThemeMap | undefined) ??
    (module.themeTokens as ThemeMap | undefined);

  if (!tokens) {
    throw new Error(
      'Missing DASHBOARD_THEME_TOKENS export in src/app/core/theming/theme.tokens.ts'
    );
  }

  return tokens;
}

describe('Theme + a11y contract (product aligned)', () => {
  it('critical interactive templates include focus-visible affordances', async () => {
    for (const relativeFile of INTERACTIVE_TEMPLATE_FILES) {
      const fileContents = await readFile(fromRoot(relativeFile), 'utf-8');
      expect(fileContents).toMatch(/focus-visible:/);
    }
  });

  it('turnos template keeps live-region semantics for loading/empty/error states', async () => {
    const turnosHtml = await readFile(fromRoot('src/app/features/booking/pages/turnos-list.page.html'), 'utf-8');

    expect(turnosHtml).toContain('data-testid="turnos-loading-state"');
    expect(turnosHtml).toContain('data-testid="turnos-empty-state"');
    expect(turnosHtml).toContain('data-testid="turnos-error-state"');
    expect(turnosHtml).toContain('role="status"');
    expect(turnosHtml).toContain('role="alert"');
    expect(turnosHtml).toContain('aria-live="polite"');
  });

  it('focus ring and primary text contrast are accessible on critical elements', async () => {
    const tokens = await loadThemeMap();

    for (const themeName of Object.keys(tokens) as ThemeName[]) {
      const theme = tokens[themeName];
      const bg = extractToken(theme, 'bg');
      const focusRing = extractToken(theme, 'focusRing');
      const primary = extractToken(theme, 'primary');
      const onPrimary = extractToken(theme, 'onPrimary');

      expect(contrastRatio(focusRing, bg)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(onPrimary, primary)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
