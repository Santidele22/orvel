import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const SIGNUP_PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);

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

describe('RED contract: signup credentials require an explicit valid plan before account creation', () => {
  it('credentials flow treats missing or invalid plan as missing_plan before building signup state', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);
    const planSetup = sliceBetween(source, 'const searchParams = new URLSearchParams', 'const passwordFields');

    expect(planSetup).toMatch(/VALID_SIGNUP_PLANS|VALID_PLAN_CODES|ALLOWED_SIGNUP_PLANS|allowedSignupPlans/);
    expect(planSetup).toMatch(/hasValidSignupPlan|isValidSelectedPlan|selectedPlanIsValid/);
    expect(planSetup).toMatch(/missing_plan/);
    expect(planSetup).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(planSetup).not.toMatch(/const\s+plan\s*=\s*\([^\n]+\|\|\s*['"]FREE['"]/);
  });

  it('redirects with a fixed overlay informative notice instead of continuing when the plan is absent or invalid', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);
    const beforeSubmit = sliceBetween(source, 'const searchParams = new URLSearchParams', "form.addEventListener('submit'");
    const noticeMarkup = sliceBetween(source, 'id="create-account-redirect-notice"', '</div>\n\n      </div>');

    expect(beforeSubmit).toMatch(/Primero eleg[ií] un plan/i);
    expect(beforeSubmit).toMatch(/showRedirectNotice|openRedirectNotice|redirectNotice/);
    expect(beforeSubmit).toMatch(/setTimeout\([\s\S]{0,400}(?:5000|5\s*\*\s*1000)/);
    expect(beforeSubmit).toMatch(/continue|continuar/i);
    expect(beforeSubmit).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(beforeSubmit).toContain('/auth/signup/plan?reason=invalid_plan&intent=create_account');
    expect(noticeMarkup).toMatch(/class="[^"]*fixed[^"]*inset-0[^"]*z-\d+/);
    expect(noticeMarkup).toMatch(/\[&:not\(\.hidden\)\]:flex|items-center\s+justify-center|justify-center\s+items-center/);
    expect(noticeMarkup).toMatch(/role="(?:status|dialog)"/);
    expect(noticeMarkup).toMatch(/aria-live="polite"/);
    expect(noticeMarkup).not.toMatch(/class="[^"]*\bmt-\d+/);
    expect(beforeSubmit).not.toMatch(/window\.location\.(?:href|assign)\s*=\s*['"][^'"]*\/auth\/signup\/plan['"]/);
  });

  it('does not reach Supabase signup or OAuth creation calls until the selected plan is valid', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);
    const firstAccountCreationIndex = Math.min(
      source.indexOf('const supabaseSignup = createSupabaseSignupAdapterFromEnv'),
      source.indexOf('await signupWithProvider'),
      source.indexOf("await import('../../../lib/auth-provider')")
    );
    expect(firstAccountCreationIndex).toBeGreaterThan(0);

    const beforeAccountCreation = source.slice(0, firstAccountCreationIndex);
    expect(beforeAccountCreation).toMatch(/hasValidSignupPlan|isValidSelectedPlan|selectedPlanIsValid/);
    expect(beforeAccountCreation).toMatch(/missing_plan/);
    expect(beforeAccountCreation).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
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
});
