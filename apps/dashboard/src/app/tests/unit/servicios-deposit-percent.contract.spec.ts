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

describe('servicios do not configure seña per service', () => {
  const serviceSource = readUtf8('src/app/features/servicios/data-access/servicio.service.ts');
  const pageSource = readUtf8('src/app/features/servicios/pages/servicios.page.ts');
  const pageTemplate = readUtf8('src/app/features/servicios/pages/servicios.page.html');
  const validationSource = readUtf8('src/app/features/servicios/pages/servicios.validation.ts');

  it('removes per-service seña UI from create and edit', () => {
    expect(pageTemplate).not.toMatch(/formControlName=["']depositPercent["']/);
    expect(pageTemplate).not.toMatch(/service-deposit-percent/);
    expect(pageSource).not.toMatch(/depositPercent\s*:\s*\[/);
    expect(validationSource).not.toMatch(/depositPercent/);
  });

  it('does not persist services.deposit_percent on create or update', () => {
    const createBody = methodBody(serviceSource, 'createServicioInSupabase');
    expect(createBody, 'createServicioInSupabase must exist').not.toBe('');
    expect(createBody).not.toMatch(/deposit_percent/);

    const updateBody = methodBody(serviceSource, 'updateServicioInSupabase');
    expect(updateBody, 'updateServicioInSupabase must exist').not.toBe('');
    expect(updateBody).not.toMatch(/deposit_percent/);
  });
});
