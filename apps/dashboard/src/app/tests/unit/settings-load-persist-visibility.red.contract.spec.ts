import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const filePath = resolve(process.cwd(), relativePath);
  return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
}

function extractMethod(source: string, methodName: string): string {
  const header = new RegExp(
    `(?:^|[\\n;])\\s*(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(source);
  if (!header) {
    return '';
  }

  let index = header.index + header[0].length;
  let parenDepth = 1;
  while (index < source.length && parenDepth > 0) {
    if (source[index] === '(') parenDepth += 1;
    if (source[index] === ')') parenDepth -= 1;
    index += 1;
  }

  let angleDepth = 0;
  let braceStart = -1;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === '<') angleDepth += 1;
    if (char === '>') angleDepth -= 1;
    if (char === '{' && angleDepth === 0) {
      braceStart = cursor;
      break;
    }
  }

  if (braceStart < 0) {
    return '';
  }

  let depth = 0;
  for (let cursor = braceStart; cursor < source.length; cursor += 1) {
    if (source[cursor] === '{') depth += 1;
    if (source[cursor] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(header.index, cursor + 1);
      }
    }
  }

  return '';
}

const pageTs = readSource('src/app/features/settings/pages/configuracion.page.ts');
const pageHtml = readSource('src/app/features/settings/pages/configuracion.page.html');
const zenHtml = readSource(
  'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html'
);
const serviceTs = readSource('src/app/features/settings/data-access/business.service.ts');

describe('Issue #348 - settings load/persist visibility', () => {
  it('exposes a visible load error with retry and does not patch defaults after a failed load', () => {
    const hydrate = extractMethod(pageTs, 'hydrateBusinessSettings');

    expect(zenHtml).toMatch(/data-testid=["']settings-error-state["']/);
    expect(zenHtml).toMatch(/role=["']alert["']/);
    expect(zenHtml).toMatch(/data-testid=["']settings-retry-load["']/);
    expect(zenHtml).toMatch(/No pudimos cargar la configuraci[oó]n/);
    expect(zenHtml).toMatch(/Reintentar/);
    expect(zenHtml).toMatch(/@if\s*\(\s*!loading\(\)\s*&&\s*!loadError\(\)\s*\)/);

    expect(hydrate, 'hydrateBusinessSettings must exist').not.toEqual('');
    expect(hydrate).not.toMatch(/patchDefaultSettings/);
    expect(hydrate).toMatch(/loadError\.set|lastPersistenceError/);
    expect(hydrate).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*console\.error/);
  });

  it('fails loudly when BusinessService cannot load settings from Supabase', () => {
    const loadFromSupabase = extractMethod(serviceTs, 'loadFromSupabase');
    const getActiveBusinessId = extractMethod(serviceTs, 'getActiveBusinessId');

    expect(loadFromSupabase).not.toMatch(/if\s*\(\s*!this\.supabaseClient\s*\)\s*return;/);
    expect(loadFromSupabase).not.toMatch(
      /if\s*\(\s*businessError\s*\|\|\s*!businessData\s*\)\s*return;/
    );
    expect(`${loadFromSupabase}\n${serviceTs}`).toMatch(
      /BusinessSettingsPersistenceError|lastPersistenceError/
    );
    expect(getActiveBusinessId).not.toMatch(/catch\s*\{[\s\S]*return\s+null/);
  });

  it('persists profile identity by ownerId and retries a real reload', () => {
    const saveToSupabase = extractMethod(serviceTs, 'saveToSupabase');

    expect(saveToSupabase).toMatch(/\.from\(\s*['"]profiles['"]\s*\)/);
    expect(saveToSupabase).toMatch(/first_name/);
    expect(saveToSupabase).toMatch(/last_name/);
    expect(saveToSupabase).toMatch(/phone/);
    expect(saveToSupabase).toMatch(/ownerId/);
    const profileSave = saveToSupabase.match(
      /\.from\(\s*['"]profiles['"]\s*\)[\s\S]*?(?=\.from\(|$)/
    )?.[0] ?? '';
    expect(profileSave).toMatch(/context\.ownerId/);
    expect(profileSave).not.toMatch(/resolvedBusinessId/);
    expect(saveToSupabase).toMatch(/\.from\(\s*['"]businesses['"]\s*\)/);
    expect(saveToSupabase).toMatch(/loadFromSupabase/);

    expect(pageTs).toMatch(/hydratedUserId\s*=\s*null/);
    expect(pageTs).toMatch(/retryLoad|retrySettingsLoad|retryLoadSettings/);
    expect(pageTs).toMatch(/hydrateBusinessSettings/);
  });

  it('keeps the wrapper error hook for the existing UX contract', () => {
    expect(pageHtml).toMatch(/data-testid=["']settings-error-state["']/);
  });
});
