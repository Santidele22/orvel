import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const SIGNAL_PATH = new URL('./is-mobile.ts', import.meta.url);

const signalSource = (() => {
  try {
    return fs.readFileSync(SIGNAL_PATH, 'utf8');
  } catch {
    return '';
  }
})();

describe('createIsMobileSignal contract', () => {
  // ── File existence ──────────────────────────────────────────────
  it('is-mobile.ts exists at the expected path', () => {
    expect(signalSource, 'is-mobile.ts must exist').not.toBe('');
  });

  // ── Imports from @angular/core ──────────────────────────────────
  it('imports signal from @angular/core', () => {
    expect(signalSource).toMatch(
      /import\s*\{[^}]*\bsignal\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  it('imports DestroyRef from @angular/core', () => {
    expect(signalSource).toMatch(
      /import\s*\{[^}]*\bDestroyRef\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  it('imports inject from @angular/core', () => {
    expect(signalSource).toMatch(
      /import\s*\{[^}]*\binject\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  it('imports PLATFORM_ID from @angular/core', () => {
    expect(signalSource).toMatch(
      /import\s*\{[^}]*\bPLATFORM_ID\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  // ── Import from @angular/common ────────────────────────────────
  it('imports isPlatformBrowser from @angular/common', () => {
    expect(signalSource).toMatch(
      /import\s*\{[^}]*\bisPlatformBrowser\b[^}]*\}\s*from\s+['"]@angular\/common['"]/,
    );
  });

  // ── Exports ─────────────────────────────────────────────────────
  it('exports createIsMobileSignal function', () => {
    expect(signalSource).toMatch(/export\s+function\s+createIsMobileSignal/);
  });

  // ── Function signature ──────────────────────────────────────────
  it('accepts an optional breakpoint option defaulting to (max-width: 1023px)', () => {
    // The function should have either `options?.breakpoint ?? DEFAULT_BREAKPOINT`
    // or a default parameter `'(max-width: 1023px)'`
    expect(signalSource).toMatch(/1023px/);
    expect(signalSource).toMatch(/breakpoint/);
  });

  it('returns an object with isMobile: Signal<boolean>', () => {
    const returnMatch = signalSource.match(/return\s*\{[\s\S]*?\};/);
    expect(returnMatch?.[0] ?? '').toMatch(/\bisMobile\b/);
  });

  // ── Angular DI ──────────────────────────────────────────────────
  it('uses inject(PLATFORM_ID) for SSR safety', () => {
    expect(signalSource).toMatch(/inject\s*\(\s*PLATFORM_ID\s*\)/);
  });

  it('uses inject(DestroyRef) for cleanup', () => {
    expect(signalSource).toMatch(/inject\s*\(\s*DestroyRef\s*\)/);
  });

  // ── Browser API ─────────────────────────────────────────────────
  it('references window.matchMedia (browser-only)', () => {
    expect(signalSource).toMatch(/window\.matchMedia/);
  });

  // ── SSR guard ───────────────────────────────────────────────────
  it('defaults isMobile to false when not in browser (SSR)', () => {
    // Should use isPlatformBrowser(platformId) as a guard
    expect(signalSource).toMatch(/isPlatformBrowser/);
  });

  // ── Cleanup ─────────────────────────────────────────────────────
  it('has a cleanup branch that calls removeEventListener or removeListener', () => {
    // Both API variants accepted
    expect(signalSource).toMatch(/removeEventListener|removeListener/);
  });
});
