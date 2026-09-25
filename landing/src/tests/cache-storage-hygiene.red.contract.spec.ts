import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = resolve(process.cwd(), 'src');
const STORAGE_KEYS_PATH = resolve(SRC_ROOT, 'lib/browser-storage-keys.ts');
const CREDENTIALS_PAGE = resolve(SRC_ROOT, 'pages/auth/signup/credentials.astro');
const COMPLETE_PAGE = resolve(SRC_ROOT, 'pages/auth/signup/complete.astro');
const SUBSCRIPTION_PAGE = resolve(SRC_ROOT, 'pages/billing/subscription.astro');

async function listProductionFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (/^(tests?|fixtures?|__fixtures__)$/.test(entry.name)) return [];
      return listProductionFiles(fullPath);
    }

    if (!entry.isFile() || !/\.(ts|astro|js)$/.test(entry.name)) return [];
    if (/(\.spec|\.test|\.contract)\.(ts|js)$/.test(entry.name)) return [];
    return [fullPath];
  }));

  return files.flat();
}

async function readProductionSources(): Promise<Array<{ path: string; source: string }>> {
  const files = await listProductionFiles(SRC_ROOT);
  return Promise.all(files.map(async (path) => ({
    path: relative(process.cwd(), path),
    source: await readFile(path, 'utf8')
  })));
}

describe('RED contract: landing signup/subscription browser storage hygiene', () => {
  it('production landing code never clears all browser storage', async () => {
    const offenders = (await readProductionSources())
      .filter(({ source }) => /(?:localStorage|sessionStorage)\.clear\s*\(/.test(source))
      .map(({ path }) => path);

    expect(offenders, 'Clear only owned temporary keys; never wipe auth or unrelated tenant/browser state.').toEqual([]);
  });

  it('exports canonical landing storage key helpers for signup state and subscription attempts', async () => {
    expect(existsSync(STORAGE_KEYS_PATH), 'Expected src/lib/browser-storage-keys.ts as the canonical landing storage key registry.').toBe(true);

    const source = existsSync(STORAGE_KEYS_PATH) ? await readFile(STORAGE_KEYS_PATH, 'utf8') : '';
    expect(source).toMatch(/export\s+const\s+SIGNUP_STORAGE_KEYS/);
    expect(source).toContain('orvel.signup.plan');
    expect(source).toContain('orvel.signup.pending_signup_intent');
    expect(source).toMatch(/export\s+function\s+subscriptionAttemptStorageKey\s*\(/);
    expect(source).toContain('orvel.subscription.attempt.');
  });

  it('auth redirect pages never persist passwords in browser storage', async () => {
    const credentialsSource = await readFile(CREDENTIALS_PAGE, 'utf8');
    const completeSource = await readFile(COMPLETE_PAGE, 'utf8');
    const signupSources = `${credentialsSource}\n${completeSource}`;

    expect(signupSources).not.toMatch(/(?:localStorage|sessionStorage)\.setItem/);
    expect(signupSources).not.toMatch(/(?:localStorage|sessionStorage)\.getItem/);
    expect(signupSources).not.toContain('orvel.signup.password');
  });

  it('subscription activation stores the premium review pending flag without Mercado Pago attempt keys', async () => {
    const source = await readFile(SUBSCRIPTION_PAGE, 'utf8');

    expect(source).toMatch(/orvel\.premium_review|markPremiumReviewPending|PREMIUM_REVIEW_STORAGE_KEY/);
    expect(source).not.toMatch(/subscriptionAttemptKey/);
    expect(source).not.toMatch(/init_point/);
    expect(source).not.toMatch(/\/api\/subscriptions\/start/);
  });
});
