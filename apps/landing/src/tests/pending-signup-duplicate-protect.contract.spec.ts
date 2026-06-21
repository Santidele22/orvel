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

describe('RED contract: pending signup duplicate protection is deterministic and non-enumerating', () => {
  it('protect endpoint keeps existing-account and pending-signup duplicate public responses indistinguishable', async () => {
    const apiSource = await source(PROTECT_API);
    const publicConflict = sliceBetween(apiSource, 'PUBLIC_DUPLICATE_PROTECTION_CONFLICT', 'pending_signup_required_fields');

    expect(apiSource).toMatch(/EMAIL[\s\S]*ALREADY[\s\S]*REGISTERED[\s\S]*PENDING[\s\S]*SIGNUP[\s\S]*ALREADY[\s\S]*EXISTS|PENDING[\s\S]*SIGNUP[\s\S]*ALREADY[\s\S]*EXISTS[\s\S]*EMAIL[\s\S]*ALREADY[\s\S]*REGISTERED/);
    expect(apiSource).toMatch(/PUBLIC_DUPLICATE_PROTECTION_CONFLICT[\s\S]*202/);
    expect(publicConflict).toMatch(/solicitud|alta|revisá|continuar|correo/i);
    expect(publicConflict).not.toMatch(/EMAIL_ALREADY_REGISTERED|PENDING_SIGNUP_ALREADY_EXISTS|pending_signup_already_exists/i);
    expect(publicConflict).not.toMatch(/recovery_action|existing|pendiente|pending|already/i);
  });

  it('protect endpoint never exposes internal duplicate codes or state-specific recovery actions publicly', async () => {
    const apiSource = await source(PROTECT_API);
    const responseBody = sliceBetween(apiSource, 'return jsonResponse({', '}, status);');

    expect(responseBody).toMatch(/error:\s*publicCode/);
    expect(responseBody).toMatch(/message:\s*publicMessage/);
    expect(responseBody).not.toMatch(/EMAIL_ALREADY_REGISTERED|PENDING_SIGNUP_ALREADY_EXISTS/);
    expect(responseBody).not.toMatch(/recovery_action|recoverable|restart_or_retry_existing_pending_signup/);
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
    expect(apiSource).toMatch(/PUBLIC_DUPLICATE_PROTECTION_CONFLICT[\s\S]*202/);
    expect(apiSource).toMatch(/console\.(?:warn|error)\([\s\S]*(?:code|status|constraint)[\s\S]*\)/i);
    expect(apiSource).not.toMatch(/console\.(?:warn|error)\([\s\S]*(?:email|body|payload|request\.json)[\s\S]*\)/i);
  });

  it('stale intent reuse is atomic and rechecks stale-safe status, email_hmac, and provider-active fields in the update', async () => {
    const serverSource = await source(HANDOFF_SERVER);
    const reuseFunction = sliceBetween(serverSource, 'async function reuseStalePendingSignupHandoff', '\n}\n\nexport async function createPendingSignupHandoff');

    expect(reuseFunction).toMatch(/\.update\(payload\)[\s\S]*\.eq\(['"]id['"],\s*existing\.data\.id\)[\s\S]*\.eq\(['"]email_hmac['"],\s*emailHmac\)/);
    expect(reuseFunction).toMatch(/\.eq\(['"]provider['"],\s*['"]mercado_pago['"]\)/);
    expect(reuseFunction).toMatch(/\.is\(['"]external_reference['"],\s*null\)[\s\S]*\.is\(['"]provider_subscription_id['"],\s*null\)/);
    expect(reuseFunction).toMatch(/\.is\(['"]user_id['"],\s*null\)[\s\S]*\.is\(['"]business_id['"],\s*null\)[\s\S]*\.is\(['"]materialized_at['"],\s*null\)/);
    expect(reuseFunction).toMatch(/\.or\([\s\S]*status\.in\.\(expired,failed\)[\s\S]*and\(status\.eq\.created,expires_at\.lte\./);
    expect(reuseFunction).toMatch(/\.select\(['"]id['"]\)[\s\S]*\.maybeSingle\(\)/);
    expect(reuseFunction).toMatch(/if \(!update\.data\) throw new Error\(['"]PENDING_SIGNUP_ALREADY_EXISTS['"]\)/);
  });

  it('provider-created or provider-active rows are not considered reusable stale intents', async () => {
    const serverSource = await source(HANDOFF_SERVER);
    const reuseFunction = sliceBetween(serverSource, 'async function reuseStalePendingSignupHandoff', '\n}\n\nexport async function createPendingSignupHandoff');

    expect(reuseFunction).not.toMatch(/status === ['"]provider_created['"]/);
    expect(reuseFunction).not.toMatch(/status\.eq\.provider_created|provider_created/);
    expect(reuseFunction).toMatch(/external_reference|provider_subscription_id/);
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
