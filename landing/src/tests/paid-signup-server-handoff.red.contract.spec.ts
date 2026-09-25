import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  getInitialSubscriptionPageRecovery,
  getSubscriptionStartReadiness,
  SUBSCRIPTION_RECOVERY_ERRORS,
} from '../lib/subscription-page-controller';

const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const CREATE_SUBSCRIPTION_FUNCTION = new URL('../../../../supabase/functions/create-subscription/index.ts', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: paid signup uses server-side robust handoff into billing', () => {
  it('marker-only subscription URL with missing protected state shows recovery, not a generic temporary start failure', () => {
    const recovery = getInitialSubscriptionPageRecovery({
      plan: 'PREMIUM',
      billing: 'monthly',
      signupIntent: 'pending_signup',
      pendingSignupIntent: null,
    });
    const readiness = getSubscriptionStartReadiness({
      plan: 'PREMIUM',
      billing: 'monthly',
      pendingSignupIntent: null,
      accessToken: null,
    });

    expect(recovery).toMatchObject({
      code: 'pending_signup_missing',
      message: SUBSCRIPTION_RECOVERY_ERRORS.pending_signup_missing,
      recoveryHref: '/auth/signup/credentials?plan=PREMIUM&billing=monthly&resume=credentials_first',
    });
    expect(readiness).toMatchObject({
      ok: false,
      code: 'pending_signup_missing',
      message: SUBSCRIPTION_RECOVERY_ERRORS.pending_signup_missing,
    });
    expect(JSON.stringify({ recovery, readiness })).not.toMatch(/temporal|temporary|No pudimos iniciar (?:el pago|la suscripci[oó]n)/i);
  });

  it('billing activation page no longer posts pending-signup PII to Mercado Pago start', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);

    expect(subscriptionSource).not.toMatch(/fetch\(['"]\/api\/subscriptions\/start['"]/);
    expect(subscriptionSource).not.toMatch(/pending_signup_intent:\s*\{/);
    expect(subscriptionSource).toContain('orvel.pagos');
  });

  it('cross-origin www/apex/reload-safe handoff can recover by URL reference or HttpOnly cookie binding', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startApiSource = await source(SUBSCRIPTION_START_API);
    const createSubscriptionSource = await source(CREATE_SUBSCRIPTION_FUNCTION);
    const combined = `${subscriptionSource}\n${startApiSource}\n${createSubscriptionSource}`;

    expect(`${startApiSource}\n${createSubscriptionSource}`, 'billing API/function must model an opaque recoverable pending-signup reference').toMatch(
      /pending_signup_reference|pending_signup_token|intent_reference|intent_token|server_intent_reference|server_intent_token/i,
    );
    expect(combined, 'server handoff must bind the browser with an HttpOnly cookie for reload/origin safety').toMatch(
      /HttpOnly|Set-Cookie|__Host-|SameSite=Lax|SameSite=Strict/i,
    );
    expect(combined, 'handoff must not depend solely on sessionStorage surviving www/apex changes or reloads').not.toMatch(
      /getInitialSubscriptionPageRecovery\([\s\S]*pendingSignupIntent:\s*readPendingSignupIntent\(\)[\s\S]*\)/,
    );
  });

});
