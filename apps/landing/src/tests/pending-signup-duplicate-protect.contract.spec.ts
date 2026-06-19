import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const PROTECT_API = new URL('../pages/api/signup/pending-intent/protect.ts', import.meta.url);
const HANDOFF_SERVER = new URL('../lib/server/pending-signup-handoff.ts', import.meta.url);
const SIGNUP_CONTROLLER = new URL('../lib/signup-account-page-controller.ts', import.meta.url);

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

describe('RED contract: pending signup duplicate protection is deterministic and recoverable', () => {
  it('protect endpoint returns PENDING_SIGNUP_ALREADY_EXISTS as a recoverable 409 with clear non-generic message', async () => {
    const apiSource = await source(PROTECT_API);
    const duplicateMessage = sliceBetween(apiSource, 'PENDING_SIGNUP_ALREADY_EXISTS', 'pending_signup_required_fields');

    expect(apiSource).toMatch(/PENDING_SIGNUP_ALREADY_EXISTS[\s\S]*409/);
    expect(apiSource).toMatch(/recoverable\s*:\s*true|recovery_action|recoveryHref|restart/i);
    expect(duplicateMessage).toMatch(/pendiente|alta paga|continuar|reintent|reinici/i);
    expect(duplicateMessage).not.toMatch(/No pudimos proteger tus datos para iniciar el pago/i);
  });

  it('paid signup form maps PENDING_SIGNUP_ALREADY_EXISTS to a clear restart/retry path instead of generic protect failure', async () => {
    const controllerSource = await source(SIGNUP_CONTROLLER);
    const paidSubmitCatch = sliceBetween(controllerSource, '} catch (error) {', '\n    }\n  });');

    expect(controllerSource).toMatch(/PENDING_SIGNUP_ALREADY_EXISTS|isPendingSignupAlreadyExistsError/i);
    expect(paidSubmitCatch).toMatch(/PENDING_SIGNUP_ALREADY_EXISTS|isPendingSignupAlreadyExistsError/i);
    expect(paidSubmitCatch).toMatch(/pendiente|alta paga|reintent|reinici|volver/i);
    expect(paidSubmitCatch).not.toMatch(/errorEl\.textContent\s*=\s*'No pudimos proteger tus datos para iniciar el pago\. Reintentá en unos segundos\.'/);
  });

  it('stale existing intent or email_hmac unique violation is handled as controlled duplicate/recovery, not a 500 generic failure', async () => {
    const serverSource = await source(HANDOFF_SERVER);
    const apiSource = await source(PROTECT_API);

    expect(serverSource).toMatch(/23505|unique_violation|email_hmac_unique|isPendingSignupEmailHmacUniqueViolation/i);
    expect(serverSource).toMatch(/reuseStalePendingSignupHandoff|stale|expired|superseded|PENDING_SIGNUP_ALREADY_EXISTS/i);
    expect(apiSource).toMatch(/PENDING_SIGNUP_ALREADY_EXISTS[\s\S]*409/);
    expect(apiSource).toMatch(/console\.(?:warn|error)\([\s\S]*(?:code|status|constraint)[\s\S]*\)/i);
    expect(apiSource).not.toMatch(/console\.(?:warn|error)\([\s\S]*(?:email|body|payload|request\.json)[\s\S]*\)/i);
  });

  it('paid signup still creates no account or business before approved payment and fresh handoff returns reference plus HttpOnly cookie', async () => {
    const controllerSource = await source(SIGNUP_CONTROLLER);
    const serverSource = await source(HANDOFF_SERVER);
    const apiSource = await source(PROTECT_API);
    const submitFlow = sliceBetween(controllerSource, "form.addEventListener('submit'", '\n  });');
    const paidBranch = sliceBetween(submitFlow, 'try {\n      const pendingSignupIntent', 'window.location.href = billingUrl;');

    expect(paidBranch).toMatch(/createProtectedPendingSignupIntent|pendingSignupIntent/i);
    expect(paidBranch).not.toMatch(/createAccountAndBusiness|signupWithProvider|finalizeFreeSignup|pending-intent\/finalize|auth\.signUp/i);
    expect(paidBranch).not.toMatch(/from\(['"]businesses['"]\)|create_business|insert\([\s\S]*business/i);
    expect(serverSource).toMatch(/pendingSignupReference|handoff_reference|createOpaqueToken\('psh'\)/);
    expect(serverSource).toMatch(/HttpOnly|Set-Cookie|SameSite=Lax/);
    expect(apiSource).toMatch(/pending_signup_reference[\s\S]*serverRedirectUrl|serverRedirectUrl[\s\S]*pending_signup_reference/);
    expect(apiSource).toMatch(/Set-Cookie/);
  });
});
