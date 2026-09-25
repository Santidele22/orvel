import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const serviceTs = readFileSync(
  resolve(process.cwd(), 'src/app/features/settings/data-access/business.service.ts'),
  'utf8'
);
const pageTs = readFileSync(
  resolve(process.cwd(), 'src/app/features/settings/pages/configuracion.page.ts'),
  'utf8'
);

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) return '';
  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';
  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }
  return sourceText.slice(signatureStart);
}

describe('BusinessService settings snapshot cache', () => {
  it('holds hydrated identity so remount can skip loadFromSupabase', () => {
    expect(serviceTs).toMatch(/hydratedUserId/);
    expect(methodBody(serviceTs, 'loadFromSupabase')).toMatch(/hydratedUserId\s*=/);
    expect(serviceTs).toMatch(/hasHydratedSnapshot|clearHydration/);
  });

  it('config page skip uses the service snapshot holder', () => {
    const hydrate = methodBody(pageTs, 'hydrateBusinessSettings');
    expect(hydrate).toMatch(/hasHydratedSnapshot\s*\(\s*userId/);
    expect(hydrate).not.toMatch(/this\.hydratedUserId === userId && this\.facade\.getSnapshot\(\)/);
  });
});
