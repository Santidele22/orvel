import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_PAGE = new URL('../pages/auth/signup/account.astro', import.meta.url);
const CREDENTIALS_CONTROLLER = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const PLAINTEXT_PII_KEYS = [
  'email',
  'nombre',
  'apellido',
  'telefono',
  'negocioNombre',
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

describe('RED contract: account-first signup does not persist pending signup PII', () => {
  it('paid signup does not create or store a pending signup intent and never stores password', async () => {
    const credentialsSource = await source(CREDENTIALS_CONTROLLER);
    const submitFlow = sliceBetween(credentialsSource, "form.addEventListener('submit'", '\n  });');

    expect(submitFlow).toContain('createAccountAndBusiness(accountBusinessPayload)');
    expect(submitFlow).not.toMatch(/createProtectedPendingSignupIntent|protected_pending_signup_intent|pendingSignupIntent|signup_intent|pending_signup/i);
    expect(submitFlow).toMatch(/\/billing\/subscription\?plan=/);

    for (const key of PLAINTEXT_PII_KEYS) {
      expect(submitFlow, `signup flow must not persist plaintext ${key} into a pending intent`).not.toContain(`SIGNUP_STORAGE_KEYS.${key}`);
    }

    expect(submitFlow).not.toMatch(/(?:sessionStorage|localStorage)\.setItem\([^)]*password/i);
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

  it('subscription page forwards only existing-user billing metadata to the start API', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startClickFlow = sliceBetween(subscriptionSource, "initSubscriptionBtn.addEventListener('click'", 'const response = await fetch');
    const requestBody = sliceBetween(subscriptionSource, 'body: JSON.stringify({', '})\n          });');

    for (const key of PLAINTEXT_PII_KEYS) {
      expect(startClickFlow, `subscription page must not read plaintext ${key} from storage`).not.toContain(`SIGNUP_STORAGE_KEYS.${key}`);
      expect(requestBody, `subscription start payload must not include plaintext ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\s*[,}:]`),
      );
    }

    expect(requestBody).toMatch(/plan/);
    expect(requestBody).toMatch(/billing/);
    expect(requestBody).toMatch(/idempotencyKey/);
    expect(requestBody).toMatch(/businessType/);
    expect(`${startClickFlow}\n${requestBody}`).not.toMatch(/pendingSignupIntent|signup_intent|pending_signup|protected_pending_signup_intent/i);
  });

  it('landing subscription start API contract uses existing-user mode and forbids signup PII/password passthrough', async () => {
    const startApiSource = await source(SUBSCRIPTION_START_API);
    const upstreamBody = sliceBetween(startApiSource, 'body: JSON.stringify({', '})');

    for (const key of PLAINTEXT_PII_KEYS) {
      expect(upstreamBody, `upstream body must not send plaintext ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\s*:`),
      );
    }

    expect(upstreamBody).toContain('mode: "existing_user"');
    expect(startApiSource).not.toMatch(/type PendingSignupIntent|pendingSignupIntent|signup_intent|pending_signup|protected_pending_signup_intent/i);
    expect(startApiSource).not.toMatch(/password|password_hash|hashed_password/i);
  });
});
