import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-access-page-controller.ts', import.meta.url);
const PENDING_INTENT_FINALIZE_PATH = new URL('../pages/api/signup/pending-intent/finalize.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function indexOfOrThrow(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect(index, `Expected source to contain marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return index;
}

function sliceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Feature B contract: plan handoff before account creation', () => {
  it('plan page accepts every create-account redirect reason before letting users choose a plan', async () => {
    const source = `${await loadSource(PLAN_PAGE_PATH)}\n${await loadSource(PLAN_CARDS_PATH)}`;

    expect(source).toMatch(/intent['"]?\)?\s*!==\s*['"]create_account['"]|intent\)\s*===\s*['"]create_account['"]|create_account/);
    for (const reason of ['missing_account', 'missing_plan', 'invalid_plan']) {
      expect(source).toMatch(new RegExp(`reason(?:\\s*===|[^\\n]+includes)[^\\n]+['"]${reason}['"]|['"]${reason}['"][^\\n]+(?:reason|includes)`));
    }
    expect(source).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(source).toContain('/auth/signup/plan?reason=invalid_plan&intent=create_account');
    expect(source).toMatch(/setTimeout\([\s\S]{0,400}(?:5000|5\s*\*\s*1000)/);
    expect(source).toMatch(/continue|continuar/i);
  });

  it('selecting a valid plan carries the explicit plan to credentials instead of bouncing back to plan selection', async () => {
    const source = `${await loadSource(PLAN_PAGE_PATH)}\n${await loadSource(PLAN_CARDS_PATH)}\n${await loadSource(PLAN_CARD_PATH)}`;

    for (const plan of ['FREE', 'STARTER', 'GROWTH', 'PRO']) {
      expect(source).toContain('data-plan-code={plan.code}');
      expect(source).toContain('/auth/signup/credentials?plan=');
      expect(source).toMatch(new RegExp(`plan=\\$\\{[^}]+\\}|planCode|plan\\.code|${plan}`));
    }

    expect(source).not.toMatch(/window\.location\.(?:href|assign)\s*=\s*['"`]\/auth\/signup\/plan/);
  });

  it('credentials page treats missing or invalid plan as a hard boundary before account finalization', async () => {
    const source = `${await loadSource(CREDENTIALS_PAGE_PATH)}\n${await loadSource(CREDENTIALS_CONTROLLER_PATH)}`;
    const planResolution = source.match(/const\s+plan\s*=\s*[^;]+;/)?.[0] ?? '';

    expect(planResolution, 'Missing plan must not silently default to FREE because that creates accounts without an explicit plan selection.').not.toContain("|| 'FREE'");
    expect(source).toMatch(/VALID_SIGNUP_PLANS|isValidSignupPlan|assertValidSignupPlan/);
    expect(source).toMatch(/protected_pending_signup_intent|intent_id|\/api\/signup\/pending-intent\/protect/);
    expect(source).toMatch(/\/auth\/signup\/plan\?[^`'"\n]*(?:reason=missing_plan|reason=invalid_plan|plan_error=)/);
    const missingPlanBranch = source.slice(source.indexOf('if (!hasValidSignupPlan)'), source.indexOf('if (!validateForm() || !button)'));
    expect(missingPlanBranch).toMatch(/createProtectedPendingSignupIntent|protected_pending_signup_intent|intent_id|\/api\/signup\/pending-intent\/protect/);
    expect(missingPlanBranch).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv|\/api\/signup\/pending-intent\/finalize/);
  });

  it('credentials submit validates required fields before protecting data or creating a free account', async () => {
    const source = `${await loadSource(CREDENTIALS_PAGE_PATH)}\n${await loadSource(CREDENTIALS_CONTROLLER_PATH)}`;
    const submitFlow = sliceBetween(source, "form.addEventListener('submit'", '\n  });\n}');

    const validateMissingPlanIndex = indexOfOrThrow(submitFlow, 'if (!validateNonSensitiveCredentials()) return;');
    const validateFormIndex = indexOfOrThrow(submitFlow, 'if (!validateForm() || !button) return;');
    const protectIndex = indexOfOrThrow(submitFlow, 'await createProtectedPendingSignupIntent');
    const freeCreateIndex = indexOfOrThrow(submitFlow, 'createAndfinalizeFreeSignup({');
    const planGuardIndex = Math.max(
      source.indexOf('VALID_SIGNUP_PLANS'),
      source.indexOf('isValidSignupPlan'),
      source.indexOf('assertValidSignupPlan')
    );

    expect(planGuardIndex).toBeGreaterThanOrEqual(0);
    expect(validateMissingPlanIndex).toBeLessThan(protectIndex);
    expect(validateFormIndex).toBeLessThan(freeCreateIndex);
    expect(source).toContain('plan');
    expect(source).toMatch(/freeSignupWelcomeModal|finalizeFreeSignup|SIGNUP_STORAGE_KEYS\.pendingSignupIntent/);
    expect(source).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv/);
  });

  it('pending-intent finalize is the account creation boundary and rejects non-FREE before Supabase signup', async () => {
    const source = await loadSource(PENDING_INTENT_FINALIZE_PATH);
    const planGuardIndex = indexOfOrThrow(source, "FREE_SIGNUP_PLAN = 'FREE'");
    const rejectionIndex = indexOfOrThrow(source, 'pending_signup_finalize_free_plan_only');
    const adapterIndex = indexOfOrThrow(source, 'createSupabaseSignupAdapter({');

    expect(source).toMatch(/normalizeRequestedPlanCode\(body\?\.plan_code\)\s*!==\s*FREE_SIGNUP_PLAN/);
    expect(planGuardIndex).toBeLessThan(rejectionIndex);
    expect(rejectionIndex).toBeLessThan(adapterIndex);
    expect(source).toMatch(/plan:\s*FREE_SIGNUP_PLAN/);
    expect(source).not.toMatch(/\b(?:STARTER|GROWTH|PRO)\b|createSubscription|mercadopago/i);
  });

  it('signup plan handoff does not expose Google auth as a user-facing account creation path', async () => {
    const planSource = `${await loadSource(PLAN_PAGE_PATH)}\n${await loadSource(PLAN_CARDS_PATH)}`;
    const credentialsSource = await loadSource(CREDENTIALS_PAGE_PATH);

    expect(planSource).toMatch(/missing_account/);
    expect(planSource).toMatch(/create_account/);
    expect(planSource).toContain('/auth/signup/credentials?plan=');
    expect(credentialsSource).not.toContain('id="googleSignupBtn"');
    expect(credentialsSource).not.toContain("id='googleSignupBtn'");
    expect(credentialsSource).not.toMatch(/Registrarse\s+con\s+Google|Google disponible|Google estar[aá] disponible/i);
    expect(credentialsSource).not.toContain("document.getElementById('googleSignupBtn')");
  });

  it('signup credentials never renders or invokes Supabase Google OAuth from the user-facing page', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_PAGE_PATH);

    expect(
      credentialsSource,
      'Google signup from credentials must not call loginWithGoogle because Orvel owns email/password signup for now.'
    ).not.toContain('loginWithGoogle');
    expect(credentialsSource).not.toContain('createSupabaseOAuthAdapter');
    expect(credentialsSource).not.toContain('signInWithOAuth');
    expect(credentialsSource).not.toContain("document.getElementById('googleSignupBtn')?.addEventListener('click'");
    expect(credentialsSource).not.toContain('id="googleSignupNotice"');
    expect(credentialsSource).not.toMatch(/<svg[\s\S]{0,1200}Google|Google[\s\S]{0,1200}<svg/i);
    expect(credentialsSource).not.toContain('Registrarse con Google');
  });
});
