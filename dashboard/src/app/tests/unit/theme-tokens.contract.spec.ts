import { describe, expect, it } from 'vitest';

type ThemeName = 'industrial' | 'zen' | 'chic' | 'ink';

type SemanticThemeTokens = {
  bg?: string;
  primary?: string;
  accent?: string;
  surface?: string;
  text?: string;
  onPrimary?: string;
  focusRing?: string;
  '--bg'?: string;
  '--primary'?: string;
  '--accent'?: string;
  '--surface'?: string;
  '--text'?: string;
  '--on-primary'?: string;
  '--focus-ring'?: string;
};

type ThemeTokenMap = Record<ThemeName, SemanticThemeTokens>;

const REQUIRED_THEMES: ThemeName[] = ['industrial', 'zen', 'chic', 'ink'];

const REQUIRED_HEX = {
  industrial: { bg: '#0F0F0F', primary: '#C6C6C7', accent: '#B8860B' },
  zen: { bg: '#F2F4F3', primary: '#8BA888', accent: '#D9C5B2' },
  chic: { bg: '#FBFAFB', primary: '#E8B4B8', accent: '#D4C1EC' },
  ink: { bg: '#050505', primary: '#A10000', accent: '#DAA520' }
} as const;

async function loadThemeTokenMap(): Promise<ThemeTokenMap> {
  const module = await import('../../core/theming/theme.tokens');
  const tokens =
    (module.DASHBOARD_THEME_TOKENS as ThemeTokenMap | undefined) ??
    (module.themeTokens as ThemeTokenMap | undefined);

  if (!tokens) {
    throw new Error(
      'Missing DASHBOARD_THEME_TOKENS export in src/app/core/theming/theme.tokens.ts'
    );
  }

  return tokens;
}

function getToken(themeTokens: SemanticThemeTokens, semanticName: 'bg' | 'primary' | 'accent' | 'surface' | 'text' | 'onPrimary' | 'focusRing'): string | undefined {
  if (semanticName === 'onPrimary') {
    return themeTokens.onPrimary ?? themeTokens['--on-primary'];
  }

  if (semanticName === 'focusRing') {
    return themeTokens.focusRing ?? themeTokens['--focus-ring'];
  }

  return themeTokens[semanticName] ?? themeTokens[`--${semanticName}` as '--bg' | '--primary' | '--accent' | '--surface' | '--text'];
}

function normalizeHex(value: string | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

describe('Theme tokens contract (TDD red phase)', () => {
  it('defines 4 dashboard themes with required names', async () => {
    const tokens = await loadThemeTokenMap();

    expect(Object.keys(tokens).sort()).toEqual(REQUIRED_THEMES.sort());
  });

  it('maps exact required hex values for bg/primary/accent', async () => {
    const tokens = await loadThemeTokenMap();

    for (const themeName of REQUIRED_THEMES) {
      const themeTokens = tokens[themeName];

      expect(normalizeHex(getToken(themeTokens, 'bg'))).toBe(
        REQUIRED_HEX[themeName].bg
      );
      expect(normalizeHex(getToken(themeTokens, 'primary'))).toBe(
        REQUIRED_HEX[themeName].primary
      );
      expect(normalizeHex(getToken(themeTokens, 'accent'))).toBe(
        REQUIRED_HEX[themeName].accent
      );
    }
  });

  it('requires semantic accessibility tokens for implementation', async () => {
    const tokens = await loadThemeTokenMap();

    for (const themeName of REQUIRED_THEMES) {
      const themeTokens = tokens[themeName];

      expect(getToken(themeTokens, 'surface')).toBeTruthy();
      expect(getToken(themeTokens, 'text')).toBeTruthy();
      expect(getToken(themeTokens, 'onPrimary')).toBeTruthy();
      expect(getToken(themeTokens, 'focusRing')).toBeTruthy();
    }
  });
});
