import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const SUBSCRIPTION_STATUS_API_PATH = new URL('../pages/api/subscriptions/status.ts', import.meta.url);
const CREATE_SUBSCRIPTION_FN_PATH = new URL('../../../../supabase/functions/create-subscription/index.ts', import.meta.url);
const MP_WEBHOOK_FN_PATH = new URL('../../../../supabase/functions/mercadopago-webhook/index.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function sliceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('RED contract: paid manual signup defers account creation until payment confirmation', () => {
  it('paid manual signup completion does not call signupWithProvider before MercadoPago payment', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);
    const manualFlow = sliceBetween(source, '// Manual Signup Flow');
    const paidBranch = sliceBetween(manualFlow, 'if (isPaidPlan)', 'const { data: userData, error: userError } = await client.auth.getUser()');
    const paidBranchStart = manualFlow.indexOf('if (isPaidPlan)');

    expect(paidBranchStart).toBeGreaterThanOrEqual(0);
    expect(paidBranch).not.toContain('signupWithProvider');
    expect(paidBranch).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(manualFlow).not.toContain('await signupWithProvider({');
    expect(manualFlow).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(paidBranch).toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(paidBranch).toContain('/billing/subscription?plan=');
  });

  it('free manual signup still creates the Supabase user immediately and hands off to dashboard signup', async () => {
    const credentialsSource = await loadSource(new URL('../pages/auth/signup/credentials.astro', import.meta.url));
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", "document.getElementById('googleSignupBtn')");
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', 'window.location.href = `/auth/signup/business-type');
    const completeManualFlow = sliceBetween(completeSource, '// Manual Signup Flow');

    expect(freeBranch).toContain('createSupabaseSignupAdapterFromEnv');
    expect(freeBranch).toContain('await signupWithProvider({');
    expect(freeBranch).toContain("tipoNegocio: 'pendiente'");
    expect(completeManualFlow).toContain('await client.auth.getUser()');
    expect(completeManualFlow).toContain('await client.auth.updateUser({');
    expect(completeManualFlow).toContain('window.location.href = dashboardSignupUrl');
  });

  it('manual signup never stores or reads password values from browser storage', async () => {
    const credentialsSource = await loadSource(new URL('../pages/auth/signup/credentials.astro', import.meta.url));
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const signupSources = `${credentialsSource}\n${completeSource}`;
    const legacyPasswordKey = ['orvel.signup', 'password'].join('.');

    expect(signupSources).not.toContain(legacyPasswordKey);
    expect(signupSources).not.toMatch(/(?:sessionStorage|localStorage)\.setItem\([^)]*password/i);
    expect(signupSources).not.toMatch(/(?:sessionStorage|localStorage)\.getItem\([^)]*password/i);
  });

  it('free completion fails closed when no active Supabase session exists instead of asking for a stored password', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);
    const manualFlow = sliceBetween(source, '// Manual Signup Flow');
    const freeBranch = sliceBetween(manualFlow, 'const { data: userData, error: userError } = await client.auth.getUser()', 'await client.auth.updateUser({');

    expect(freeBranch).toMatch(/!userData\.user\?\.id|!userData\.user/i);
    expect(freeBranch).toMatch(/Volvé al paso de credenciales|paso de credenciales/i);
    expect(freeBranch).not.toMatch(/password|contraseñ/i);
  });

  it('paid signup creates a pending signup intent and passes it through subscription start without existing auth/business', async () => {
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(completeSource).toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(completeSource).toContain('/billing/subscription?plan=');
    expect(completeSource).toMatch(/signup_intent|pending_signup_intent/);

    expect(subscriptionSource).toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(subscriptionSource).toContain("fetch('/api/subscriptions/start'");
    expect(subscriptionSource).toMatch(/pending[_A-Za-z]*Signup|signup_intent|pending_signup_intent/);

    expect(startApiSource).toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(startApiSource).toMatch(/pending_signup_intent|signup_intent/);
    expect(startApiSource).toContain('email,');
    expect(startApiSource).toContain('business_type: businessType');
  });

  it('paid Google signup is blocked before Supabase OAuth starts', async () => {
    const credentialsSource = await loadSource(new URL('../pages/auth/signup/credentials.astro', import.meta.url));
    const googleHandler = sliceBetween(credentialsSource, "document.getElementById('googleSignupBtn')", "const { loginWithGoogle }");

    expect(googleHandler).toMatch(/isPaidPlan/);
    expect(googleHandler).toMatch(/Google no está disponible antes del pago|planes pagos/i);
    expect(googleHandler).toMatch(/return;/);
    expect(googleHandler).not.toContain('loginWithGoogle');
  });

  it('complete.astro paid OAuth branch cannot create paid business/auth onboarding before MP payment', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);
    const oauthBranch = sliceBetween(source, 'if (isOAuthOnboarding)', 'const result = await completeOAuthBusinessTypeOnboarding');

    expect(oauthBranch).toMatch(/isPaidPlan/);
    expect(oauthBranch).toMatch(/signOut|return/);
    expect(oauthBranch).not.toContain("from('businesses')");
  });

  it('OAuth onboarding callback hard-blocks paid intents before Supabase session exchange', async () => {
    const callbackSource = await loadSource(new URL('../pages/auth/oauth/onboarding-callback.astro', import.meta.url));
    const oauthFlowSource = await loadSource(new URL('../lib/oauth-signup-onboarding-flow.ts', import.meta.url));
    const beforeExchange = sliceBetween(oauthFlowSource, 'const intent = signupIntentId', 'const session = code');

    expect(oauthFlowSource).toContain('paid_oauth_signup_blocked');
    expect(beforeExchange).toMatch(/isPaidOAuthSignupPlan|paid/i);
    expect(beforeExchange).toContain('throw new OAuthOnboardingError');
    expect(callbackSource).toMatch(/paid_oauth_signup_blocked|oauth_error_code/);
    expect(callbackSource).toContain('/auth/signup/credentials');
  });

  it('landing passes selected billing cadence through subscription start to backend', async () => {
    const indexSource = await loadSource(new URL('../pages/index.astro', import.meta.url));
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(indexSource).toContain('currentBillingPeriod');
    expect(indexSource).toMatch(/billing=.*billing/);
    expect(subscriptionSource).toMatch(/billing_period:\s*billing/);
    expect(subscriptionSource).toMatch(/cadence:\s*billing/);
    expect(startApiSource).toMatch(/cadence:\s*normalizeBillingPeriod/);
    expect(startApiSource).toMatch(/billing_period:\s*normalizeBillingPeriod/);
  });

  it('normalizes Idempotency-Key/x-idempotency-key across landing proxy and Edge Function', async () => {
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);
    const createSubscriptionSource = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const billingSecuritySource = await loadSource(new URL('../../../../supabase/functions/_shared/billing-security.ts', import.meta.url));

    expect(startApiSource).toMatch(/normalizeIdempotencyKey/);
    expect(startApiSource).toMatch(/request\.headers\.get\("Idempotency-Key"\)/);
    expect(startApiSource).toMatch(/request\.headers\.get\("x-idempotency-key"\)/);
    expect(startApiSource).toContain('headers["X-Idempotency-Key"] = normalizedIdempotencyKey');
    expect(startApiSource).not.toContain('headers["Idempotency-Key"] = idempotencyKey');

    expect(createSubscriptionSource).toMatch(/getCanonicalIdempotencyKey/);
    expect(createSubscriptionSource).toMatch(/headers\.get\("Idempotency-Key"\)/);
    expect(createSubscriptionSource).toMatch(/headers\.get\("x-idempotency-key"\)/);
    expect(createSubscriptionSource).toContain('"X-Idempotency-Key": idempotencyKey');
    expect(billingSecuritySource).toMatch(/idempotency-key/i);
  });
});

describe('RED contract: subscription start supports pending-signup billing without BUSINESS_REQUIRED', () => {
  it('create-subscription accepts pending signup intent before checking for an existing business', async () => {
    const source = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const paidPlanSection = sliceBetween(source, '// 5. CREATE MERCADO PAGO PREAPPROVAL', '// Build MP preapproval request');
    const businessRequiredIndex = paidPlanSection.indexOf('BUSINESS_REQUIRED');
    const pendingSignupIndex = paidPlanSection.search(/pendingSignupIntent|pending_signup_intent|signup_intent|pending_signup/i);
    const mpAccessTokenIndex = paidPlanSection.indexOf('MP_ACCESS_TOKEN');

    expect(pendingSignupIndex, 'paid start must recognize a pending signup/session before requiring a business').toBeGreaterThanOrEqual(0);
    expect(businessRequiredIndex, 'BUSINESS_REQUIRED must not block pending-signup preapproval creation').toBeGreaterThan(pendingSignupIndex);
    expect(mpAccessTokenIndex).toBeLessThan(pendingSignupIndex);
  });

  it('BUSINESS_REQUIRED UI copy distinguishes existing-user billing from pending-signup billing', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(subscriptionSource).toMatch(/existingUserBusinessRequired|existing_user_business_required|business_required_existing/i);
    expect(subscriptionSource).toMatch(/pendingSignupBusinessRequired|pending_signup_business_required|business_required_pending_signup/i);
    expect(subscriptionSource).toMatch(/No pudimos preparar tu alta paga|alta paga|pago antes de crear tu cuenta/i);
    expect(startApiSource).toMatch(/business_required_existing|business_required_pending_signup|pending_signup_business_required/i);
  });
});

describe('RED contract: approved MercadoPago payment materializes pending paid signup', () => {
  it('webhook has an approved-payment path that materializes pending signup before entitlement sync', async () => {
    const webhookSource = await loadSource(MP_WEBHOOK_FN_PATH);
    const approvedSideEffects = sliceBetween(webhookSource, 'const shouldSyncEntitlements', '// =============================================================================\n    // 8. FINALIZE WEBHOOK EVENT');

    expect(webhookSource).toMatch(/pendingSignupIntent|pending_signup_intent|materialize_paid_signup|materializePendingSignup/i);
    expect(approvedSideEffects).toMatch(/approved|active/);
    expect(approvedSideEffects).toMatch(/materialize_paid_signup|materializePendingSignup|auth\.admin\.createUser/i);
    expect(approvedSideEffects.indexOf('materialize')).toBeLessThan(approvedSideEffects.indexOf('syncEntitlementsForBusiness'));
  });

  it('webhook validates pending signup session before materializing auth/business/subscription', async () => {
    const webhookSource = await loadSource(MP_WEBHOOK_FN_PATH);
    const pendingApprovedPath = sliceBetween(webhookSource, 'if (!subscription && webhookPaymentApproved)', '// =============================================================================\n    // 6. UPDATE BUSINESS SUBSCRIPTION');
    const validationIndex = pendingApprovedPath.indexOf('validate_pending_signup_subscription_session');
    const materializeIndex = pendingApprovedPath.indexOf('materializePendingSignup');

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(pendingApprovedPath).toMatch(/p_external_reference/);
    expect(pendingApprovedPath).toMatch(/p_amount/);
    expect(pendingApprovedPath).toMatch(/p_currency/);
    expect(pendingApprovedPath).toMatch(/p_provider_subscription_id/);
    expect(validationIndex).toBeLessThan(materializeIndex);
  });

  it('subscription-status avoids raw or interpolation and anonymous id leakage', async () => {
    const statusSource = await loadSource(new URL('../../../../supabase/functions/subscription-status/index.ts', import.meta.url));

    expect(statusSource).not.toMatch(/\.or\s*\(/);
    expect(statusSource).not.toMatch(/business_id|user_id|tenant_id/);
    expect(statusSource).toMatch(/materialized|account_materialized|status/);
  });

  it('create-subscription uses selected quarterly/annual cadence for MP recurring amount/frequency', async () => {
    const source = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const recurringSection = sliceBetween(source, 'const requestedCadence', 'const mpPreapprovalRequest');

    expect(recurringSection).toMatch(/normalizeBillingCadence/);
    expect(recurringSection).toMatch(/price_quarterly|price_annual|catalogRow/);
    expect(source).toMatch(/cadence === "quarterly"[\s\S]*frequency:\s*3/);
    expect(source).toMatch(/cadence === "annual"[\s\S]*frequency:\s*12/);
    expect(recurringSection).not.toMatch(/const inferredCadence = "monthly"/);
  });

  it('status path exposes materialized approved subscription state for the landing polling contract', async () => {
    const statusSource = await loadSource(SUBSCRIPTION_STATUS_API_PATH);

    expect(statusSource).toMatch(/materialized|account_materialized/i);
    expect(statusSource).toContain('subscription_session_id');
    expect(statusSource).toContain('status');
  });
});
