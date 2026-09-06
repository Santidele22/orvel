import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const zenHtml = readFileSync(
  new URL('../pages/themes/configuracion-zen-theme.component.html', import.meta.url),
  'utf8'
);
const serviceTs = readFileSync(new URL('./business.service.ts', import.meta.url), 'utf8');
const pageTs = readFileSync(new URL('../pages/configuracion.page.ts', import.meta.url), 'utf8');

const GHOST_FORM_CONTROLS = [
  'whatsapp',
  'instagram',
  'allowMultipleServices',
  'cleanupTimeMinutes',
  'timeFormat',
  'weekStartDay'
] as const;

const PERSISTABLE_FORM_CONTROLS = [
  'supportEmail',
  'bufferMinutes',
  'minNoticeMinutes',
  'slotIntervalMinutes',
  'autoConfirm',
  'maxAdvanceDays',
  'capacity',
  'cancelationGracePeriod',
  'allowClientProfessionalSelection'
] as const;

const GHOST_UPSERT_COLUMNS = [
  'cleanup_time_minutes',
  'week_start_day',
  'time_format',
  'allow_multiple_services',
  'logo_url'
] as const;

const GHOST_SAVE_KEYS = [
  'logoUrl',
  'coverUrl',
  'brandColor',
  'whatsapp',
  'instagram',
  'allowMultipleServices',
  'cleanupTimeMinutes',
  'weekStartDay',
  'timeFormat'
] as const;

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

  let angleDepth = 0;
  let braceStart = -1;
  for (let cursor = index; cursor < sourceText.length; cursor += 1) {
    const char = sourceText[cursor];
    if (char === '<') angleDepth += 1;
    if (char === '>') angleDepth -= 1;
    if (char === '{' && angleDepth === 0) {
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

function extractSavePayload(onSubmit: string): string {
  const saveIndex = onSubmit.search(/this\.facade\.save\s*\(/);
  if (saveIndex < 0) return '';

  const objectStart = onSubmit.indexOf('{', saveIndex);
  if (objectStart < 0) return '';

  let depth = 0;
  for (let index = objectStart; index < onSubmit.length; index += 1) {
    const char = onSubmit[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return onSubmit.slice(objectStart, index + 1);
  }

  return '';
}

describe('Issue #405 - visible settings persist honesty', () => {
  it('does not render ghost formControlName bindings in the zen theme', () => {
    for (const control of GHOST_FORM_CONTROLS) {
      expect(zenHtml, `${control} must not be a visible zen form control`).not.toMatch(
        new RegExp(`formControlName=["']${control}["']`)
      );
    }
  });

  it('still renders persistable zen form controls', () => {
    for (const control of PERSISTABLE_FORM_CONTROLS) {
      expect(zenHtml, `${control} must remain visible and persistable`).toMatch(
        new RegExp(`formControlName=["']${control}["']`)
      );
    }
  });

  it('keeps saveToSupabase upsert off columns that do not exist', () => {
    const saveToSupabase = methodBody(serviceTs, 'saveToSupabase');
    expect(saveToSupabase, 'saveToSupabase must exist').not.toBe('');
    expect(saveToSupabase).toMatch(/\.upsert\s*\(/);

    for (const column of GHOST_UPSERT_COLUMNS) {
      expect(saveToSupabase, `upsert must not mention ${column}`).not.toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it('does not send ghost keys on the page onSubmit save payload', () => {
    const onSubmit = methodBody(pageTs, 'onSubmit');
    const savePayload = extractSavePayload(onSubmit);

    expect(onSubmit, 'onSubmit must exist').not.toBe('');
    expect(savePayload, 'facade.save payload must exist').not.toBe('');

    for (const key of GHOST_SAVE_KEYS) {
      expect(savePayload, `onSubmit save payload must not include ${key}`).not.toMatch(
        new RegExp(`\\b${key}\\s*:`)
      );
    }
  });

  // Issue #361 maps null DB knobs to form defaults. minNoticeMinutes 120 and
  // maxAdvanceDays 90 on the page form are UX fallbacks when DB is null — not a
  // claim they match every SQL DEFAULT in supabase/migrations.
  it('documents minNoticeMinutes 120 and maxAdvanceDays 90 as UX fallbacks, not SQL defaults', () => {
    expect(pageTs).toMatch(/minNoticeMinutes:\s*\[120/);
    expect(pageTs).toMatch(/maxAdvanceDays:\s*\[90/);
  });
});
