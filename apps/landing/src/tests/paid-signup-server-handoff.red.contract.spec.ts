import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  getInitialSubscriptionPageRecovery,
  getSubscriptionStartReadiness,
  SUBSCRIPTION_RECOVERY_ERRORS,
} from '../lib/subscription-page-controller';

const SIGNUP_ACCOUNT_CONTROLLER = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const CREATE_SUBSCRIPTION_FUNCTION = new URL('../../../../supabase/functions/create-subscription/index.ts', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function sliceBetween(sourceText: string, startMarker: string, endMarker?: string): string {
  const start = sourceText.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? sourceText.indexOf(endMarker, start + startMarker.length) : sourceText.length;
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return sourceText.slice(start, end);
}

function indexOfMatch(sourceText: string, pattern: RegExp): number {
  return pattern.exec(sourceText)?.index ?? -1;
}

describe('RED contract: paid signup uses server-side robust handoff into billing', () => {
  it('paid signup form submit does not redirect to a marker-only pending_signup URL', async () => {
    const controllerSource = await source(SIGNUP_ACCOUNT_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {\n      const pendingSignupIntent', 'window.location.href = billingUrl;');

    expect(paidBranch, 'paid branch must obtain a server-issued recoverable handoff before redirecting').toMatch(
      /serverIssuedRedirect|serverRedirectUrl|pendingSignupReference|pendingSignupToken|pending_signup_reference|pending_signup_token|intent_reference|intent_token/i,
    );
    expect(paidBranch, 'signup_intent=pending_signup is only a marker and is not recoverable after www/apex/reload loss').not.toMatch(
      /billingUrl\s*=\s*`\/billing\/subscription\?plan=\$\{encodeURIComponent\(plan\)\}&billing=\$\{encodeURIComponent\(billing\)\}&signup_intent=pending_signup`/,
    );
    expect(paidBranch, 'redirect must carry an opaque reference/token or use an opaque server-issued redirect URL').toMatch(
      /[?&](?:pending_signup_reference|pending_signup_token|intent_reference|intent_token)=|serverIssuedRedirect|serverRedirectUrl/i,
    );
  });

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

  it('billing start sends a server-side intent reference/token instead of relying only on sessionStorage payload', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const clickFlow = sliceBetween(subscriptionSource, "fetch('/api/subscriptions/start'", 'const result = await response.json().catch(() => null);');

    expect(clickFlow, 'POST /api/subscriptions/start must include the opaque server handoff identifier').toMatch(
      /pending_signup_reference|pending_signup_token|intent_reference|intent_token|server_intent_reference|server_intent_token/i,
    );
    expect(clickFlow, 'protected PII payload from sessionStorage cannot be the only pending-signup source of truth').not.toMatch(
      /pending_signup_intent:\s*\{[\s\S]*pendingSignupPayload\./,
    );
  });

  it('cross-origin www/apex/reload-safe handoff can recover by URL reference or HttpOnly cookie binding', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startApiSource = await source(SUBSCRIPTION_START_API);
    const createSubscriptionSource = await source(CREATE_SUBSCRIPTION_FUNCTION);
    const combined = `${subscriptionSource}\n${startApiSource}\n${createSubscriptionSource}`;

    expect(combined, 'billing page/API/function must model an opaque recoverable pending-signup reference').toMatch(
      /pending_signup_reference|pending_signup_token|intent_reference|intent_token|server_intent_reference|server_intent_token/i,
    );
    expect(combined, 'server handoff must bind the browser with an HttpOnly cookie for reload/origin safety').toMatch(
      /HttpOnly|Set-Cookie|__Host-|SameSite=Lax|SameSite=Strict/i,
    );
    expect(combined, 'handoff must not depend solely on sessionStorage surviving www/apex changes or reloads').not.toMatch(
      /getInitialSubscriptionPageRecovery\([\s\S]*pendingSignupIntent:\s*readPendingSignupIntent\(\)[\s\S]*\)/,
    );
  });

  it('duplicate email remains mapped to the existing-account login path before payment starts', async () => {
    const controllerSource = await source(SIGNUP_ACCOUNT_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');

    const duplicateDetectorIndex = indexOfMatch(controllerSource, /isExistingAccountError|EMAIL_ALREADY_REGISTERED|EMAIL_EXISTS|already\s+(?:registered|exists)|email.*registrad[oa]/i);
    const modalIndex = indexOfMatch(controllerSource, /showExistingAccountModal|existingAccountLogin|Cuenta existente|Este email ya est[aá] registrado/i);

    expect(duplicateDetectorIndex, 'duplicate email detector must exist').toBeGreaterThanOrEqual(0);
    expect(modalIndex, 'duplicate email must route to existing-account/login UI').toBeGreaterThan(duplicateDetectorIndex);
    expect(submitFlow, 'duplicate email path must not continue silently to Mercado Pago').toMatch(/showExistingAccountModal\(\);[\s\S]*return;/i);
  });

  it('paid pending signup contract still creates no account or business before payment approval', async () => {
    const controllerSource = await source(SIGNUP_ACCOUNT_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {\n      const pendingSignupIntent', 'window.location.href = billingUrl;');

    expect(paidBranch).toMatch(/createProtectedPendingSignupIntent|pendingSignupIntent/i);
    expect(paidBranch).not.toMatch(/createAccountAndBusiness|signupWithProvider|finalizeFreeSignup|pending-intent\/finalize|auth\.signUp/i);
    expect(paidBranch).not.toMatch(/from\(['"]businesses['"]\)|create_business|insert\([\s\S]*business/i);
  });
});
