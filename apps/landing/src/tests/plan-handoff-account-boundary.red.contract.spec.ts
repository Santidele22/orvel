import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const PENDING_INTENT_FINALIZE_PATH = new URL('../pages/api/signup/pending-intent/finalize.ts', import.meta.url);

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

  it('credentials page 302s into dashboard in-app signup instead of owning plan/account finalization', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);

    expect(source).toMatch(/buildInAppAuthRedirect/);
    expect(source).toMatch(/Astro\.redirect/);
    expect(source).not.toContain("|| 'FREE'");
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
    expect(source).not.toMatch(/\b(?:STARTER|GROWTH|PRO)\b|createSubscription/i);
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
