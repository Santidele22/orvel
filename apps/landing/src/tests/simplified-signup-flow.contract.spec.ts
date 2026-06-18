import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const LANDING_INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/account.astro', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
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

describe('Contract: simplified launch signup flow', () => {
  it('plan and completion handoff do not own a separate business-type/service selector', async () => {
    const preAccountSignupSources = [
      await loadSource(LANDING_INDEX_PATH),
      await loadSource(PLAN_PAGE_PATH),
      await loadSource(COMPLETE_PAGE_PATH)
    ].join('\n');

    expect(preAccountSignupSources).not.toContain('/auth/signup/business-type');
    expect(preAccountSignupSources).not.toMatch(/name=["'](?:rubro|business_type|service_type|tipoNegocio)["']/i);
    expect(preAccountSignupSources).not.toMatch(/Seleccion[aá].*(categor[ií]as|rubro|servicio|tipo de negocio)/i);
  });

  it('account screen owns required credentials, business, and rubro/category before Mercado Pago', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_PAGE_PATH);

    for (const fieldName of ['nombre', 'apellido', 'email', 'password', 'negocioNombre']) {
      expect(credentialsSource, `account page must include required field: ${fieldName}`).toMatch(
        new RegExp(`name=["']${fieldName}["']`),
      );
    }
    expect(credentialsSource).toMatch(/name=["']telefono["']|name=["']telefonoCaracteristica["'][\s\S]*name=["']telefonoNumero["']/);
    expect(credentialsSource).toMatch(/name=["'](?:confirmPassword|confirm)["']/);
    expect(credentialsSource).toMatch(/name=["'](?:rubro|business_category|business_type|tipoNegocio)["']/i);
    expect(credentialsSource).toMatch(/Seleccion[aá].*(?:rubro|categor[ií]a|tipo de negocio)|Rubro|Categor[ií]a/i);
    expect(credentialsSource).toMatch(/required|aria-required=["']true["']/i);
  });

  it('subscription start uses the authenticated account/business instead of pending signup PII', async () => {
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);
    const createSubscriptionSource = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);

    expect(startApiSource).toContain('request.headers.get("Authorization")');
    expect(startApiSource).toContain('appendSupabaseAuthorizationHeader(headers, authorization, supabaseAnonKey)');
    expect(startApiSource).toContain('mode: "existing_user"');
    expect(startApiSource).toMatch(/business_type:\s*effectiveBusinessType|businessType/);
    expect(startApiSource).not.toMatch(/pendingSignupIntent|pending_signup_intent|protected_pending_signup_intent|pending_signup/i);
    expect(startApiSource).not.toContain('email,');
    expect(createSubscriptionSource).toMatch(/shouldValidateCreateSubscriptionAuthorization|mode\s*===\s*["']existing_user["']/);
    expect(createSubscriptionSource).toMatch(/\.from\(["']businesses["']\)[\s\S]{0,240}\.eq\(["']owner_id["'],\s*user\.id\)/);
  });

  it('Mercado Pago approval can reconcile account-first sessions without marking onboarding dashboard-ready', async () => {
    const webhookSource = await loadSource(MP_WEBHOOK_FN_PATH);
    const accountFirstBody = sliceBetween(webhookSource, 'async function materializeAccountFirst', 'async function materializePendingSignup');

    expect(webhookSource).toMatch(/materializeAccountFirst|account_first_intents|validate_account_first_subscription_session/i);
    expect(accountFirstBody).toMatch(/account_first_intents/);
    expect(accountFirstBody).toMatch(/business_onboarding_state/);
    expect(accountFirstBody).toMatch(/onboarding_required\s*:\s*true|onboarding_completed\s*:\s*false|onboardingCompleted\s*:\s*false|current_step\s*:\s*["']onboarding_required["']/);
    expect(accountFirstBody).not.toMatch(/onboarding_completed\s*:\s*true|onboardingCompleted\s*:\s*true/);
    expect(accountFirstBody).not.toMatch(/dashboard_ready_at\s*:|current_step\s*:\s*['"]dashboard_ready['"]/);
  });

  it('paid subscription polling routes materialized accounts through landing-owned onboarding instead of dashboard home', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(subscriptionSource).toMatch(/materialized|account_materialized/i);
    // Approved/materialized paid accounts continue through landing-owned onboarding first.
    expect(subscriptionSource).toContain('/auth/signup/onboarding');
    expect(subscriptionSource).toContain("onboardingUrl.searchParams.set('source', 'subscription')");
    expect(subscriptionSource).not.toMatch(/materialized[\s\S]{0,1200}\/dashboard\/inicio/);
  });
});
