import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/account.astro', import.meta.url);
const SIGNUP_PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: signup credentials require an explicit valid plan before account creation', () => {
  it('credentials page 302-redirects into dashboard in-app signup instead of hosting the account form', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);

    expect(pageSource).toContain("import { buildInAppAuthRedirect } from '../../../lib/in-app-auth-redirect'");
    expect(pageSource).toContain("buildInAppAuthRedirect(Astro.url, 'signup', import.meta.env.PUBLIC_DASHBOARD_URL)");
    expect(pageSource).toMatch(/Astro\.redirect\([\s\S]*302/);
    expect(pageSource).not.toContain('initSignupAccountPage');
    expect(pageSource).not.toContain('accountForm');
  });

  it('credentials page does not host the account form after in-app auth redirect', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);

    expect(source).toMatch(/buildInAppAuthRedirect/);
    expect(source).toMatch(/Astro\.redirect\([\s\S]*302/);
    expect(source).not.toMatch(/<form[^>]*id=["']accountForm["']/);
    expect(source).not.toContain('initSignupAccountPage');
  });
});

describe('RED contract: plan-selection redirect notice is reusable and not missing-account-only', () => {
  it('exposes a generic redirect notice that can serve missing_account, missing_plan, and invalid_plan create-account flows', async () => {
    const source = await loadSource(SIGNUP_PLAN_CARDS_PATH);

    expect(source).toMatch(/showRedirectNotice|openRedirectNotice|createRedirectNoticeController/);
    expect(source).toMatch(/redirect-notice/);
    expect(source).toMatch(/missing_account/);
    expect(source).toMatch(/missing_plan/);
    expect(source).toMatch(/invalid_plan/);
    expect(source).toMatch(/Primero eleg[ií] un plan/i);
    expect(source).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(source).toContain('/auth/signup/plan?reason=invalid_plan&intent=create_account');
    expect(source).toMatch(/setTimeout\([\s\S]{0,400}(?:5000|5\s*\*\s*1000)/);
    expect(source).toMatch(/continue|continuar/i);
    expect(source).not.toMatch(/function\s+showMissingAccountNotice|id="missing-account-create-account-notice"/);
  });

  it('plan selection can resume a pending credentials-first flow from a protected intent without plaintext PII in sessionStorage', async () => {
    const source = await loadSource(SIGNUP_PLAN_CARDS_PATH);

    expect(source).toMatch(/pendingCredentialsFirst|credentials_first|SIGNUP_STORAGE_KEYS\.pendingSignupIntent|intent_id/);
    expect(source).toMatch(/hasPendingCredentialsFirst|isPendingCredentialsFirst|resumePendingCredentialsFirst/);
    expect(source).toContain('/auth/signup/credentials?plan=');
    expect(source).toMatch(/resume=(?:credentials_first|pending_credentials)|credentials_first=true|pending_credentials=true/);
    expect(source).not.toMatch(/sessionStorage\.getItem\(\s*SIGNUP_STORAGE_KEYS\.(?:nombre|apellido|negocioNombre|telefono|email)/);
    expect(source).not.toMatch(/sessionStorage\.setItem\(\s*SIGNUP_STORAGE_KEYS\.(?:nombre|apellido|negocioNombre|telefono|email)/);
    expect(source).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv|loginWithGoogle/);
  });
});
