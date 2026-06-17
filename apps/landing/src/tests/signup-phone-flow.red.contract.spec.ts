import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_PAGE = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const CREDENTIALS_CONTROLLER = new URL('../lib/signup-credentials-page-controller.ts', import.meta.url);
const CREDENTIALS_VALIDATION = new URL('../lib/signup-credentials-validation.ts', import.meta.url);

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

describe('RED contract: landing signup credentials phone + continuation flow', () => {
  it('renders Argentina phone as required area code and local number fields, not one legacy phone field', async () => {
    const credentialsSource = await source(CREDENTIALS_PAGE);
    const formMarkup = sliceBetween(credentialsSource, '<form id="credentialsForm"', '</form>');

    expect(formMarkup).toMatch(/name=["']telefonoCaracteristica["'][\s\S]*required/i);
    expect(formMarkup).toMatch(/name=["']telefonoNumero["'][\s\S]*required/i);
    expect(formMarkup).toMatch(/Caracter[ií]stica|C[oó]digo de [aá]rea/i);
    expect(formMarkup).toMatch(/N[uú]mero local|Tel[eé]fono local/i);
    expect(formMarkup).not.toMatch(/name=["']telefono["']/i);
  });

  it('keeps Continue disabled until every required credentials field is complete and valid', async () => {
    const credentialsSource = await source(CREDENTIALS_PAGE);
    const controllerSource = await source(CREDENTIALS_CONTROLLER);
    const formMarkup = sliceBetween(credentialsSource, '<form id="credentialsForm"', '</form>');
    const validationScript = sliceBetween(controllerSource, 'const validators = {', "form.addEventListener('submit'");

    expect(formMarkup).toMatch(/<button[^>]+type=["']submit["'][^>]+disabled/i);
    expect(validationScript).toMatch(/updateContinueButtonState|refreshContinueButtonState|setContinueButtonState/i);
    expect(validationScript).toMatch(/button\.disabled\s*=\s*!?(?:isFormComplete|canContinue|isContinueEnabled|allRequiredFieldsComplete)/i);
    expect(validationScript).toMatch(/telefonoCaracteristica/);
    expect(validationScript).toMatch(/telefonoNumero/);
  });

  it('validates both Argentina phone pieces and returns before signup/import when the form is invalid', async () => {
    const controllerSource = await source(CREDENTIALS_CONTROLLER);
    const validationSource = await source(CREDENTIALS_VALIDATION);
    const validatorsBlock = sliceBetween(controllerSource, 'const validators = {', '\n  };');
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });\n}');
    const invalidGuard = sliceBetween(submitFlow, 'if (!(isPaidPlan ? validateForm() : validateNonSensitiveCredentials()) || !button)', 'button.disabled = true');

    expect(validatorsBlock).toMatch(/telefonoCaracteristica\s*:/);
    expect(validatorsBlock).toMatch(/telefonoNumero\s*:/);
    expect(validationSource).toMatch(/caracter[ií]stica|c[oó]digo de [aá]rea/i);
    expect(validationSource).toMatch(/n[uú]mero local/i);
    expect(invalidGuard).toContain('return;');
    expect(invalidGuard).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv|import\(/);
  });

  it('normalizes split Argentina phone before protecting FREE pending intent and never signs up directly', async () => {
    const controllerSource = await source(CREDENTIALS_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });\n}');
    const freeSignupBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n\n    try {\n      const protectedSignup');

    expect(controllerSource).toMatch(/normalizeArgentinaPhone|buildArgentinaPhone|normalizedPhone/i);
    expect(controllerSource).toMatch(/telefonoCaracteristica/);
    expect(controllerSource).toMatch(/telefonoNumero/);
    expect(freeSignupBranch).toMatch(/createProtectedPendingSignupIntent\(\{[\s\S]*phone:\s*values\.normalizedPhone[\s\S]*\}\)/);
    expect(freeSignupBranch).toMatch(/sessionStorage\.setItem\(SIGNUP_STORAGE_KEYS\.pendingSignupIntent,/);
    expect(freeSignupBranch).toMatch(/window\.location\.href\s*=\s*onboardingUrl\.toString\(\)/);
    expect(freeSignupBranch).not.toMatch(/telefonoCaracteristica|telefonoNumero/);
    expect(freeSignupBranch).not.toMatch(/telefono\s*:\s*values\.normalizedPhone/);
    expect(freeSignupBranch).not.toMatch(/signupWithProvider|createSupabaseSignupAdapterFromEnv/);
  });

  it('FREE signup visibly redirects or surfaces errors and cannot leave a silent same-screen failure', async () => {
    const controllerSource = await source(CREDENTIALS_CONTROLLER);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });\n}');
    const freeSignupBranch = sliceBetween(submitFlow, 'if (!isPaidPlan)', '\n\n    try {\n      const protectedSignup');

    expect(freeSignupBranch).toMatch(/try\s*{/);
    expect(freeSignupBranch).toMatch(/catch\s*(?:\(|\{)/);
    expect(freeSignupBranch).toMatch(/button\.disabled\s*=\s*false/);
    expect(freeSignupBranch).toMatch(/signupError|errorEl/);
    expect(freeSignupBranch).toMatch(/window\.location\.href\s*=\s*signupResult\.redirectTo|window\.location\.href\s*=\s*onboardingUrl\.toString\(\)/);
  });
});
