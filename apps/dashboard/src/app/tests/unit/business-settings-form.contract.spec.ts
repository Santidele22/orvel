import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function readConfiguracionTsSource(): string {
  const tsPath = resolve(
    process.cwd(),
    'src/app/features/settings/pages/configuracion.page.ts'
  );

  return existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
}

function readConfiguracionZenTemplate(): string {
  const htmlPath = resolve(
    process.cwd(),
    'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html'
  );

  return existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';
}

function readBusinessServiceSource(): string {
  const servicePath = resolve(
    process.cwd(),
    'src/app/features/settings/data-access/business.service.ts'
  );

  return existsSync(servicePath) ? readFileSync(servicePath, 'utf-8') : '';
}

function readMigrationSources(): string[] {
  const migrationsDir = resolve(process.cwd(), '../../supabase/migrations');
  if (!existsSync(migrationsDir)) return [];

  return readdirSync(migrationsDir)
    .filter(fileName => fileName.endsWith('.sql'))
    .sort()
    .map(fileName => readFileSync(resolve(migrationsDir, fileName), 'utf-8'));
}

function extractBusinessSettingsSchemaColumns(migrationSources: string[]): Set<string> {
  const columns = new Set<string>();

  for (const source of migrationSources) {
    const createTableMatch = source.match(/create\s+table\s+if\s+not\s+exists\s+public\.business_settings\s*\(([\s\S]*?)\n\);/i);
    if (createTableMatch) {
      for (const line of createTableMatch[1].split('\n')) {
        const column = line.trim().match(/^([a-z_][a-z0-9_]*)\b/i)?.[1];
        if (column && !['constraint', 'primary', 'foreign', 'unique', 'check'].includes(column.toLowerCase())) {
          columns.add(column.toLowerCase());
        }
      }
    }

    const alterBusinessSettingsBlocks = source.match(/alter\s+table\s+public\.business_settings[\s\S]*?;/gi) ?? [];
    for (const block of alterBusinessSettingsBlocks) {
      for (const match of block.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\b/gi)) {
        columns.add(match[1].toLowerCase());
      }
    }
  }

  return columns;
}

function extractBusinessSettingsUpsertPayloadColumns(serviceSource: string): string[] {
  const tableIndex = serviceSource.search(/\.from\(['"]business_settings['"]\)/i);
  if (tableIndex < 0) return [];

  const upsertStart = serviceSource.indexOf('.upsert({', tableIndex);
  if (upsertStart < 0) return [];

  const objectStart = serviceSource.indexOf('{', upsertStart);
  let depth = 0;
  for (let index = objectStart; index < serviceSource.length; index += 1) {
    const char = serviceSource[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      const objectBody = serviceSource.slice(objectStart + 1, index);
      return [...objectBody.matchAll(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map(match => match[1].toLowerCase());
    }
  }

  return [];
}

describe('Sprint 2 RED - Business Settings form contract', () => {
  it('defines typed reactive form controls for settings fields', () => {
    // TODO(Aurora): modelar reactive form tipado para settings (mock mode)
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/nonNullable\.group\(/);
    expect(source).toMatch(/(businessName|nombreNegocio)\s*:/);
    expect(source).toMatch(/(bufferMinutes|minutosBuffer)\s*:/);
    expect(source).toMatch(/(minNoticeMinutes|avisoMinimo)\s*:/);
    expect(source).toMatch(/(slotIntervalMinutes|intervaloTurno)\s*:/);
    expect(source).toMatch(/\bcapacity\b\s*:/);
  });

  it('keeps business capacity configurable with safe minimum validation', () => {
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/\bcapacity\b\s*:\s*\[[^\]]+Validators\.min\(1\)/);
  });

  it('persists positive submit through a mock facade/service contract', () => {
    // TODO(Aurora): implementar submit válido que persista vía facade/service mock (sin Supabase)
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/onSubmit\s*\(/);
    expect(source).toMatch(/(facade|service)/i);
    expect(source).toMatch(/\.(save|update|persist|upsert)\s*\(/i);
  });

  it('blocks invalid numeric values such as negative buffer minutes', () => {
    // TODO(Aurora): impedir valores negativos en campos numéricos y bloquear submit inválido
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/Validators\.min\(0\)|<\s*0/);
    expect(source).toMatch(/(invalid|setErrors|markAllAsTouched)/i);
    expect(source).toMatch(/if\s*\(.*invalid.*\)\s*\{[\s\S]*return;/i);
  });

  it('displays FREE/free plan as Free and never as Socio Starter', () => {
    const source = readConfiguracionTsSource();
    const template = readConfiguracionZenTemplate();

    expect(source, 'ConfiguracionPage should expose a normalized display label for settings plans.').toMatch(
      /(?:planDisplayLabel|formatPlanLabel|normalizePlanDisplay)/
    );
    expect(template).toMatch(/(?:planDisplayLabel|formatPlanLabel|normalizePlanDisplay)/);
    expect(template, 'Settings must not render the raw persisted plan value in the Socio badge.').not.toMatch(
      /Socio\s+\{\{\s*settingsForm\.get\(['"]plan['"]\)\?\.value\s*\}\}/
    );
    expect(`${source}\n${template}`).toMatch(/Free/);
  });

  it('does not render Orvel-owned business type, logo URL, or cover URL controls', () => {
    const template = readConfiguracionZenTemplate();

    for (const field of ['businessType', 'logoUrl', 'coverUrl']) {
      expect(template, `${field} may exist as internal compatibility state but must not be editable in settings UI`).not.toMatch(
        new RegExp(`<(?:input|select|textarea)\\b[^>]*formControlName=["']${field}["']`, 'i')
      );
    }

    expect(template, 'Business type is fixed by Orvel onboarding/style and must not be visible in settings').not.toMatch(/Tipo\s+de\s+negocio/i);
    expect(template, 'Logo URL is Orvel-owned style state and must not be visible in settings').not.toMatch(/URL\s+del\s+logo|Logo\s+URL/i);
    expect(template, 'Cover URL is Orvel-owned style state and must not be visible in settings').not.toMatch(/URL\s+de\s+portada|Cover\s+URL/i);
  });

  it('saves business_settings with schema-backed columns only', () => {
    const schemaColumns = extractBusinessSettingsSchemaColumns(readMigrationSources());
    const payloadColumns = extractBusinessSettingsUpsertPayloadColumns(readBusinessServiceSource());

    expect(schemaColumns.size, 'contract must inspect checked-in Supabase migrations for business_settings columns').toBeGreaterThan(0);
    expect(payloadColumns, 'BusinessService.saveToSupabase must upsert a deterministic business_settings payload').toContain('business_id');

    const unknownColumns = payloadColumns.filter(column => !schemaColumns.has(column));
    expect(
      unknownColumns,
      `BusinessService.saveToSupabase must not send unknown business_settings columns; build a schema-backed payload instead. Unknown columns: ${unknownColumns.join(', ')}`
    ).toEqual([]);
  });

  it('includes the business slug when saving business_settings', () => {
    const payloadColumns = extractBusinessSettingsUpsertPayloadColumns(readBusinessServiceSource());

    expect(
      payloadColumns,
      'BusinessService.saveToSupabase must preserve business_settings.slug because production requires it for the public booking identity.'
    ).toContain('slug');
  });
});
