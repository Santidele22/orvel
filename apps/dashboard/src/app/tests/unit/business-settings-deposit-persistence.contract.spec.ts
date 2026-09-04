import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const HOLD_RELEASE_COPY = 'Si no se confirma la seña, el horario se libera.';
const FORBIDDEN_REFUND_COPY = 'te devolvemos la plata';

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

function extractObjectLiteralAfter(sourceText: string, marker: string): string {
  const markerIndex = sourceText.indexOf(marker);
  if (markerIndex < 0) return '';
  const objectStart = sourceText.indexOf('{', markerIndex);
  if (objectStart < 0) return '';

  let depth = 0;
  for (let index = objectStart; index < sourceText.length; index += 1) {
    if (sourceText[index] === '{') depth += 1;
    if (sourceText[index] === '}') {
      depth -= 1;
      if (depth === 0) return sourceText.slice(objectStart, index + 1);
    }
  }
  return '';
}

describe('WU3 business settings deposit persistence', () => {
  const facadeSource = readUtf8('src/app/features/settings/data-access/business-settings.facade.ts');
  const serviceSource = readUtf8('src/app/features/settings/data-access/business.service.ts');
  const pageSource = readUtf8('src/app/features/settings/pages/configuracion.page.ts');
  const zenTemplate = readUtf8('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html');
  const typesSource = readUtf8('../../packages/types/src/business.model.ts');

  it('defaults depositEnabled to false in facade state, row mapping, and buildDefaultState', () => {
    expect(facadeSource).toMatch(/depositEnabled\s*:\s*boolean/);
    expect(facadeSource).toMatch(/deposit_enabled\?:/);

    const defaults = methodBody(facadeSource, 'buildDefaultState');
    expect(defaults, 'buildDefaultState must exist').not.toBe('');
    expect(defaults).toMatch(/depositEnabled\s*:\s*false/);

    const mapped = methodBody(facadeSource, 'mapFromSupabaseRow');
    expect(mapped, 'mapFromSupabaseRow must exist').not.toBe('');
    expect(mapped).toMatch(/depositEnabled\s*:\s*row\.deposit_enabled\s*\?\?\s*false/);
  });

  it('round-trips camelCase deposit fields to snake_case on facade save', () => {
    expect(facadeSource).toMatch(/depositAlias/);
    expect(facadeSource).toMatch(/depositCbu/);
    expect(facadeSource).toMatch(/deposit_alias/);
    expect(facadeSource).toMatch(/deposit_cbu/);

    const mapped = methodBody(facadeSource, 'mapFromSupabaseRow');
    expect(mapped).toMatch(/depositAlias\s*:\s*row\.deposit_alias/);
    expect(mapped).toMatch(/depositCbu\s*:\s*row\.deposit_cbu/);

    const save = methodBody(facadeSource, 'saveToSupabase');
    expect(save, 'saveToSupabase must exist').not.toBe('');
    expect(save).toMatch(/deposit_enabled\s*:\s*persistedLocal\.depositEnabled/);
    expect(save).not.toMatch(/deposit_amount_pesos\s*:/);
    expect(save).toMatch(/deposit_alias\s*:\s*persistedLocal\.depositAlias/);
    expect(save).toMatch(/deposit_cbu\s*:\s*persistedLocal\.depositCbu/);
  });

  it('persists the same deposit fields through the live BusinessService settings path', () => {
    expect(typesSource).toMatch(/depositEnabled\?:/);
    expect(typesSource).toMatch(/depositAlias\?:/);
    expect(typesSource).toMatch(/depositCbu\?:/);

    const mapped = methodBody(serviceSource, 'mapToSettings');
    expect(mapped, 'mapToSettings must exist').not.toBe('');
    expect(mapped).toMatch(/depositEnabled\s*:\s*settings\?\.deposit_enabled\s*\?\?\s*false/);
    expect(mapped).toMatch(/depositAlias\s*:/);
    expect(mapped).toMatch(/depositCbu\s*:/);

    expect(serviceSource).toMatch(/deposit_enabled\s*:\s*settings\.depositEnabled\s*\?\?\s*false/);
    expect(serviceSource).not.toMatch(/deposit_amount_pesos\s*:\s*settings\.depositAmountPesos/);
    expect(serviceSource).toMatch(/deposit_alias\s*:\s*settings\.depositAlias/);
    expect(serviceSource).toMatch(/deposit_cbu\s*:\s*settings\.depositCbu/);
  });

  it('exposes Seña controls on zen settings and saves them from configuracion', () => {
    for (const control of ['depositEnabled', 'depositAlias', 'depositCbu']) {
      expect(pageSource, `${control} must be a form control`).toMatch(
        new RegExp(`${control}\\s*:\\s*\\[`)
      );
      expect(zenTemplate, `${control} must be visible in zen theme`).toMatch(
        new RegExp(`formControlName=["']${control}["']`)
      );
    }

    expect(pageSource).not.toMatch(/depositAmountPesos\s*:\s*\[/);
    expect(zenTemplate).not.toMatch(/formControlName=["']depositAmountPesos["']/);

    expect(zenTemplate).toMatch(/Seña/);
    expect(zenTemplate).toMatch(/Alias/);
    expect(zenTemplate).toMatch(/CBU/);
    expect(zenTemplate).toContain(HOLD_RELEASE_COPY);
    expect(`${zenTemplate}\n${pageSource}`).not.toContain(FORBIDDEN_REFUND_COPY);

    const onSubmit = methodBody(pageSource, 'onSubmit');
    const savePayload = extractObjectLiteralAfter(onSubmit, 'this.facade.save(');
    expect(savePayload, 'onSubmit must save deposit fields').not.toBe('');
    expect(savePayload).toMatch(/depositEnabled\s*:/);
    expect(savePayload).not.toMatch(/depositAmountPesos\s*:/);
    expect(savePayload).toMatch(/depositAlias\s*:/);
    expect(savePayload).toMatch(/depositCbu\s*:/);
  });
});
