import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SIGNUP_CREDENTIALS_CONTROLLER = new URL('../lib/signup-access-page-controller.ts', import.meta.url);
const SIGNUP_CREDENTIALS_PAGE = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const LEGACY_ONBOARDING_PAGE = new URL('../pages/auth/signup/onboarding.astro', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);

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

describe('RED contract: payment-first signup happy path', () => {
  it('paid signup stores a protected pending signup intent and never creates auth/business/subscription before Mercado Pago approval', async () => {
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {');

    expect(paidBranch).toMatch(/createProtectedPendingSignupIntent|protected_pending_signup_intent|pendingSignupIntent/i);
    expect(paidBranch).toMatch(/sessionStorage\.setItem\(SIGNUP_STORAGE_KEYS\.pendingSignupIntent/);
    expect(paidBranch).toMatch(/\/billing\/subscription\?plan=/);

    expect(paidBranch, 'paid signup must not use the obsolete account-first session contract').not.toMatch(/account_first|accountFirst/i);
    expect(paidBranch, 'paid signup must not call signup/account creation before MP approval').not.toMatch(
      /signupWithProvider|createAccountAndBusiness|complete_signup_onboarding|create_business|finalizeFreeSignup|pending-intent\/finalize/i,
    );
  });

  it('landing subscription start forwards the protected pending signup intent to Mercado Pago and does not require an existing account/business', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startSource = await source(SUBSCRIPTION_START_API);
    const combined = `${subscriptionSource}\n${startSource}`;

    expect(combined).toMatch(/pendingSignupIntent|pending_signup_intent|protected_pending_signup_intent/i);
    expect(startSource).toMatch(/type\s+SubscriptionMode\s*=\s*["']pending_signup_intent["']\s*\|\s*["']existing_user["']/);
    expect(startSource).toMatch(/const\s+mode\s*:\s*SubscriptionMode\s*=\s*pendingSignupIntent\s*\?\s*["']pending_signup_intent["']\s*:\s*["']existing_user["']/);
    expect(startSource).toMatch(/\bmode\s*,/);
    expect(startSource).toMatch(/pending_signup_intent\s*:/);
    expect(startSource, 'payment-first start must not use account-first intent/session fields').not.toMatch(/account_first|accountFirst/i);
    expect(startSource, 'pending signup payment start must not map missing business as an existing-user auth failure').not.toMatch(
      /business_required_existing|ACCOUNT_FIRST_BUSINESS_REQUIRED|account_first_signup/i,
    );
  });

  it('free signup creates account/business/free active immediately after credentials and shows welcome login handoff without Mercado Pago', async () => {
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const pageSource = await source(SIGNUP_CREDENTIALS_PAGE);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const freeBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n    try {');

    const finalizeIndex = indexOfMatch(freeBranch, /finalizeFreeSignup|pending-intent\/finalize|createAccountAndBusiness|signupWithProvider/i);
    const welcomeIndex = indexOfMatch(`${freeBranch}\n${pageSource}`, /Welcome|Bienvenida|welcome.*login|freeSignupWelcomeModal|accountCreatedModal/i);

    expect(finalizeIndex, 'free signup must create account/business/free active in the credentials submit flow').toBeGreaterThanOrEqual(0);
    expect(welcomeIndex, 'free signup must show a welcome/login CTA after creation').toBeGreaterThan(finalizeIndex);
    expect(freeBranch, 'free signup must not defer creation to an extra rubro/onboarding happy-path step').not.toMatch(
      /showFreeRubroStep|attachFreeRubroFinalizer|\/auth\/signup\/onboarding|\/auth\/signup\/business-type/i,
    );
    expect(freeBranch, 'free signup must not touch Mercado Pago or pending paid intent state').not.toMatch(
      /\/billing\/subscription|Mercado\s*Pago|preapproval|pendingSignupIntent/i,
    );
  });

  it('duplicate email stops with a grey existing-account modal and login CTA before MP/account/business creation', async () => {
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const pageSource = await source(SIGNUP_CREDENTIALS_PAGE);
    const signupSources = `${pageSource}\n${controllerSource}`;

    const existingModalIndex = indexOfMatch(signupSources, /existingAccountModal|existing-account|cuenta existente|email.*registrad[oa]/i);
    const loginCtaIndex = indexOfMatch(signupSources, /existingAccountLogin|href=["']\/auth\/login["']|Iniciar sesi[oó]n/i);

    expect(existingModalIndex, 'duplicate email must render/show an existing-account modal').toBeGreaterThanOrEqual(0);
    expect(loginCtaIndex, 'duplicate modal must offer login CTA').toBeGreaterThan(existingModalIndex);
    expect(signupSources, 'duplicate email modal must use neutral/grey styling, not success/error coloring').toMatch(
      /existingAccountModal[\s\S]{0,1200}(?:bg-(?:slate|gray|neutral)|border-(?:slate|gray|neutral)|text-text-secondary)/i,
    );
    expect(signupSources, 'duplicate email must be handled before payment/account materialization side effects').toMatch(
      /signup_existing|EMAIL_EXISTS|already\s+(?:registered|exists)|email.*registrad[oa]/i,
    );
  });

  it('legacy onboarding can remain as compatibility but is not the signup happy path', async () => {
    const onboardingSource = await source(LEGACY_ONBOARDING_PAGE);
    const controllerSource = await source(SIGNUP_CREDENTIALS_CONTROLLER);
    const completeSource = await source(SIGNUP_COMPLETE_PAGE);

    expect(onboardingSource, 'legacy onboarding smoke: keep file available for old resumes/links').toMatch(/accountCreatedModal|onboarding/i);
    expect(`${controllerSource}\n${completeSource}`, 'new happy path must not route fresh signup completion through legacy onboarding').not.toMatch(
      /\/auth\/signup\/onboarding|account_created_modal=welcome_login/i,
    );
  });
});
