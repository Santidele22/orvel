import { describe, expect, it } from 'vitest';

import {
  buildPendingSignupIntentPayload,
  getInitialSubscriptionPageRecovery,
  getSubscriptionStartReadiness,
  SUBSCRIPTION_RECOVERY_ERRORS,
} from '../lib/subscription-page-controller';

const protectedPendingSignupIntent = {
  email_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"email-iv","ct":"email-ct"}',
  email_hmac: 'email-hmac',
  first_name_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"first-iv","ct":"first-ct"}',
  first_name_hmac: 'first-hmac',
  plan_code: 'STARTER',
  billing_period: 'monthly',
};

describe('RED contract: visible subscription page start recovery', () => {
  it('turns an exact pending_signup URL without protected browser state into a signup recovery CTA before retrying start', () => {
    const recovery = getInitialSubscriptionPageRecovery({
      plan: 'STARTER',
      billing: 'monthly',
      signupIntent: 'pending_signup',
      pendingSignupIntent: null,
    });

    expect(recovery).toEqual({
      code: 'pending_signup_missing',
      message: SUBSCRIPTION_RECOVERY_ERRORS.pending_signup_missing,
      recoveryHref: '/auth/signup/credentials?plan=STARTER&billing=monthly&resume=credentials_first',
    });
  });

  it('blocks paid anonymous subscription start when the browser lost the protected pending signup intent', () => {
    const readiness = getSubscriptionStartReadiness({
      plan: 'STARTER',
      pendingSignupIntent: null,
      accessToken: null,
    });

    expect(readiness).toEqual({
      ok: false,
      code: 'pending_signup_missing',
      message: SUBSCRIPTION_RECOVERY_ERRORS.pending_signup_missing,
      recoveryHref: '/auth/signup/credentials?plan=STARTER&billing=monthly&resume=credentials_first',
    });
  });

  it('treats intent_id-only or malformed pending signup markers as stale before calling /api/subscriptions/start', () => {
    const readiness = getSubscriptionStartReadiness({
      plan: 'STARTER',
      billing: 'annual',
      pendingSignupIntent: { intent_id: 'psi_123' },
      accessToken: null,
    });

    expect(readiness.ok).toBe(false);
    expect(readiness).toMatchObject({
      code: 'pending_signup_missing',
      recoveryHref: '/auth/signup/credentials?plan=STARTER&billing=annual&resume=credentials_first',
    });
  });

  it('allows fresh protected pending signup intent mode and forwards only protected fields', () => {
    const readiness = getSubscriptionStartReadiness({
      plan: 'STARTER',
      billing: 'monthly',
      pendingSignupIntent: protectedPendingSignupIntent,
      accessToken: null,
    });

    expect(readiness).toEqual({ ok: true, mode: 'pending_signup_intent' });
    expect(buildPendingSignupIntentPayload(protectedPendingSignupIntent)).toEqual(expect.objectContaining({
      email_encrypted: protectedPendingSignupIntent.email_encrypted,
      email_hmac: protectedPendingSignupIntent.email_hmac,
      first_name_encrypted: protectedPendingSignupIntent.first_name_encrypted,
      first_name_hmac: protectedPendingSignupIntent.first_name_hmac,
      plan_code: protectedPendingSignupIntent.plan_code,
      billing_period: protectedPendingSignupIntent.billing_period,
    }));
    expect(JSON.stringify(buildPendingSignupIntentPayload(protectedPendingSignupIntent))).not.toMatch(/intent_id|password|email\":/);
  });

  it('allows existing-user subscription start only with a JWT-shaped access token', () => {
    expect(getSubscriptionStartReadiness({
      plan: 'STARTER',
      pendingSignupIntent: null,
      accessToken: 'not-a-jwt',
    }).ok).toBe(false);

    expect(getSubscriptionStartReadiness({
      plan: 'STARTER',
      pendingSignupIntent: null,
      accessToken: 'aaa.bbb.ccc',
    })).toEqual({ ok: true, mode: 'existing_user' });
  });

  it('does not block free signup recovery paths on the billing page helper', () => {
    expect(getSubscriptionStartReadiness({
      plan: 'FREE',
      pendingSignupIntent: null,
      accessToken: null,
    })).toEqual({ ok: true, mode: 'free' });
  });
});
