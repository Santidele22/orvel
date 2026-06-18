import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SIGNUP_PLAN_PAGE = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const SIGNUP_CREDENTIALS_PAGE = new URL('../pages/auth/signup/account.astro', import.meta.url);
const SIGNUP_CREDENTIALS_CONTROLLER = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const CREATE_ACCOUNT_BUSINESS_API = new URL('../pages/api/signup/create-account-business.ts', import.meta.url);
const CREATE_SUBSCRIPTION_FUNCTION = new URL('../../../../supabase/functions/create-subscription/index.ts', import.meta.url);
const MP_WEBHOOK_FUNCTION = new URL('../../../../supabase/functions/mercadopago-webhook/index.ts', import.meta.url);
const BUSINESS_SETTINGS_SCHEMA_REPAIR_MIGRATION = new URL(
  '../../../../supabase/migrations/20260618143000_repair_business_settings_signup_columns.sql',
  import.meta.url,
);

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
  const match = pattern.exec(sourceText);
  return match?.index ?? -1;
}

describe('RED contract: account-first signup creates the account/business before payment or login', () => {
  it('credentials page owns all required account and business fields, including rubro/category, in one screen', async () => {
    const pageSource = await source(SIGNUP_CREDENTIALS_PAGE);
    const planSource = await source(SIGNUP_PLAN_PAGE);
    const completeSource = await source(SIGNUP_COMPLETE_PAGE);

    for (const fieldName of ['nombre', 'apellido', 'email', 'password', 'negocioNombre']) {
      expect(pageSource, `credentials page must include required field: ${fieldName}`).toMatch(
        new RegExp(`name=["']${fieldName}["']`),
      );
    }

    expect(pageSource, 'credentials page must collect a phone number, either as one field or split area/local fields').toMatch(
      /name=["']telefono["']|name=["']telefonoCaracteristica["'][\s\S]*name=["']telefonoNumero["']/,
    );
    expect(pageSource, 'credentials page must collect password confirmation').toMatch(
      /name=["'](?:confirmPassword|confirm)["']/,
    );

    expect(pageSource, 'credentials page must collect business category/rubro before account creation').toMatch(
      /name=["'](?:rubro|business_category|business_type|tipoNegocio)["']/i,
    );
    expect(pageSource).toMatch(/Seleccion[aá].*(?:rubro|categor[ií]a|tipo de negocio)|Rubro|Categor[ií]a/i);
    expect(pageSource).toMatch(/required|aria-required=["']true["']/i);

    const preCredentialsSignupSources = `${planSource}\n${completeSource}`;
    expect(preCredentialsSignupSources, 'plan/complete pages must not own a separate business-category step').not.toContain('/auth/signup/business-type');
    expect(preCredentialsSignupSources, 'rubro/category is collected on credentials, not deferred to another page').not.toMatch(
      /name=["'](?:rubro|business_category|business_type|tipoNegocio)["']/i,
    );
  });

  it('paid flow creates Supabase account and business before redirecting to Mercado Pago', async () => {
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const subscriptionStartSource = await source(SUBSCRIPTION_START_API);
    const createSubscriptionSource = await source(CREATE_SUBSCRIPTION_FUNCTION);
    const webhookSource = await source(MP_WEBHOOK_FUNCTION);

    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {');
    const accountCreationIndex = indexOfMatch(paidBranch, /signupWithProvider|createAccountAndBusiness|complete_signup_onboarding|create_business/i);
    const mpRedirectIndex = indexOfMatch(paidBranch, /\/billing\/subscription|Mercado\s*Pago|preapproval/i);

    expect(accountCreationIndex, 'paid signup must create the user/account and business before MP').toBeGreaterThanOrEqual(0);
    expect(mpRedirectIndex, 'paid signup must still continue to Mercado Pago after account/business creation').toBeGreaterThan(accountCreationIndex);
    expect(paidBranch).toMatch(/(?:rubro|business_category|business_type|tipoNegocio)/i);

    const paidLandingStartupSources = `${subscriptionSource}\n${subscriptionStartSource}`;
    expect(paidLandingStartupSources, 'landing MP start must use the existing account/business created in credentials, not pending-signup PII materialization').not.toMatch(
      /pendingSignupIntent|pending_signup_intent|protected_pending_signup_intent|pending_signup/i,
    );
    expect(paidLandingStartupSources).toMatch(/mode:\s*["']existing_user["']|Authorization/);
    expect(createSubscriptionSource, 'MP function may keep legacy branches, but account-first paid start must support existing authenticated businesses').toMatch(
      /mode\s*===\s*["']existing_user["']|shouldValidateCreateSubscriptionAuthorization|businesses[\s\S]{0,200}owner_id/,
    );
    expect(webhookSource, 'MP webhook may keep legacy branches, but account-first paid start must use the account-first session path').toMatch(
      /materializeAccountFirst|validate_account_first_subscription_session|account_first_intents/i,
    );
  });

  it('account creation API has MVP-safe service-role abuse and compensation guards', async () => {
    const apiSource = await source(CREATE_ACCOUNT_BUSINESS_API);

    expect(apiSource).toMatch(/isRateLimited\(|RATE_LIMIT_EXCEEDED/);
    expect(apiSource).toMatch(/getCanonicalIdempotencyKey|idempotency/i);
    expect(apiSource).toMatch(/email_confirm:\s*false/);
    expect(apiSource).not.toMatch(/email_confirm:\s*true/);
    expect(apiSource).toMatch(/signup_existing_or_created/);
    const successResponse = sliceBetween(apiSource, 'return jsonResponse({\n    ok: true', '\n  });\n};');
    expect(successResponse).not.toMatch(/user_id\s*:|business_id\s*:/);
    expect(apiSource).toMatch(/cleanupProvisioning\(/);
    expect(apiSource).toMatch(/auth\.admin\.deleteUser/);
    expect(apiSource).toMatch(/status:\s*subscriptionStatus/);
    expect(apiSource).toMatch(/subscriptionStatus\s*=\s*isPaidPlan\s*\?\s*["']pending_payment["']/);
    expect(apiSource, 'paid account-first signup must mint a short-lived account-first session instead of requiring immediate email/password login').toMatch(
      /account_first_intents[\s\S]{0,900}idempotency_key_hash/,
    );
    expect(apiSource).toMatch(/account_first_intent_id/);
    expect(apiSource).toMatch(/account_first_session/);
    const businessInsertBlock = sliceBetween(apiSource, 'from("businesses").insert({', '\n  });\n  if (businessError)');
    expect(businessInsertBlock, 'businesses insert must only use columns present in the production schema').not.toMatch(/is_active\s*:/);
    expect(apiSource).toMatch(/onboardingStep\s*=\s*isPaidPlan\s*\?\s*["']payment_pending["']/);
  });

  it('account creation API only upserts business_settings columns guaranteed on upgraded production schemas', async () => {
    const apiSource = await source(CREATE_ACCOUNT_BUSINESS_API);
    const repairMigrationSource = await source(BUSINESS_SETTINGS_SCHEMA_REPAIR_MIGRATION);

    const settingsUpsertBlock = sliceBetween(apiSource, 'from("business_settings").upsert({', '\n  });\n  if (settingsError)');

    for (const columnName of ['business_name', 'slug', 'support_phone']) {
      expect(settingsUpsertBlock, `signup settings upsert must write ${columnName}`).toMatch(
        new RegExp(`\\b${columnName}\\b`),
      );
      expect(
        repairMigrationSource,
        `upgraded databases created by the older 20260420 business_settings table must explicitly add ${columnName}`,
      ).toMatch(new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${columnName}\\b`, 'i'));
    }
  });

  it('free flow creates account/business on credentials and shows welcome before any login redirect without touching Mercado Pago', async () => {
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const credentialsPageSource = await source(SIGNUP_CREDENTIALS_PAGE);
    const completeSource = await source(SIGNUP_COMPLETE_PAGE);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n\n    try {');

    expect(freeBranch).toMatch(/signupWithProvider|createAccountAndBusiness/i);
    expect(freeBranch).toMatch(/complete_signup_onboarding|create_business|business_type|tipoNegocio|rubro/i);
    expect(freeBranch).not.toMatch(/\/billing\/subscription|Mercado\s*Pago|preapproval/i);

    const accountCreatedUiSources = `${credentialsPageSource}\n${completeSource}\n${controllerSource}`;
    expect(accountCreatedUiSources).toContain('id="accountCreatedModal"');
    expect(accountCreatedUiSources).toContain('id="accountCreatedContinue"');
    expect(accountCreatedUiSources).toMatch(/showAccountCreatedModal\(\)|accountCreatedModal[\s\S]{0,240}classList\.remove\(['"]hidden['"]\)/);
    expect(accountCreatedUiSources).toMatch(/accountCreatedContinue[\s\S]{0,240}href=["']\/auth\/login["']|safeLoginUrl/);
  });

  it('paid flow stores account-first session and goes to subscription start without sign-in before email confirmation', async () => {
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const subscriptionStartSource = await source(SUBSCRIPTION_START_API);
    const createSubscriptionSource = await source(CREATE_SUBSCRIPTION_FUNCTION);

    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {');

    expect(paidBranch).toMatch(/account_first_session|accountFirstSession/);
    expect(paidBranch, 'paid signup must not sign in immediately because production email confirmation returns email_not_confirmed').not.toMatch(
      /loginWithProvider|createSupabaseLoginAdapterFromEnv/,
    );
    expect(subscriptionSource).toMatch(/accountFirstSession|account_first_session/);
    expect(subscriptionStartSource).toMatch(/account_first_intent_id|account_first_session/);
    expect(createSubscriptionSource).toMatch(/account_first_intents/);
    expect(createSubscriptionSource).toMatch(/mode\s*===\s*["']account_first_signup["']|account_first_session/);
  });

  it('welcome modal is the only login handoff gate and login navigation happens after the explicit welcome action', async () => {
    const credentialsPageSource = await source(SIGNUP_CREDENTIALS_PAGE);
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const completeSource = await source(SIGNUP_COMPLETE_PAGE);
    const signupSources = `${credentialsPageSource}\n${controllerSource}\n${completeSource}`;

    const modalIndex = signupSources.indexOf('accountCreatedModal');
    const continueIndex = signupSources.indexOf('accountCreatedContinue');
    expect(modalIndex, 'signup flow must render/show the welcome modal before login').toBeGreaterThanOrEqual(0);
    expect(continueIndex, 'welcome modal must expose an explicit continue-to-login action').toBeGreaterThan(modalIndex);

    expect(signupSources, 'signup completion must not auto-redirect to login before the welcome action').not.toMatch(
      /(?:window\.location\.(?:href|assign)|Astro\.redirect|location\.replace)\([^\n]*(?:\/auth\/login|safeLoginUrl)/i,
    );
    expect(signupSources).toMatch(/id=["']accountCreatedContinue["'][\s\S]{0,260}href=["']\/auth\/login["']|continueLink\.href\s*=\s*safeLoginUrl/);
  });
});
