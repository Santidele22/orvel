import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_PAGE = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const CREDENTIALS_CONTROLLER = new URL('../lib/signup-access-page-controller.ts', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const PENDING_INTENT_PROTECT_API = new URL('../pages/api/signup/pending-intent/protect.ts', import.meta.url);

const PLAINTEXT_PII_KEYS = [
  'email',
  'nombre',
  'apellido',
  'telefono',
  'negocioNombre',
] as const;

const PROTECTED_PENDING_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'phone',
  'business_name',
] as const;

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

describe('RED contract: Option A pending signup PII is encrypted + HMAC before persistence', () => {
  it('paid signup pending intent stored in browser contains only encrypted/HMAC PII fields and never password', async () => {
    const credentialsSource = await source(CREDENTIALS_CONTROLLER);
    const paidPendingIntentBranch = sliceBetween(credentialsSource, 'createProtectedPendingSignupIntent', 'window.location.href = `/billing/subscription');
    const storedPendingIntentWrite = sliceBetween(
      paidPendingIntentBranch,
      'sessionStorage.setItem(SIGNUP_STORAGE_KEYS.pendingSignupIntent, JSON.stringify({',
      '}));',
    );

    expect(paidPendingIntentBranch).toContain('/api/signup/pending-intent/protect');
    expect(paidPendingIntentBranch).toContain('protected_pending_signup_intent');
    expect(paidPendingIntentBranch).toContain('JSON.stringify(protectedSignup');

    for (const key of PLAINTEXT_PII_KEYS) {
      expect(storedPendingIntentWrite, `pendingSignupIntent must not persist plaintext ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\s*[,}:]`),
      );
    }

    expect(storedPendingIntentWrite).not.toMatch(/password|confirmPassword|contraseñ/i);
    expect(paidPendingIntentBranch).toContain('SIGNUP_STORAGE_KEYS.pendingSignupIntent');
  });

  it('signup credentials does not persist plaintext PII in session/local storage outside transient form variables', async () => {
    const credentialsSource = `${await source(CREDENTIALS_PAGE)}\n${await source(CREDENTIALS_CONTROLLER)}`;
    const storageWrites = credentialsSource.match(/(?:sessionStorage|localStorage)\.setItem\([^\n]+/g) ?? [];
    const piiStorageWrites = storageWrites.filter((write) =>
      PLAINTEXT_PII_KEYS.some((key) => write.includes(`SIGNUP_STORAGE_KEYS.${key}`) || write.includes(`'${key}'`) || write.includes(`"${key}"`)),
    );

    expect(piiStorageWrites).toEqual([]);
    expect(storageWrites.join('\n')).not.toMatch(/password|confirmPassword|contraseñ/i);
  });

  it('subscription page forwards only protected pending-signup payload fields to the start API', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startClickFlow = sliceBetween(subscriptionSource, "initSubscriptionBtn.addEventListener('click'", 'const response = await fetch');
    const requestBody = sliceBetween(subscriptionSource, 'body: JSON.stringify({', '})\n          });');

    for (const key of PLAINTEXT_PII_KEYS) {
      expect(startClickFlow, `subscription page must not read plaintext ${key} from storage`).not.toContain(`SIGNUP_STORAGE_KEYS.${key}`);
      expect(requestBody, `subscription start payload must not include plaintext ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\s*[,}:]`),
      );
    }

    for (const field of PROTECTED_PENDING_FIELDS) {
      expect(requestBody).toMatch(new RegExp(`${field}_(encrypted|hmac)`));
    }
  });

  it('landing subscription start API contract uses encrypted + HMAC pending signup fields and forbids app password storage', async () => {
    const startApiSource = await source(SUBSCRIPTION_START_API);
    const pendingIntentType = sliceBetween(startApiSource, 'type PendingSignupIntent = {', '};');
    const upstreamBody = sliceBetween(startApiSource, 'body: JSON.stringify({', '})');

    for (const field of PROTECTED_PENDING_FIELDS) {
      expect(pendingIntentType).toContain(`${field}_encrypted?: string`);
      expect(pendingIntentType).toContain(`${field}_hmac?: string`);
      expect(upstreamBody).toMatch(new RegExp(`${field}_(encrypted|hmac)`));
    }

    for (const key of PLAINTEXT_PII_KEYS) {
      expect(pendingIntentType, `PendingSignupIntent type must not accept plaintext ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\?:`),
      );
      expect(upstreamBody, `upstream body must not send plaintext ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\s*:`),
      );
    }

    expect(startApiSource).not.toMatch(/password|password_hash|hashed_password/i);
  });

  it('pending intent protection endpoint accepts first_name and last_name, not a legacy full-name field', async () => {
    const protectApiSource = await source(PENDING_INTENT_PROTECT_API);
    const protectCall = sliceBetween(protectApiSource, 'protectPendingSignupPii({', '});');

    expect(protectCall).toMatch(/first_name:\s*body\?\.first_name/);
    expect(protectCall).toMatch(/last_name:\s*body\?\.last_name/);
    expect(protectCall).toMatch(/business_name:\s*body\?\.business_name/);
    expect(protectCall).toMatch(/phone:\s*body\?\.phone/);
    expect(protectCall).not.toMatch(/\bname\s*:\s*body\?\.name|full_name|Nombre Completo/i);
    expect(protectApiSource).not.toMatch(/password|confirmPassword|contraseñ/i);
  });
});
