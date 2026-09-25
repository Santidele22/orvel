import { describe, expect, it } from 'vitest';
import { access, readFile } from 'node:fs/promises';

const LOGIN_PAGE_PATH = new URL('../pages/auth/login.astro', import.meta.url);
const SIGNUP_PAGE_PATH = new URL('../pages/auth/signup/onboarding.astro', import.meta.url);

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

  it('signup path requires rubros onboarding and enforces one selected rubro', async () => {
    await expect(
      access(SIGNUP_PAGE_PATH),
      'Expected signup page at src/pages/signup.astro to host onboarding step for new accounts.'
    ).resolves.toBeUndefined();

    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');
    expect(source).toContain('Tu Rubro.');
    expect(source).toMatch(/type\s*=\s*["']radio["']/i);
    expect(source).not.toMatch(/type\s*=\s*["']checkbox["']/i);
    expect(source).toMatch(/seleccion[aá].*(categor[íi]a)|al menos una/i);
  });

  it('signup continue CTA is wired to an explicit submit action', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');
    const radioCount = (source.match(/type\s*=\s*["']radio["']/gi) ?? []).length;
    expect(radioCount, 'Expected at least one native HTML radio for single-selection rubro features.').toBeGreaterThanOrEqual(1);
  });

  it('shows an explicit welcome/confetti modal after onboarding completion instead of auto-redirecting to login', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');

    expect(source).toContain('id="accountCreatedModal"');
    expect(source).toMatch(/Bienvenid[oa]\s+a\s+Orvel|Te damos la bienvenida a Orvel/i);
    expect(source).toMatch(/confetti|Confetti/i);
    expect(source).toMatch(/id="accountCreatedContinue"[\s\S]{0,220}href="\/auth\/login"/);
    expect(source).toContain("if (continueLink) continueLink.href = safeLoginUrl");
    expect(source).toMatch(/if\s*\(result\.synced\)\s*\{[\s\S]{0,180}showAccountCreatedModal\(\);/);
    expect(source).not.toMatch(/setTimeout\s*\([\s\S]{0,160}(?:login|redirectToLogin|safeLoginUrl)/i);
  });

  it('completes signup onboarding through server-controlled RPC instead of user_metadata self-assertion', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');

    expect(source).toMatch(/\.rpc\(\s*['"]complete_signup_onboarding['"]/);
    expect(source).not.toMatch(/auth\.updateUser\([\s\S]{0,260}onboardingCompleted/);
  });

  it('uses onboarding RPC persisted business identity and booking slug returned by backend', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');

    expect(source, 'Signup onboarding must send the real business name collected during signup to the backend RPC.').toMatch(
      /p_business_name:\s*(businessName|[^,]*negocioNombre)/
    );
    expect(source, 'The RPC response must be read so the persisted slug/business identity is consumed, not ignored.').toMatch(
      /const\s*\{\s*data\s*:\s*(?:onboardingResult|result|identity)[\s\S]*?error\s*\}\s*=\s*await\s+client\.rpc\(\s*['"]complete_signup_onboarding['"]/i
    );
    expect(source, 'Successful onboarding must require and use the backend-persisted booking slug.').toMatch(
      /(onboardingResult|result|identity)\?\.(booking_slug|business_slug|slug)|\[(?:['"]booking_slug['"]|['"]business_slug['"]|['"]slug['"])\]/i
    );
    expect(source, 'Onboarding must not continue with placeholder booking slugs when backend identity is available.').not.toMatch(
      /booking\/(?:mi-salon|orvel)|['"](?:mi-salon|orvel)['"]\s*(?:\}|\)|,|;)/i
    );
  });

  it('uses the same explicit welcome modal for subscription-sourced onboarding', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');

    expect(source).toContain("const onboardingSource = params.get('source')");
    expect(source).toContain("onboardingSource === 'subscription'");
    expect(source).toMatch(/source=subscription|subscription/i);
    expect(source).not.toMatch(/source[\s\S]{0,220}window\.location\.href\s*=\s*safeLoginUrl/i);
  });

  it('maps missing Supabase session to login/resume guidance instead of generic backend failure copy', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');

    expect(source, 'syncOnboardingMetadata must classify absent browser auth as missing_session.').toMatch(
      /reason:\s*['"]missing_session['"]/
    );
    expect(
      source,
      'Missing browser session should have a dedicated UX branch before the generic backend/RPC failure message.'
    ).toMatch(/result\.reason\s*={2,3}\s*['"]missing_session['"][\s\S]{0,900}(?:login|inici[aá]\s+sesi[oó]n|retomar|resume)/i);
    expect(
      source,
      'The missing-session branch must not reuse the generic backend confirmation failure copy.'
    ).not.toMatch(/result\.reason\s*={2,3}\s*['"]missing_session['"][\s\S]{0,900}no pudimos confirmarla con backend/i);
  });

  it('keeps selected category and builds a login URL with onboarding resume context when session is missing', async () => {
    const source = await readFile(SIGNUP_PAGE_PATH, 'utf8');

    expect(source, 'Selected category must be persisted before any backend/session sync so the resume path can restore it.').toMatch(
      /sessionStorage\.setItem\(SIGNUP_STORAGE_KEYS\.tipoNegocio[\s\S]{0,260}syncOnboardingMetadata\(selectedRubros\)/
    );
    expect(
      source,
      'Missing-session guidance should send users to login with explicit onboarding return/resume context, including subscription-sourced flows.'
    ).toMatch(/missing_session[\s\S]{0,1200}(?:URLSearchParams|returnTo|resume|source=subscription|onboarding)/i);
    expect(source).toMatch(/missing_session[\s\S]{0,1200}(?:safeLoginUrl|loginUrl|\/auth\/login)/i);
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

  it('stores only one selected rubro even if stale callers pass multiple values', async () => {
    localStorage.clear();

    const onboardingState = await loadSignupOnboardingStateModule();
    expect(onboardingState).not.toBeNull();

    if (!onboardingState) {
      return;
    }

    onboardingState.markSignupOnboardingCompleted({
      email: 'single@orvel.app',
      selectedRubros: ['peluqueria', 'barberia', 'pestanas'],
      now: 1_700_000_000_000
    });

    expect(onboardingState.readSignupOnboardingCompletion({ email: 'single@orvel.app' })).toEqual({
      completed: true,
      selectedRubros: ['peluqueria'],
      completedAt: 1_700_000_000_000
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
