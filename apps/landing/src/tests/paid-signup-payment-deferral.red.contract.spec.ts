import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/account.astro', import.meta.url);
const CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-access-page-controller.ts', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const SUBSCRIPTION_STATUS_API_PATH = new URL('../pages/api/subscriptions/status.ts', import.meta.url);
const CREATE_SUBSCRIPTION_FN_PATH = new URL('../../../../supabase/functions/create-subscription/index.ts', import.meta.url);
const CREATE_SUBSCRIPTION_AUTH_HELPER_PATH = new URL('../../../../supabase/functions/_shared/create-subscription-auth.ts', import.meta.url);
const CREATE_SUBSCRIPTION_AUTH_HELPER_TEST_PATH = new URL('../../../../supabase/functions/_shared/create-subscription-auth.test.ts', import.meta.url);
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
  it('paid manual signup creates only a pending intent and never calls signupWithProvider before MercadoPago payment', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {\n      const protectedSignup');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n    }\n\n    try {');

    expect(freeBranch).not.toContain('await signupWithProvider({');
    expect(paidBranch).not.toContain('signupWithProvider');
    expect(paidBranch).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(submitFlow).toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(paidBranch).toContain('/billing/subscription?plan=');
    expect(completeSource).not.toContain('await signupWithProvider({');
    expect(completeSource).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(completeSource).not.toContain('await client.auth.updateUser({');
  });

  it('free manual signup creates the account immediately in the credentials submit flow', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n    }\n\n    try {');

    expect(freeBranch).toMatch(/createAndfinalizeFreeSignup|finalizeFreeSignup|createAccountAndBusiness|signupWithProvider/i);
    expect(freeBranch).not.toContain("tipoNegocio: 'pendiente'");
    expect(freeBranch).not.toContain('showFreeRubroStep');
    expect(freeBranch).not.toContain('attachFreeRubroFinalizer');
    expect(freeBranch).toMatch(/freeSignupWelcomeModal|showExistingAccountModal/i);
    expect(`${credentialsSource}\n${completeSource}`).toContain('finalizeFreeSignup');
    expect(`${credentialsSource}\n${completeSource}`).not.toContain('/auth/onboarding');
    expect(`${credentialsSource}\n${completeSource}`).not.toContain('/auth/signup/business-type');
  });

  it('free manual signup sends separately captured first and last name to Supabase signup metadata', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n    }\n\n    try {');

    expect(pageSource).toContain('name="nombre"');
    expect(pageSource).toContain('name="apellido"');
    expect(freeBranch).toMatch(/firstName:\s*values\.nombre|nombre:\s*values\.nombre/);
    expect(freeBranch).toMatch(/lastName:\s*values\.apellido|apellido:\s*values\.apellido/);
    expect(freeBranch).not.toMatch(/input\[name=["']name["']\]/);
    expect(freeBranch).not.toMatch(/nameParts|\.split\(['"]\s['"]\)|slice\(1\)\.join/);
  });

  it('manual signup never stores or reads password values from browser storage', async () => {
    const credentialsSource = `${await loadSource(CREDENTIALS_PAGE_PATH)}\n${await loadSource(CREDENTIALS_CONTROLLER_PATH)}`;
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const signupSources = `${credentialsSource}\n${completeSource}`;
    const legacyPasswordKey = ['orvel.signup', 'password'].join('.');

    expect(signupSources).not.toContain(legacyPasswordKey);
    expect(signupSources).not.toMatch(/(?:sessionStorage|localStorage)\.setItem\([^)]*password/i);
    expect(signupSources).not.toMatch(/(?:sessionStorage|localStorage)\.getItem\([^)]*password/i);
  });

  it('simplified completion page never recovers manual signup by reading a stored password', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);

    expect(source).toContain('/auth/signup/credentials');
    expect(source).toContain('/auth/signup/credentials');
    expect(source).toContain('/auth/login');
    expect(source).not.toContain('getUser()');
    expect(source).not.toContain('updateUser({');
    expect(source).not.toMatch(/(?:sessionStorage|localStorage)\.getItem\([^)]*password/i);
    expect(source).not.toMatch(/password|contraseñ/i);
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
    expect(startApiSource).toMatch(/email_encrypted:\s*pendingSignupIntent\.email_encrypted/);
    expect(startApiSource).toMatch(/email_hmac:\s*pendingSignupIntent\.email_hmac/);
    expect(startApiSource).toMatch(/business_type:\s*(effectiveBusinessType|pendingSignupIntent\.business_type)/);
    expect(startApiSource).not.toMatch(/!pendingSignupEmail\s*\|\|\s*!pendingSignupBusinessType/);
  });

  it('paid manual signup protects separately captured first and last name before subscription start', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const paidProtectionFlow = sliceBetween(submitFlow, 'const protectedSignup = await createProtectedPendingSignupIntent', 'sessionStorage.setItem');
    const paidBranch = sliceBetween(submitFlow, 'sessionStorage.setItem');

    expect(pageSource).toContain('name="nombre"');
    expect(pageSource).toContain('name="apellido"');
    expect(paidProtectionFlow).toMatch(/first_name\s*:\s*values\.nombre/);
    expect(paidProtectionFlow).toMatch(/last_name\s*:\s*values\.apellido/);
    expect(paidBranch).toContain('...protectedSignup');
    expect(paidBranch).toContain('plan_code: plan');
    expect(paidBranch).toContain('billing_period: billing');
    expect(paidProtectionFlow).not.toMatch(/input\[name=["']name["']\]/);
    expect(paidProtectionFlow).not.toMatch(/nameParts|\.split\(['"]\s['"]\)|slice\(1\)\.join/);
  });

  it('signup credentials removes Google UI entirely before external auth can start', async () => {
    const credentialsSource = `${await loadSource(CREDENTIALS_PAGE_PATH)}\n${await loadSource(CREDENTIALS_CONTROLLER_PATH)}`;

    expect(credentialsSource).not.toContain('id="googleSignupBtn"');
    expect(credentialsSource).not.toContain("id='googleSignupBtn'");
    expect(credentialsSource).not.toContain('id="googleSignupNotice"');
    expect(credentialsSource).not.toMatch(/Registrarse\s+con\s+Google|Google disponible|Google estar[aá] disponible/i);
    expect(credentialsSource).not.toMatch(/<svg[\s\S]{0,1200}Google|Google[\s\S]{0,1200}<svg/i);
    expect(credentialsSource).not.toContain("document.getElementById('googleSignupBtn')?.addEventListener('click'");
    expect(credentialsSource).not.toContain('loginWithGoogle');
    expect(credentialsSource).not.toContain('createSupabaseOAuthAdapter');
    expect(credentialsSource).not.toContain('signInWithOAuth');
  });

  it('explicit FREE signup selection clears stale paid pending-signup state before account creation starts', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const credentialsPlanSetup = sliceBetween(credentialsSource, 'const explicitPlan = searchParams.get', 'const passwordFields');
    const completePlanSetup = sliceBetween(completeSource, 'const explicitPlan = searchParams.get', 'const step2Link');

    expect(credentialsPlanSetup).toContain("isExplicitFreePlan");
    expect(credentialsPlanSetup).toContain('sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent)');
    expect(credentialsPlanSetup).toMatch(/isExplicitFreePlan \? searchParams\.get\('billing'\)/);
    expect(completePlanSetup).toContain("isExplicitFreePlan");
    expect(completePlanSetup).toContain('sessionStorage.removeItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent)');
    expect(completePlanSetup).toMatch(/isExplicitFreePlan \? searchParams\.get\('billing'\)/);
  });

  it('simplified completion page has no legacy paid external-auth materialization branch before MP payment', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);

    expect(source).not.toContain('isOAuthOnboarding');
    expect(source).not.toContain('completeOAuthBusinessTypeOnboarding');
    expect(source).not.toContain("from('businesses')");
    expect(source).not.toMatch(/auth\.admin\.createUser|signupWithProvider|updateUser\(/);
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

  it('create-subscription delegates anon bearer and pending-signup auth decisions to the shared helper', async () => {
    const createSubscriptionSource = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const authHelperSource = await loadSource(CREATE_SUBSCRIPTION_AUTH_HELPER_PATH);
    const authHelperTestSource = await loadSource(CREATE_SUBSCRIPTION_AUTH_HELPER_TEST_PATH);
    const authSection = sliceBetween(
      createSubscriptionSource,
      '// 2. VERIFY USER AUTHENTICATION (Optional for anonymous pending signup)',
      '// =============================================================================\n    // 3. PARSE AND VALIDATE REQUEST',
    );

    expect(createSubscriptionSource).toContain('from "../_shared/create-subscription-auth.ts"');
    expect(authSection).toMatch(/shouldValidateCreateSubscriptionAuthorization\(\{[\s\S]*authHeader,[\s\S]*requestBody: body,[\s\S]*supabaseAnonKey: Deno\.env\.get\("SUPABASE_ANON_KEY"\),[\s\S]*\}\)/);
    expect(authSection).toMatch(/const token = getBearerToken\(authHeader \|\| ""\)/);
    expect(authSection).not.toMatch(/authHeader && !isSupabaseAnonBearer\(authHeader\)/);
    expect(createSubscriptionSource).toMatch(/const isPendingSignupIntent = !business && !!pendingSignupIntent/);

    expect(authHelperSource).toMatch(/export function getBearerToken/);
    expect(authHelperSource).toMatch(/export function isSupabaseAnonBearer/);
    expect(authHelperSource).toMatch(/supabaseAnonKey\?: string \| null/);
    expect(authHelperSource).toMatch(/getBearerToken\(authHeader\) === anonKey/);
    expect(authHelperSource).toMatch(/export function isPendingSignupAuthOptional/);
    expect(authHelperSource).toMatch(/requestBody\.mode === "pending_signup_intent"/);
    expect(authHelperSource).toMatch(/requestBody\.mode === "existing_user"[\s\S]*return false/);
    expect(authHelperSource).toMatch(/requestBody\.pending_signup_intent !== null/);
    expect(authHelperSource).toMatch(/export function shouldValidateCreateSubscriptionAuthorization/);
    expect(authHelperSource).toMatch(/if \(!authHeader\) return false/);
    expect(authHelperSource).toMatch(/if \(isSupabaseAnonBearer\(authHeader, supabaseAnonKey\)\) return false/);
    expect(authHelperSource).toMatch(/if \(isPendingSignupAuthOptional\(requestBody\)\) return false/);
    expect(authHelperSource).toMatch(/return true/);

    expect(authHelperTestSource).toMatch(/pending signup intent with malformed Authorization/);
    expect(authHelperTestSource).toMatch(/mode: "pending_signup_intent"[\s\S]*assertEquals\(shouldValidate, false\)/);
    expect(authHelperTestSource).toMatch(/existing-user mode with invalid Authorization/);
    expect(authHelperTestSource).toMatch(/mode: "existing_user"[\s\S]*assertEquals\(shouldValidate, true\)/);
  });

  it('BUSINESS_REQUIRED UI copy distinguishes existing-user billing from pending-signup billing', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(subscriptionSource).toMatch(/business_required/i);
    expect(subscriptionSource).toMatch(/pending_signup_intent_business_required/i);
    expect(subscriptionSource).toMatch(/No pudimos preparar tu alta paga|alta paga|pago antes de crear tu cuenta/i);
    expect(startApiSource).toMatch(/pending_signup_intent_business_required|business_required/i);
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

  it('create-subscription keeps MVP subscriptions on monthly cadence only', async () => {
    const source = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const recurringSection = sliceBetween(source, 'const requestedCadence', 'const mpPreapprovalRequest');

    expect(recurringSection).toMatch(/normalizeBillingCadence/);
    expect(recurringSection).toMatch(/catalogRow/);
    expect(source).not.toMatch(/cadence === "quarterly"[\s\S]*frequency:\s*3/);
    expect(source).not.toMatch(/cadence === "annual"[\s\S]*frequency:\s*12/);
    expect(recurringSection).not.toMatch(/const inferredCadence = "monthly"/);
  });

  it('status path exposes materialized approved subscription state for the landing polling contract', async () => {
    const statusSource = await loadSource(SUBSCRIPTION_STATUS_API_PATH);

    expect(statusSource).toMatch(/materialized|account_materialized/i);
    expect(statusSource).toContain('subscription_session_id');
    expect(statusSource).toContain('status');
  });
});
