import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SIGNUP_PAGES = [
  new URL('../pages/auth/signup/account.astro', import.meta.url),
  new URL('../pages/auth/signup/credentials.astro', import.meta.url),
  new URL('../pages/auth/signup/plan.astro', import.meta.url)
];

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: landing signup pages redirect in-app; phone is out of scope for #562', () => {
  it('landing signup pages 302-redirect into dashboard in-app signup', async () => {
    for (const path of SIGNUP_PAGES) {
      const pageSource = await source(path);

      expect(pageSource).toMatch(/buildInAppAuthRedirect/);
      expect(pageSource).toMatch(/Astro\.redirect\([\s\S]*302/);
      expect(pageSource).toMatch(/['"]signup['"]/);
      expect(pageSource).not.toContain('accountForm');
      expect(pageSource).not.toContain('initSignupAccountPage');
    }
  });

  it('does not require phone fields on landing signup pages (wizard has no phone)', async () => {
    for (const path of SIGNUP_PAGES) {
      const pageSource = await source(path);

      expect(pageSource).not.toMatch(/telefonoCaracteristica|telefonoNumero/);
      expect(pageSource).not.toMatch(/name=["']telefono["']/);
    }
  });
});
