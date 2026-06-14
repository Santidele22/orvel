import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const SIGNUP_CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-credentials-page-controller.ts', import.meta.url);
const SIGNUP_CREDENTIALS_VALIDATION_PATH = new URL('../lib/signup-credentials-validation.ts', import.meta.url);
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
  it('credentials page delegates behavior to the signup credentials page controller without inline implementation', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const inlineScript = sliceBetween(pageSource, '<script>', '</script>');

    expect(inlineScript).toContain("import { initSignupCredentialsPage } from '../../../lib/signup-credentials-page-controller'");
    expect(inlineScript).toMatch(/initSignupCredentialsPage\(import\.meta\.env\)/);
    expect(inlineScript).not.toMatch(/new URLSearchParams|form\.addEventListener|validateSignupCredentials|signupWithProvider|createSupabaseSignupAdapterFromEnv/);
  });

  it('credentials flow treats missing or invalid plan as missing_plan before building signup state', async () => {
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const planSetup = sliceBetween(source, 'const searchParams = new URLSearchParams', 'const passwordFields');

    expect(source).toMatch(/VALID_SIGNUP_PLANS|VALID_PLAN_CODES|ALLOWED_SIGNUP_PLANS|allowedSignupPlans/);
    expect(planSetup).toMatch(/hasValidSignupPlan|isValidSelectedPlan|selectedPlanIsValid/);
    expect(planSetup).toMatch(/missing_plan/);
    expect(planSetup).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(planSetup).not.toMatch(/const\s+plan\s*=\s*\([^\n]+\|\|\s*['"]FREE['"]/);
  });

  it('redirects with a fixed overlay informative notice instead of continuing when the plan is absent or invalid', async () => {
    const pageSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const controllerSource = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const beforeSubmit = sliceBetween(controllerSource, 'const searchParams = new URLSearchParams', "form.addEventListener('submit'");
    const noticeMarkup = sliceBetween(pageSource, 'id="create-account-redirect-notice"', '</div>\n\n      </div>');

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
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const accountCreationIndexes = [
      source.indexOf('const supabaseSignup = createSupabaseSignupAdapterFromEnv'),
      source.indexOf('await signupWithProvider'),
      source.indexOf("await import('./auth-provider')")
    ].filter((index) => index >= 0);
    expect(accountCreationIndexes.length).toBeGreaterThan(0);
    const firstAccountCreationIndex = Math.min(...accountCreationIndexes);
    expect(firstAccountCreationIndex).toBeGreaterThan(0);

    const beforeAccountCreation = source.slice(0, firstAccountCreationIndex);
    expect(beforeAccountCreation).toMatch(/hasValidSignupPlan|isValidSelectedPlan|selectedPlanIsValid/);
    expect(beforeAccountCreation).toMatch(/missing_plan/);
    expect(beforeAccountCreation).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
  });

  it('credentials-first submit protects a pending intent before sending the user to plan selection', async () => {
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(source, "form.addEventListener('submit'", '\n  });\n}');
    const missingPlanBranch = sliceBetween(submitFlow, 'if (!hasValidSignupPlan)', 'if (!validateForm()');

    expect(missingPlanBranch).toMatch(/fetch\(['"]\/api\/signup\/pending-intent\/protect['"]|createProtectedPendingSignupIntent|protected_pending_signup_intent|intent_id/);
    expect(missingPlanBranch).toMatch(/await\s+(?:fetch|createProtectedPendingSignupIntent)|\.then\(/);
    expect(missingPlanBranch).toContain('SIGNUP_STORAGE_KEYS.pendingSignupIntent');
    expect(missingPlanBranch).toMatch(/sessionStorage\.setItem\(\s*SIGNUP_STORAGE_KEYS\.pendingSignupIntent/);
    expect(source).toMatch(/protected_pending_signup_intent|intent_id|email_encrypted/);
    expect(missingPlanBranch).toMatch(/missing_plan/);
    expect(source).toContain('/auth/signup/plan?reason=missing_plan&intent=create_account');
    expect(missingPlanBranch).not.toMatch(/sessionStorage\.setItem\(\s*SIGNUP_STORAGE_KEYS\.(?:nombre|apellido|negocioNombre|telefono|email)/);
    expect(missingPlanBranch).not.toMatch(/sessionStorage\.setItem\([^)]*(?:name|nombre|apellido|negocioNombre|telefono|phone|email)[^)]*(?:\.value|JSON\.stringify\([^)]*(?:email|phone|telefono|negocioNombre))/i);
    expect(missingPlanBranch).not.toMatch(/password|confirmPassword/);
    expect(missingPlanBranch).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv|loginWithGoogle/);
  });

  it('credentials-first redirect branch validates required non-sensitive fields but never validates or persists password', async () => {
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(source, "form.addEventListener('submit'", '\n  });\n}');
    const missingPlanBranch = sliceBetween(submitFlow, 'if (!hasValidSignupPlan)', 'if (!validateForm()');

    expect(missingPlanBranch).toMatch(/validatePendingCredentialsFirst|validateNonSensitiveCredentials|validateForm\([^)]*credentialsFirst/);
    for (const field of ['nombre', 'apellido', 'negocioNombre', 'telefonoCaracteristica', 'telefonoNumero', 'email']) {
      expect(source).toMatch(new RegExp(field));
    }
    expect(missingPlanBranch).not.toMatch(/['"]name['"]|input\[name=["']name["']\]/);
    expect(missingPlanBranch).not.toMatch(/password|confirmPassword|contraseñ/i);
  });

  it('credentials form captures first and last name as separate required fields instead of a full-name field', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);
    const formMarkup = sliceBetween(source, '<form id="credentialsForm"', '</form>');

    expect(formMarkup).toMatch(/name=["']nombre["']/);
    expect(formMarkup).toMatch(/name=["']apellido["']/);
    expect(formMarkup).toMatch(/id=["']nombre["']/);
    expect(formMarkup).toMatch(/id=["']apellido["']/);
    expect(formMarkup).toMatch(/name=["']nombre["'][^>]*required|required[^>]*name=["']nombre["']/);
    expect(formMarkup).toMatch(/name=["']apellido["'][^>]*required|required[^>]*name=["']apellido["']/);
    expect(formMarkup).toMatch(/Nombre/i);
    expect(formMarkup).toMatch(/Apellido/i);

    expect(formMarkup).not.toMatch(/name=["']name["']/);
    expect(formMarkup).not.toMatch(/id=["']name["']/);
    expect(formMarkup).not.toMatch(/Nombre\s+Completo|Nombre y Apellido/i);
  });

  it('credentials validation treats first and last name as independent required fields', async () => {
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const validationSource = await loadSource(SIGNUP_CREDENTIALS_VALIDATION_PATH);
    const validatorsSection = sliceBetween(source, 'const validators = {', 'const validateField');

    expect(validatorsSection).toMatch(/nombre\s*:/);
    expect(validatorsSection).toMatch(/apellido\s*:/);
    expect(validatorsSection).toMatch(/getFieldError\(['"]nombre['"]/);
    expect(validatorsSection).toMatch(/getFieldError\(['"]apellido['"]/);
    expect(validationSource).toMatch(/addFieldError\(ctx,\s*['"]nombre['"],\s*['"]El nombre es requerido['"]\)/);
    expect(validationSource).toMatch(/addFieldError\(ctx,\s*['"]apellido['"],\s*['"]El apellido es requerido['"]\)/);
    expect(validatorsSection).not.toMatch(/name\s*:/);
    expect(validatorsSection).not.toMatch(/includes\(['"]\s['"]\)|split\(['"]\s['"]\)/);
  });

  it('credentials submit sends explicit first_name and last_name from separate inputs to the protected intent endpoint', async () => {
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const submitFlow = sliceBetween(source, "form.addEventListener('submit'", '\n  });\n}');

    expect(source).toMatch(/input\[name=["']nombre["']\]/);
    expect(source).toMatch(/input\[name=["']apellido["']\]/);
    expect(submitFlow).toMatch(/first_name\s*:\s*values\.nombre/);
    expect(submitFlow).toMatch(/last_name\s*:\s*values\.apellido/);
    expect(submitFlow).not.toMatch(/input\[name=["']name["']\]/);
    expect(submitFlow).not.toMatch(/\.split\(['"]\s['"]\)|nameParts|slice\(1\)\.join/);
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

  it('credentials page does not restore plaintext PII from browser storage after the user selects a plan', async () => {
    const source = await loadSource(SIGNUP_CREDENTIALS_CONTROLLER_PATH);
    const controllerBeforeValidators = sliceBetween(source, 'const searchParams = new URLSearchParams', 'const validators = {');

    expect(source).toMatch(/SIGNUP_STORAGE_KEYS\.pendingSignupIntent|protected_pending_signup_intent|intent_id/);
    expect(controllerBeforeValidators).not.toMatch(/sessionStorage\.getItem\(\s*SIGNUP_STORAGE_KEYS\.(?:nombre|apellido|negocioNombre|telefono|email)/);
    expect(controllerBeforeValidators).not.toMatch(/\.value\s*=\s*sessionStorage\.getItem/);
    expect(controllerBeforeValidators).not.toMatch(/sessionStorage\.getItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
  });
});
