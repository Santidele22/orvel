import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./cliente.service.ts', import.meta.url), 'utf8');

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

describe('ClienteService owned business resolution', () => {
  it('resolves listing and create business id from branch context, not metadata or auth.uid', () => {
    const resolveBody = methodBody(source, 'resolveBusinessId');

    expect(resolveBody, 'resolveBusinessId must exist').not.toBe('');
    expect(source).toMatch(/getBranchContextService/);
    expect(resolveBody).toMatch(/ensureLoaded\s*\(/);
    expect(resolveBody).toMatch(/getActiveBusinessId\s*\(/);
    expect(resolveBody).not.toMatch(/user_metadata|metadataBusinessId/);
    expect(resolveBody).not.toMatch(/\.eq\(\s*['"]id['"]\s*,\s*authUserId/);
    expect(resolveBody).not.toMatch(/return authUserId/);
    expect(source).not.toMatch(/getBusinessIdFromSettings/);
  });
});
