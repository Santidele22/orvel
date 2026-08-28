import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./servicio.service.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../pages/servicios.page.ts', import.meta.url), 'utf8');

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const signatureClose = sourceText.indexOf(')', signatureStart);
  const bodyStart = sourceText.indexOf('{', signatureClose === -1 ? signatureStart : signatureClose);
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

describe('ServicioService category persist contract', () => {
  it('awaits category insert with business_id and without slug', () => {
    const persistBody = methodBody(source, 'createCategoriaAndPersist');

    expect(persistBody, 'createCategoriaAndPersist must exist').not.toBe('');
    expect(persistBody).toMatch(/createCategoria\s*\(/);
    expect(persistBody).toMatch(/service_categories/);
    expect(persistBody).toMatch(/business_id/);
    expect(persistBody).toMatch(/is_active\s*:\s*true/);
    expect(persistBody).toMatch(/resolveBusinessId|requireBusinessId|getBranchContextService/);
    expect(persistBody).toMatch(/\bawait\b/);
    expect(persistBody).not.toMatch(/\bslug\s*:/);
    expect(persistBody).not.toMatch(/void\s+supabase/);
  });

  it('keeps createCategoria synchronous and off the fire-and-forget insert path', () => {
    const createBody = methodBody(source, 'createCategoria');

    expect(createBody, 'createCategoria must exist').not.toBe('');
    expect(createBody).not.toMatch(/\basync\s+createCategoria\b/);
    expect(createBody).not.toMatch(/void\s+supabase/);
    expect(createBody).not.toMatch(/\.insert\s*\(/);
  });

  it('writes category and category_id on service create/update payloads', () => {
    const createBody = methodBody(source, 'createServicioInSupabase');
    const updateBody = methodBody(source, 'updateServicioInSupabase');

    expect(createBody).toMatch(/\bcategory\b/);
    expect(createBody).toMatch(/\bcategory_id\b/);
    expect(updateBody).toMatch(/\bcategory\b/);
    expect(updateBody).toMatch(/\bcategory_id\b/);
  });

  it('wires the servicios page to await createCategoriaAndPersist', () => {
    expect(pageSource).toMatch(/createCategoriaAndPersist\s*\(/);
    expect(pageSource).toMatch(/await\s+this\.servicioService\.createCategoriaAndPersist/);
  });
});
