import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/account.astro', import.meta.url);
const CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
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

describe('RED contract: account-first paid signup creates account/business before MercadoPago', () => {
  it('paid manual signup creates account/business before opening MercadoPago and does not create a pending signup intent', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n\n    try {');

    expect(freeBranch).toContain('createAccountAndBusiness(accountBusinessPayload)');
    const accountCreationIndex = paidBranch.indexOf('await createAccountAndBusiness(accountBusinessPayload)');
    const mpRedirectIndex = paidBranch.indexOf('/billing/subscription?plan=');
    expect(accountCreationIndex).toBeGreaterThanOrEqual(0);
    expect(mpRedirectIndex).toBeGreaterThan(accountCreationIndex);
    expect(submitFlow).not.toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(paidBranch).toMatch(/loginWithProvider|window\.location\.href/);
    expect(completeSource).toContain('/auth/signup/account');
    expect(completeSource).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(completeSource).not.toContain('await client.auth.updateUser({');
  });

  it('free manual signup creates the account/business immediately and shows the welcome login handoff', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n\n    try {');

    expect(freeBranch).toContain('createAccountAndBusiness(accountBusinessPayload)');
    expect(freeBranch).toContain('sessionStorage.setItem(SIGNUP_STORAGE_KEYS.tipoNegocio, values.rubro)');
    expect(freeBranch).toContain('showAccountCreatedModal()');
    expect(freeBranch).not.toMatch(/Mercado\s*Pago|\/billing\/subscription|preapproval/i);
    expect(`${credentialsSource}\n${completeSource}`).toContain('/auth/signup/account');
    expect(`${credentialsSource}\n${completeSource}`).not.toContain('/auth/onboarding');
    expect(`${credentialsSource}\n${completeSource}`).not.toContain('/auth/signup/business-type');
  });

  it('free manual signup sends separately captured first and last name to Supabase signup metadata', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n\n    try {');

    expect(pageSource).toContain('name="nombre"');
    expect(pageSource).toContain('name="apellido"');
    expect(credentialsSource).toMatch(/nombre:\s*values\.nombre/);
    expect(credentialsSource).toMatch(/apellido:\s*values\.apellido/);
    expect(freeBranch).toContain('accountBusinessPayload');
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

    expect(source).toContain('/auth/signup/account');
    expect(source).not.toContain('/auth/signup/onboarding');
    expect(source).not.toContain('getUser()');
    expect(source).not.toContain('updateUser({');
    expect(source).not.toMatch(/(?:sessionStorage|localStorage)\.getItem\([^)]*password/i);
    expect(source).not.toMatch(/password|contraseñ/i);
  });

  it('paid signup starts subscription as existing-user billing without carrying plaintext signup data', async () => {
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(completeSource).toContain('/auth/signup/account');
    expect(completeSource).not.toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);

    expect(subscriptionSource).toContain("fetch('/api/subscriptions/start'");
    expect(subscriptionSource).not.toMatch(/pending[_A-Za-z]*Signup|signup_intent|pending_signup_intent/);

    expect(startApiSource).not.toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
    expect(startApiSource).toContain('mode: "existing_user"');
    expect(startApiSource).toMatch(/business_type:\s*(?:businessType|effectiveBusinessType)/);
    expect(startApiSource).not.toMatch(/\bemail\s*[:,]/);
  });

  it('paid manual signup sends separately captured first and last name to account/business creation before subscription start', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {');

    expect(pageSource).toContain('name="nombre"');
    expect(pageSource).toContain('name="apellido"');
    expect(credentialsSource).toMatch(/nombre:\s*values\.nombre/);
    expect(credentialsSource).toMatch(/apellido:\s*values\.apellido/);
    expect(paidBranch).toContain('accountBusinessPayload');
    expect(paidBranch).toContain('billingUrl');
    expect(paidBranch).not.toMatch(/input\[name=["']name["']\]/);
    expect(paidBranch).not.toMatch(/nameParts|\.split\(['"]\s['"]\)|slice\(1\)\.join/);
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
    expect(completePlanSetup).not.toMatch(/pendingSignupIntent|signup_intent|pending_signup/i);
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

describe('RED contract: subscription start is existing-user/account-first only', () => {
  it('create-subscription supports existing-user/account-first subscription mode without relying on landing plaintext signup PII', async () => {
    const source = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const paidPlanSection = sliceBetween(source, '// 5. CREATE MERCADO PAGO PREAPPROVAL', '// Build MP preapproval request');
    const businessRequiredIndex = paidPlanSection.indexOf('BUSINESS_REQUIRED');

    expect(source).toMatch(/mode\s*===\s*"existing_user"|businesses[\s\S]{0,200}owner_id|account_first_intent|BUSINESS_REQUIRED/);
    expect(source).toMatch(/business_type|accountFirstBusinessType/);
    expect(businessRequiredIndex, 'paid start must retain a controlled no-business failure path').toBeGreaterThanOrEqual(0);
    expect(source).not.toMatch(/\bemail\s*:\s*body\.|pendingSignupEmail\s*=\s*body\./);
  });

  it('create-subscription delegates existing-user auth decisions to the shared helper', async () => {
    const createSubscriptionSource = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);
    const authHelperSource = await loadSource(CREATE_SUBSCRIPTION_AUTH_HELPER_PATH);
    const authHelperTestSource = await loadSource(CREATE_SUBSCRIPTION_AUTH_HELPER_TEST_PATH);
    const authSection = sliceBetween(
      createSubscriptionSource,
      '// 2. VERIFY USER AUTHENTICATION',
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
    expect(authHelperSource).toMatch(/export function shouldValidateCreateSubscriptionAuthorization/);
    expect(authHelperSource).toMatch(/if \(!authHeader\) return false/);
    expect(authHelperSource).toMatch(/if \(isSupabaseAnonBearer\(authHeader, supabaseAnonKey\)\) return false/);
    expect(authHelperSource).toMatch(/return true/);
    expect(createSubscriptionSource).toMatch(/mode\s*===\s*"existing_user"|businesses[\s\S]{0,200}owner_id|BUSINESS_REQUIRED/);

    expect(authHelperTestSource).toMatch(/existing-user mode with invalid Authorization/);
    expect(authHelperTestSource).toMatch(/mode: "existing_user"[\s\S]*assertEquals\(shouldValidate, true\)/);
  });

  it('BUSINESS_REQUIRED UI copy points account-first users back to account creation instead of pending signup recovery', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(subscriptionSource).toMatch(/existingUserBusinessRequired|existing_user_business_required|business_required_existing/i);
    expect(subscriptionSource).toMatch(/No pudimos preparar tu alta paga|alta paga|pago antes de crear tu cuenta/i);
    expect(`${subscriptionSource}\n${startApiSource}`).not.toMatch(/pendingSignupBusinessRequired|pending_signup_business_required|business_required_pending_signup/i);
    expect(startApiSource).toMatch(/business_required_existing|business_required_account_first_signup|account_first_signup_business_required/i);
  });
});

describe('RED contract: approved MercadoPago payment syncs account-first subscription state', () => {
  it('webhook syncs entitlements only after account-first business state exists', async () => {
    const webhookSource = await loadSource(MP_WEBHOOK_FN_PATH);
    const approvedSideEffects = sliceBetween(webhookSource, 'const shouldSyncEntitlements', '// =============================================================================\n    // 8. FINALIZE WEBHOOK EVENT');

    expect(approvedSideEffects).toMatch(/approved|active/);
    expect(approvedSideEffects).toMatch(/materializeAccountFirst|account_first/i);
    expect(approvedSideEffects).toContain('syncEntitlementsForBusiness');
    expect(webhookSource).toMatch(/materializeAccountFirst|validate_account_first_subscription_session|account_first_intents/i);
  });

  it('webhook validates account-first subscription session before syncing business subscription', async () => {
    const webhookSource = await loadSource(MP_WEBHOOK_FN_PATH);
    const accountFirstPath = sliceBetween(webhookSource, 'if (!subscription && webhookPaymentApproved)', '// =============================================================================\n    // 6. UPDATE BUSINESS SUBSCRIPTION');
    const validationIndex = accountFirstPath.indexOf('validate_account_first_subscription_session');
    const materializeIndex = accountFirstPath.indexOf('materializeAccountFirst');

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(accountFirstPath).toMatch(/p_external_reference/);
    expect(accountFirstPath).toMatch(/p_amount/);
    expect(accountFirstPath).toMatch(/p_currency/);
    expect(accountFirstPath).toMatch(/p_provider_subscription_id/);
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
