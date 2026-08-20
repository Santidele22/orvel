import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const API_PATH = new URL('../pages/api/waitlist.ts', import.meta.url);
const ENV_PATH = new URL('../env.d.ts', import.meta.url);

describe('Contract: /api/waitlist persists via appendWaitlistToSheet', () => {
  it('uses the sheet helper and maps ok / already_exists / unavailable', async () => {
    const api = await readFile(API_PATH, 'utf8');

    expect(api).toMatch(/appendWaitlistToSheet/);
    expect(api).toMatch(/from ['"]\.\.\/\.\.\/lib\/waitlist-sheet['"]|from ['"]\.\.\/lib\/waitlist-sheet['"]/);
    expect(api).toMatch(/WAITLIST_SHEETS_WEBHOOK_URL/);
    expect(api).toMatch(/WAITLIST_SHEETS_SECRET/);
    expect(api).not.toMatch(/PUBLIC_WAITLIST_SHEETS_/);

    expect(api).toMatch(/persist\.ok[\s\S]*status:\s*['"]ok['"][\s\S]*200|status:\s*['"]ok['"][\s\S]*persist\.ok/);
    expect(api).toMatch(/already_exists[\s\S]*409|409[\s\S]*already_exists/);
    expect(api).toMatch(
      /WAITLIST_PERSISTENCE_UNAVAILABLE[\s\S]*503|persistence_unavailable[\s\S]*503|503[\s\S]*(?:WAITLIST_PERSISTENCE_UNAVAILABLE|persistence_unavailable)/
    );

    expect(api).not.toMatch(/console\.(?:log|info|warn|error|debug)\([\s\S]*(?:email|whatsapp|name)/i);
  });

  it('declares the server env keys without PUBLIC_ prefix', async () => {
    const env = await readFile(ENV_PATH, 'utf8');
    expect(env).toMatch(/WAITLIST_SHEETS_WEBHOOK_URL/);
    expect(env).toMatch(/WAITLIST_SHEETS_SECRET/);
    expect(env).not.toMatch(/PUBLIC_WAITLIST_SHEETS_/);
  });
});
