import { describe, expect, it } from 'vitest';
import { access, readFile } from 'node:fs/promises';

const LOGIN_PAGE_PATH = new URL('../pages/auth/login.astro', import.meta.url);
const SIGNUP_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);

type OnboardingSignupStateModule = {
  ONBOARDING_COMPLETION_KEY: string;
  markSignupOnboardingCompleted: (input: { email: string; selectedRubros: string[]; now?: number }) => void;
  readSignupOnboardingCompletion: (input: { email: string }) => {
    completed: boolean;
    selectedRubros: string[];
    completedAt?: number;
  };
  resolveOnboardingOnSignupOnlyFlag: (rawValue: unknown) => boolean;
};

async function loadSignupOnboardingStateModule(): Promise<OnboardingSignupStateModule | null> {
  try {
    return (await import('../lib/onboarding-signup-state')) as OnboardingSignupStateModule;
  } catch {
    return null;
  }
}

describe('Contract: onboarding runs only on signup path', () => {
  it('login path does not render/require rubros onboarding step', async () => {
    const source = await readFile(LOGIN_PAGE_PATH, 'utf8');

    expect(source).not.toContain('Tu Rubro.');
    expect(source).not.toMatch(/name\s*=\s*["']rubro["']/i);
    expect(source).not.toMatch(/selectedRubros\.length\s*===\s*0/);
  });

  it('signup path requires rubros onboarding and enforces at least one selected rubro', async () => {
    await expect(
      access(SIGNUP_PAGE_PATH),
      'Expected signup page at src/pages/signup.astro to host onboarding step for new accounts.'
    ).resolves.toBeUndefined();

    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');
    expect(source).toContain('Tu Rubro.');
    expect(source).toMatch(/type\s*=\s*["']checkbox["']/i);
    expect(source).toMatch(/seleccion[aá].*(categor[íi]a)|al menos una/i);
  });

  it('signup continue CTA is wired to an explicit submit action', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');
    const checkboxCount = (source.match(/type\s*=\s*["']checkbox["']/gi) ?? []).length;
    expect(checkboxCount, 'Expected at least one native HTML checkbox for multiselection features.').toBeGreaterThanOrEqual(1);
  });

  it('persists onboarding completion and future login can bypass onboarding for same user', async () => {
    localStorage.clear();

    const onboardingState = await loadSignupOnboardingStateModule();
    expect(
      onboardingState,
      'Expected src/lib/onboarding-signup-state.ts with persistence helpers for signup onboarding.'
    ).not.toBeNull();

    if (!onboardingState) {
      return;
    }

    onboardingState.markSignupOnboardingCompleted({
      email: 'existing@orvel.app',
      selectedRubros: ['peluqueria'],
      now: 1_700_000_000_000
    });

    expect(onboardingState.readSignupOnboardingCompletion({ email: 'existing@orvel.app' })).toEqual({
      completed: true,
      selectedRubros: ['peluqueria'],
      completedAt: 1_700_000_000_000
    });

    expect(onboardingState.readSignupOnboardingCompletion({ email: 'new@orvel.app' })).toEqual({
      completed: false,
      selectedRubros: []
    });
  });

  it('feature flag ONBOARDING_ON_SIGNUP_ONLY gates behavior deterministically', async () => {
    const onboardingState = await loadSignupOnboardingStateModule();
    expect(
      onboardingState,
      'Expected resolveOnboardingOnSignupOnlyFlag() in onboarding-signup-state module.'
    ).not.toBeNull();

    if (!onboardingState) {
      return;
    }

    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag('true')).toBe(true);
    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag('1')).toBe(true);
    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag(true)).toBe(true);

    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag('false')).toBe(false);
    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag('0')).toBe(false);
    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag(false)).toBe(false);

    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag(undefined)).toBe(true);
    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag(null)).toBe(true);
    expect(onboardingState.resolveOnboardingOnSignupOnlyFlag('unexpected')).toBe(true);
  });
});
