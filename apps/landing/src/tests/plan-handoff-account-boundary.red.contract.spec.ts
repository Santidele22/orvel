import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function indexOfOrThrow(source: string, marker: string): number {
  const index = source.indexOf(marker);
  expect(index, `Expected source to contain marker: ${marker}`).toBeGreaterThanOrEqual(0);
  return index;
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

  it('credentials page treats missing or invalid plan as a hard boundary before Supabase signup', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);
    const planResolution = source.match(/const\s+plan\s*=\s*[^;]+;/)?.[0] ?? '';

    expect(planResolution, 'Missing plan must not silently default to FREE because that creates accounts without an explicit plan selection.').not.toContain("|| 'FREE'");
    expect(source).toMatch(/VALID_SIGNUP_PLANS|isValidSignupPlan|assertValidSignupPlan/);

    const validationIndex = Math.max(
      source.indexOf('VALID_SIGNUP_PLANS'),
      source.indexOf('isValidSignupPlan'),
      source.indexOf('assertValidSignupPlan')
    );
    const adapterIndex = indexOfOrThrow(source, 'createSupabaseSignupAdapterFromEnv');
    const signupIndex = indexOfOrThrow(source, 'signupWithProvider({');

    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeLessThan(adapterIndex);
    expect(validationIndex).toBeLessThan(signupIndex);
    expect(source).toMatch(/\/auth\/signup\/plan\?[^`'"\n]*(?:reason=missing_plan|reason=invalid_plan|plan_error=)/);
  });

  it('Supabase signup is only reachable for a valid explicit plan and valid required fields', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);

    const validateFormIndex = indexOfOrThrow(source, 'if (!validateForm())');
    const planGuardIndex = Math.max(
      source.indexOf('VALID_SIGNUP_PLANS'),
      source.indexOf('isValidSignupPlan'),
      source.indexOf('assertValidSignupPlan')
    );
    const signupIndex = indexOfOrThrow(source, 'signupWithProvider({');

    expect(validateFormIndex).toBeLessThan(signupIndex);
    expect(planGuardIndex).toBeGreaterThanOrEqual(0);
    expect(planGuardIndex).toBeLessThan(signupIndex);
    expect(source).toContain('plan,');
    expect(source).toContain('returnTo: nextStep');
  });

  it('Google/auth missing-plan path routes to plan-first account creation and never creates Supabase account directly', async () => {
    const planSource = `${await loadSource(PLAN_PAGE_PATH)}\n${await loadSource(PLAN_CARDS_PATH)}`;
    const credentialsSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const googleHandlerStart = indexOfOrThrow(
      credentialsSource,
      "document.getElementById('googleSignupBtn')?.addEventListener('click'"
    );
    const googleHandler = credentialsSource.slice(googleHandlerStart);

    expect(planSource).toMatch(/missing_account/);
    expect(planSource).toMatch(/create_account/);
    expect(planSource).toContain('/auth/signup/credentials?plan=');
    expect(googleHandler).not.toContain('signupWithProvider({');
    expect(googleHandler).not.toContain('createSupabaseSignupAdapterFromEnv');
  });

  it('signup credentials Google OAuth stays behind a valid explicit plan gate and carries that plan', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const googleHandlerStart = indexOfOrThrow(
      credentialsSource,
      "document.getElementById('googleSignupBtn')?.addEventListener('click'"
    );
    const googleHandler = credentialsSource.slice(googleHandlerStart);
    const planGuardIndex = indexOfOrThrow(googleHandler, 'if (!hasValidSignupPlan)');
    const importIndex = indexOfOrThrow(googleHandler, "await import('../../../lib/auth-provider')");
    const oauthIndex = indexOfOrThrow(googleHandler, 'loginWithGoogle({');

    expect(planGuardIndex).toBeLessThan(importIndex);
    expect(planGuardIndex).toBeLessThan(oauthIndex);
    expect(googleHandler).toContain("openRedirectNotice();\n        return;");
    expect(googleHandler).toContain('sessionStorage.setItem(SIGNUP_STORAGE_KEYS.plan, plan)');
    expect(googleHandler).toContain("redirectUrl.searchParams.set('plan', plan)");
    expect(googleHandler).toContain('loginWithGoogle({ redirectTo: redirectUrl.toString(), plan })');
  });
});
