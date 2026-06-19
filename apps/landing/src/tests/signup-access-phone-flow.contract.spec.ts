import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const ACCESS_PAGE = new URL('../pages/auth/signup/account.astro', import.meta.url);
const ACCESS_CONTROLLER = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
const ACCESS_VALIDATION = new URL('../lib/signup-account-validation.ts', import.meta.url);

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

describe('contract: landing signup access phone + same-runtime continuation flow', () => {
  it('renders Argentina phone as required area code and local number fields, not one legacy phone field', async () => {
    const credentialsSource = await source(ACCESS_PAGE);
    const formMarkup = sliceBetween(credentialsSource, '<form id="accountForm"', '</form>');

    expect(formMarkup).toMatch(/name=["']telefonoCaracteristica["'][\s\S]*required/i);
    expect(formMarkup).toMatch(/name=["']telefonoNumero["'][\s\S]*required/i);
    expect(formMarkup).toMatch(/Caracter[ií]stica|C[oó]digo de [aá]rea/i);
    expect(formMarkup).toMatch(/N[uú]mero local|Tel[eé]fono local/i);
    expect(formMarkup).not.toMatch(/name=["']telefono["']/i);
  });

  it('keeps Continue disabled until every required credentials field is complete and valid', async () => {
    const credentialsSource = await source(ACCESS_PAGE);
    const controllerSource = await source(ACCESS_CONTROLLER);
    const formMarkup = sliceBetween(credentialsSource, '<form id="accountForm"', '</form>');
    const validationScript = sliceBetween(controllerSource, 'const validators = {', "form.addEventListener('submit'");

    expect(formMarkup).toMatch(/<button[^>]+type=["']submit["'][^>]+disabled/i);
    expect(validationScript).toMatch(/updateContinueButtonState|refreshContinueButtonState|setContinueButtonState/i);
    expect(validationScript).toMatch(/button\.disabled\s*=\s*!?(?:isFormComplete|canContinue|isContinueEnabled|allRequiredFieldsComplete)/i);
    expect(validationScript).toMatch(/telefonoCaracteristica/);
    expect(validationScript).toMatch(/telefonoNumero/);
  });

  it('validates both Argentina phone pieces and returns before signup/import when the form is invalid', async () => {
    const controllerSource = await source(ACCESS_CONTROLLER);
    const validationSource = await source(ACCESS_VALIDATION);
    const validatorsBlock = sliceBetween(controllerSource, 'const validators = {', '\n  };');
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });\n}');
    const invalidGuard = sliceBetween(submitFlow, 'if (!validateForm() || !button)', 'button.disabled = true');

    expect(validatorsBlock).toMatch(/telefonoCaracteristica\s*:/);
    expect(validatorsBlock).toMatch(/telefonoNumero\s*:/);
    expect(validationSource).toMatch(/caracter[ií]stica|c[oó]digo de [aá]rea/i);
    expect(validationSource).toMatch(/n[uú]mero local/i);
    expect(invalidGuard).toContain('return;');
    expect(invalidGuard).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv|import\(/);
  });

  it('normalizes split Argentina phone and keeps FREE first submit in the same runtime without Auth', async () => {
    const controllerSource = await source(ACCESS_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });\n}');
    const freeSignupBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n    }\n\n    try {');

    expect(controllerSource).toMatch(/normalizeArgentinaPhone|buildArgentinaPhone|normalizedPhone/i);
    expect(controllerSource).toMatch(/telefonoCaracteristica/);
    expect(controllerSource).toMatch(/telefonoNumero/);
    expect(freeSignupBranch).toMatch(/createAccountAndBusiness\(accountBusinessPayload\)/);
    expect(controllerSource).toMatch(/telefono:\s*values\.normalizedPhone/);
    expect(controllerSource).toMatch(/password:\s*values\.password/);
    expect(freeSignupBranch).not.toMatch(/createProtectedPendingSignupIntent|pendingSignupIntent|window\.location\.href/);
    expect(freeSignupBranch).not.toMatch(/telefonoCaracteristica|telefonoNumero/);
    expect(freeSignupBranch).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv/);
  });

  it('FREE submit visibly finalizes immediately or surfaces errors without storing the password', async () => {
    const controllerSource = await source(ACCESS_CONTROLLER);
    const finalizer = sliceBetween(controllerSource, 'if (!isPaidPlan)', '\n    }\n\n    try {');

    expect(finalizer).toMatch(/createAccountAndBusiness\(accountBusinessPayload\)/);
    expect(finalizer).toMatch(/showAccountCreatedModal\(\)/);
    expect(finalizer).toMatch(/catch\s*(?:\(|\{)/);
    expect(finalizer).toMatch(/button\.disabled\s*=\s*false/);
    expect(finalizer).toMatch(/signupError|errorEl|showExistingAccountModal/);
    expect(finalizer).not.toMatch(/sessionStorage\.setItem\([\s\S]*password|window\.location\.href/);
  });
});
