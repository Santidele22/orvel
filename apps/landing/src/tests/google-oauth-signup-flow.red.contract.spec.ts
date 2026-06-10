/**
 * RED contracts for TYRION-BRUNO-OAUTH-FLOW-002.
 *
 * Exact bug reproduced by manual QA:
 * choose plan → Google → home page
 *
 * Required flow:
 * choose plan → Google → choose business type → account-created modal + welcome email
 * → login → dashboard only after persisted onboarding metadata.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  buildBusinessTypeCompletionRedirect,
  buildGoogleOAuthSignupRequest,
  completeOAuthBusinessTypeOnboarding,
  createBrowserOAuthSignupIntentStore,
  handleOAuthOnboardingCallback,
  OAuthOnboardingError,
  type OAuthSignupIntentStore
} from '../lib/oauth-signup-onboarding-flow';

const NOW = 1_778_016_000_000;
const ORIGIN = 'https://orvel.app';

function createIntentStore(overrides: Partial<OAuthSignupIntentStore> = {}): OAuthSignupIntentStore {
  return {
    create: vi.fn(async (intent) => ({
      id: 'signup-intent-growth-google',
      plan: intent.plan,
      provider: intent.provider,
      expiresAt: NOW + 5 * 60_000
    })),
    consume: vi.fn(async () => ({
      id: 'signup-intent-growth-google',
      plan: 'GROWTH',
      provider: 'google',
      expiresAt: NOW + 5 * 60_000
    })),
    ...overrides
  };
}

describe('RED Contract: Google OAuth signup onboarding flow', () => {
  it('preserves selected plan in a short-lived signup intent before Google OAuth and never callbacks to home', async () => {
    const intentStore = createIntentStore();

    const request = await buildGoogleOAuthSignupRequest({
      origin: ORIGIN,
      selectedPlan: 'GROWTH',
      intentStore,
      now: NOW
    });

    expect(intentStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'GROWTH',
        provider: 'google',
        expiresAt: expect.any(Number)
      })
    );
    expect(request.provider).toBe('google');
    expect(request.options.redirectTo).toMatch(/^https:\/\/orvel\.app\/auth\/oauth\/onboarding-callback\?/);
    expect(request.options.redirectTo).toContain('signup_intent=signup-intent-growth-google');
    expect(request.options.redirectTo).toContain('plan=GROWTH');
    expect(request.options.redirectTo).not.toMatch(/\/home(?:[/?#]|$)|^https:\/\/orvel\.app\/$/);
    expect(request.options.queryParams).toEqual(expect.objectContaining({ onboarding_required: 'true' }));
  });

  it('uses canonical fallback plan identifiers when public plans are unavailable', async () => {
    const intentStore = createIntentStore();

    const request = await buildGoogleOAuthSignupRequest({
      origin: ORIGIN,
      selectedPlan: 'STARTER',
      intentStore,
      now: NOW
    });

    expect(intentStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: 'STARTED',
        provider: 'google'
      })
    );
    expect(request.options.redirectTo).toContain('plan=STARTED');
  });

  it('OAuth onboarding callback consumes a free plan intent and routes incomplete onboarding to business type selection', async () => {
    const intentStore = createIntentStore({
      consume: vi.fn(async () => ({
        id: 'signup-intent-free-google',
        plan: 'FREE',
        provider: 'google',
        expiresAt: NOW + 5 * 60_000
      }))
    });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: {
        id: 'user-google-1',
        email: 'santi@orvel.app',
        user_metadata: { onboardingCompleted: false }
      }
    }));

    const result = await handleOAuthOnboardingCallback({
      url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-free-google&plan=FREE`,
      intentStore,
      exchangeCodeForSession,
      now: NOW
    });

    expect(intentStore.consume).toHaveBeenCalledWith('signup-intent-free-google', NOW);
    expect(exchangeCodeForSession).toHaveBeenCalledWith('oauth-code');
    expect(result.redirectTo).toMatch(/^\/auth\/signup\/business-type\?/);
    expect(result.redirectTo).toContain('plan=FREE');
    expect(result.redirectTo).toContain('signup_intent=signup-intent-free-google');
    expect(result.redirectTo).not.toContain('user_id=');
    expect(result.redirectTo).not.toContain('email=');
    expect(result.redirectTo).not.toMatch(/^\/home|^\/$|^\/dashboard/);
  });

  it('OAuth onboarding callback blocks paid signup intents before exchanging provider code', async () => {
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'should-not-be-created', email: 'paid@orvel.app' }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-growth-google&plan=GROWTH`,
        intentStore: createIntentStore(),
        exchangeCodeForSession,
        now: NOW
      })
    ).rejects.toMatchObject({
      name: 'OAuthOnboardingError',
      code: 'paid_oauth_signup_blocked'
    } satisfies Partial<OAuthOnboardingError>);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('OAuth onboarding callback still allows free signup intents to exchange provider code', async () => {
    const intentStore = createIntentStore({
      consume: vi.fn(async () => ({
        id: 'signup-intent-free-google',
        plan: 'FREE',
        provider: 'google',
        expiresAt: NOW + 5 * 60_000
      }))
    });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'user-free-google', email: 'free@orvel.app' }
    }));

    const result = await handleOAuthOnboardingCallback({
      url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-free-google&plan=FREE`,
      intentStore,
      exchangeCodeForSession,
      now: NOW
    });

    expect(exchangeCodeForSession).toHaveBeenCalledWith('oauth-code');
    expect(result.redirectTo).toContain('plan=FREE');
  });

  it('signup intent storage is short-lived and single-use before OAuth session exchange', async () => {
    const storage = new Map<string, string>();
    const intentStore = createBrowserOAuthSignupIntentStore({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      }
    });

    const created = await intentStore.create({
      plan: 'GROWTH',
      provider: 'google',
      expiresAt: NOW + 5 * 60_000
    });

    expect(created.expiresAt - NOW).toBeLessThanOrEqual(5 * 60_000);
    expect(await intentStore.consume(created.id, NOW + 60_000)).toEqual(created);
    expect(await intentStore.consume(created.id, NOW + 60_000)).toBeNull();

    const expired = await intentStore.create({
      plan: 'PRO',
      provider: 'google',
      expiresAt: NOW + 5 * 60_000
    });
    expect(await intentStore.consume(expired.id, NOW + 5 * 60_000 + 1)).toBeNull();
  });

  it('OAuth onboarding callback rejects missing or expired signup intent before exchanging provider code', async () => {
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'user-google-1', email: 'santi@orvel.app' }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code`,
        intentStore: createIntentStore(),
        exchangeCodeForSession,
        now: NOW
      })
    ).rejects.toThrow(/signup intent/i);

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=expired-intent`,
        intentStore: createIntentStore({ consume: vi.fn(async () => null) }),
        exchangeCodeForSession,
        now: NOW
      })
    ).rejects.toThrow(/missing|expired/i);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('diagnoses the credentials bounce branch with a safe missing-code error code', async () => {
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'user-google-1', email: 'santi@orvel.app' }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?signup_intent=signup-intent-growth-google&plan=GROWTH`,
        intentStore: createIntentStore(),
        exchangeCodeForSession,
        now: NOW
      })
    ).rejects.toMatchObject({
      name: 'OAuthOnboardingError',
      code: 'missing_provider_code'
    } satisfies Partial<OAuthOnboardingError>);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('OAuth onboarding callback rejects when browser intent storage is lost (no permissive recovery)', async () => {
    const intentStore = createIntentStore({ consume: vi.fn(async () => null) });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: {
        id: 'user-google-1',
        email: 'santi@orvel.app',
        user_metadata: { onboardingCompleted: false }
      }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-growth-google&plan=GROWTH`,
        intentStore,
        exchangeCodeForSession,
        now: NOW
      })
    ).rejects.toMatchObject({
      name: 'OAuthOnboardingError',
      code: 'missing_or_expired_intent'
    } satisfies Partial<OAuthOnboardingError>);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('OAuth onboarding callback rejects fallback plan when intent is missing', async () => {
    const intentStore = createIntentStore({ consume: vi.fn(async () => null) });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'user-google-1', email: 'santi@orvel.app' }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-growth-google`,
        intentStore,
        exchangeCodeForSession,
        fallbackPlan: 'growth',
        now: NOW
      })
    ).rejects.toMatchObject({
      name: 'OAuthOnboardingError',
      code: 'missing_or_expired_intent'
    } satisfies Partial<OAuthOnboardingError>);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('OAuth onboarding callback rejects inferred/default plan when intent is missing', async () => {
    const intentStore = createIntentStore({ consume: vi.fn(async () => null) });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'user-google-1', email: 'santi@orvel.app' }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-starter-google`,
        intentStore,
        exchangeCodeForSession,
        now: NOW
      })
    ).rejects.toMatchObject({
      name: 'OAuthOnboardingError',
      code: 'missing_or_expired_intent'
    } satisfies Partial<OAuthOnboardingError>);

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('OAuth onboarding callback rejects hash-session flow when intent is missing', async () => {
    const intentStore = createIntentStore({ consume: vi.fn(async () => null) });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: { id: 'should-not-use-code', email: 'code@orvel.app' }
    }));
    const getCurrentSessionUser = vi.fn(async () => ({
      user: { id: 'user-basic-google', email: 'santi@orvel.app' }
    }));

    await expect(
      handleOAuthOnboardingCallback({
        url: `${ORIGIN}/auth/oauth/onboarding-callback?signup_intent=signup-intent-basic-google&plan=BASIC#access_token=supabase-token`,
        intentStore,
        exchangeCodeForSession,
        getCurrentSessionUser,
        fallbackPlan: 'BASIC',
        now: NOW
      })
    ).rejects.toMatchObject({
      name: 'OAuthOnboardingError',
      code: 'missing_or_expired_intent'
    } satisfies Partial<OAuthOnboardingError>);

    expect(getCurrentSessionUser).not.toHaveBeenCalled();
  });

  it('valid free signup_intent callback forces business type selection even when stale Supabase metadata says onboarding is completed', async () => {
    const intentStore = createIntentStore({
      consume: vi.fn(async () => ({
        id: 'signup-intent-free-google',
        plan: 'FREE',
        provider: 'google',
        expiresAt: NOW + 5 * 60_000
      }))
    });
    const exchangeCodeForSession = vi.fn(async () => ({
      user: {
        id: 'user-google-1',
        email: 'santi@orvel.app',
        user_metadata: { onboardingCompleted: true, businessType: 'peluqueria' }
      }
    }));

    const result = await handleOAuthOnboardingCallback({
      url: `${ORIGIN}/auth/oauth/onboarding-callback?code=oauth-code&signup_intent=signup-intent-free-google&plan=FREE`,
      intentStore,
      exchangeCodeForSession,
      now: NOW
    });

    expect(result.redirectTo).toMatch(/^\/auth\/signup\/business-type\?/);
    expect(result.redirectTo).toContain('plan=FREE');
    expect(result.redirectTo).toContain('signup_intent=signup-intent-free-google');
    expect(result.redirectTo).toContain('oauth=google');
    expect(result.redirectTo).not.toMatch(/^\/auth\/login|^\/login|^\/dashboard|^\/home|^\/$/);
  });

  it('business type route preserves plan, signup_intent and oauth query params when redirecting to completion', () => {
    const result = buildBusinessTypeCompletionRedirect(
      `${ORIGIN}/auth/signup/business-type?plan=GROWTH&signup_intent=signup-intent-growth-google&oauth=google`
    );

    expect(result).toBe('/auth/signup/complete?plan=GROWTH&signup_intent=signup-intent-growth-google&oauth=google');
  });

  it('business type completion persists plan + businessType + onboardingCompleted before welcome email/modal', async () => {
    const events: string[] = [];
    const persistOnboarding = vi.fn(async (payload) => {
      events.push('persist');
      return { userId: payload.userId, email: 'santi@orvel.app' };
    });
    const sendWelcomeEmail = vi.fn(async () => {
      events.push('welcome-email');
    });

    const result = await completeOAuthBusinessTypeOnboarding({
      userId: 'user-google-1',
      email: 'santi@orvel.app',
      plan: 'GROWTH',
      businessType: 'peluqueria',
      persistOnboarding,
      sendWelcomeEmail
    });

    expect(persistOnboarding).toHaveBeenCalledWith({
      userId: 'user-google-1',
      plan: 'GROWTH',
      businessType: 'peluqueria',
      onboardingCompleted: true
    });
    expect(sendWelcomeEmail).toHaveBeenCalledWith({ email: 'santi@orvel.app', plan: 'GROWTH' });
    expect(events).toEqual(['persist', 'welcome-email']);
    expect(result.showAccountCreatedModal).toBe(true);
    expect(result.nextRoute).toMatch(/^\/login\?/);
    expect(result.nextRoute).not.toContain('email=');
    expect(result.nextRoute).not.toMatch(/^\/dashboard/);
  });

  it('welcome email is idempotent for the same OAuth signup completion', async () => {
    const deliveredKeys = new Set<string>();
    const deliverWelcomeEmail = vi.fn(async () => undefined);
    const sendWelcomeEmail = vi.fn(async (payload) => {
      const idempotencyKey = (payload as { idempotencyKey?: string }).idempotencyKey;
      if (!idempotencyKey) {
        throw new Error('welcome email requires an idempotency key');
      }

      if (!deliveredKeys.has(idempotencyKey)) {
        deliveredKeys.add(idempotencyKey);
        await deliverWelcomeEmail(payload);
      }
    });
    const persistOnboarding = vi.fn(async (payload) => ({
      userId: payload.userId,
      email: 'santi@orvel.app'
    }));

    const completion = {
      userId: 'user-google-1',
      email: 'santi@orvel.app',
      plan: 'GROWTH',
      businessType: 'peluqueria',
      persistOnboarding,
      sendWelcomeEmail
    };

    await completeOAuthBusinessTypeOnboarding(completion);
    await completeOAuthBusinessTypeOnboarding(completion);

    expect(sendWelcomeEmail).toHaveBeenCalledTimes(2);
    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'santi@orvel.app',
        plan: 'GROWTH',
        idempotencyKey: expect.stringContaining('user-google-1')
      })
    );
    expect(deliverWelcomeEmail).toHaveBeenCalledTimes(1);
  });

  it('does not show modal or send welcome email when Supabase persistence fails', async () => {
    const persistOnboarding = vi.fn(async () => {
      throw new Error('supabase persistence failed');
    });
    const sendWelcomeEmail = vi.fn(async () => undefined);

    await expect(
      completeOAuthBusinessTypeOnboarding({
        userId: 'user-google-1',
        email: 'santi@orvel.app',
        plan: 'GROWTH',
        businessType: 'peluqueria',
        persistOnboarding,
        sendWelcomeEmail
      })
    ).rejects.toThrow(/persistence|supabase/i);

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
