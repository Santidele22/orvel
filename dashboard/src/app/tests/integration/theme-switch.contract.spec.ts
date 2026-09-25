// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

type ThemeName = 'industrial' | 'zen' | 'chic' | 'ink';

const EXPECTED_HEX = {
  industrial: { bg: '#0F0F0F', primary: '#C6C6C7', accent: '#B8860B' },
  zen: { bg: '#F2F4F3', primary: '#8BA888', accent: '#D9C5B2' },
  chic: { bg: '#FBFAFB', primary: '#E8B4B8', accent: '#D4C1EC' },
  ink: { bg: '#050505', primary: '#A10000', accent: '#DAA520' }
} as const;

type ApplyThemeFn = (host: HTMLElement, theme: ThemeName) => void;

async function loadApplyThemeFn(): Promise<ApplyThemeFn> {
  const module = await import('../../core/theming/theme-runtime');
  const applyTheme =
    (module.applyDashboardTheme as ApplyThemeFn | undefined) ??
    (module.applyTheme as ApplyThemeFn | undefined);

  if (!applyTheme) {
    throw new Error(
      'Missing applyDashboardTheme(host, theme) in src/app/core/theming/theme-runtime.ts'
    );
  }

  return applyTheme;
}

function normalizeHex(value: string): string {
  return value.trim().toUpperCase();
}

describe('Theme switch integration contract (TDD red phase)', () => {
  let shell: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <section id="dashboard-shell" data-testid="dashboard-shell">
        <aside data-testid="sidebar"></aside>
        <header data-testid="topbar"></header>
        <main data-testid="content"><article>slot</article></main>
      </section>
    `;

    shell = document.querySelector('#dashboard-shell') as HTMLElement;
  });

  it('applies data-theme and css vars for every template', async () => {
    const applyTheme = await loadApplyThemeFn();

    const themes: ThemeName[] = ['industrial', 'zen', 'chic', 'ink'];

    for (const theme of themes) {
      applyTheme(shell, theme);

      expect(shell.dataset['theme']).toBe(theme);
      expect(normalizeHex(shell.style.getPropertyValue('--bg'))).toBe(
        EXPECTED_HEX[theme].bg
      );
      expect(normalizeHex(shell.style.getPropertyValue('--primary'))).toBe(
        EXPECTED_HEX[theme].primary
      );
      expect(normalizeHex(shell.style.getPropertyValue('--accent'))).toBe(
        EXPECTED_HEX[theme].accent
      );
    }
  });

  it('preserves shell structure when switching theme', async () => {
    const applyTheme = await loadApplyThemeFn();
    const structureBefore = shell.innerHTML;

    applyTheme(shell, 'industrial');
    applyTheme(shell, 'ink');

    expect(shell.innerHTML).toBe(structureBefore);
    expect(shell.querySelector('[data-testid="sidebar"]')).not.toBeNull();
    expect(shell.querySelector('[data-testid="topbar"]')).not.toBeNull();
    expect(shell.querySelector('[data-testid="content"]')).not.toBeNull();
  });
});
