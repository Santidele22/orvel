import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readUtf8(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing source: ${relativePath}`);
  }
  return readFileSync(absolutePath, 'utf-8');
}

function methodBody(sourceText: string, methodName: string): string {
  const header = new RegExp(
    `(?:^|[\\n;])\\s*(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!header) return '';

  let index = header.index + header[0].length;
  let parenDepth = 1;
  while (index < sourceText.length && parenDepth > 0) {
    if (sourceText[index] === '(') parenDepth += 1;
    if (sourceText[index] === ')') parenDepth -= 1;
    index += 1;
  }

  let braceStart = -1;
  for (let cursor = index; cursor < sourceText.length; cursor += 1) {
    if (sourceText[cursor] === '{') {
      braceStart = cursor;
      break;
    }
  }
  if (braceStart < 0) return '';

  let depth = 0;
  for (let cursor = braceStart; cursor < sourceText.length; cursor += 1) {
    if (sourceText[cursor] === '{') depth += 1;
    if (sourceText[cursor] === '}') {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(header.index, cursor + 1);
      }
    }
  }

  return '';
}

describe('servicios persist depositPercent 0/25/50/100', () => {
  const modelSource = readUtf8('src/app/models/servicio.model.ts');
  const serviceSource = readUtf8('src/app/features/servicios/data-access/servicio.service.ts');
  const pageSource = readUtf8('src/app/features/servicios/pages/servicios.page.ts');
  const pageTemplate = readUtf8('src/app/features/servicios/pages/servicios.page.html');
  const validationSource = readUtf8('src/app/features/servicios/pages/servicios.validation.ts');

  it('models and validates depositPercent as 0, 25, 50, or 100', () => {
    expect(modelSource).toMatch(/depositPercent\s*:\s*number/);
    expect(validationSource).toMatch(/depositPercent/);
    expect(validationSource).toMatch(/0,\s*25,\s*50,\s*100/);
  });

  it('exposes a 0/25/50/100 seña control on create and edit', () => {
    expect(pageSource).toMatch(/depositPercent\s*:\s*\[0/);
    expect(pageTemplate).toMatch(/formControlName=["']depositPercent["']/);
    expect(pageTemplate).toMatch(/Seña/);
    for (const percent of [0, 25, 50, 100]) {
      expect(pageTemplate).toContain(String(percent));
    }
  });

  it('persists depositPercent as services.deposit_percent on create, update, and map', () => {
    const createBody = methodBody(serviceSource, 'createServicioInSupabase');
    expect(createBody, 'createServicioInSupabase must exist').not.toBe('');
    expect(createBody).toMatch(/deposit_percent\s*:\s*dto\.depositPercent/);

    const updateBody = methodBody(serviceSource, 'updateServicioInSupabase');
    expect(updateBody, 'updateServicioInSupabase must exist').not.toBe('');
    expect(updateBody).toMatch(/deposit_percent['"]?\s*\]?\s*=\s*dto\.depositPercent|payload\['deposit_percent'\]\s*=\s*dto\.depositPercent/);

    const mapped = methodBody(serviceSource, 'mapSupabaseRowToServicio');
    expect(mapped, 'mapSupabaseRowToServicio must exist').not.toBe('');
    expect(mapped).toMatch(/depositPercent\s*:\s*Number\(\s*row\['deposit_percent'\]/);
  });
});
