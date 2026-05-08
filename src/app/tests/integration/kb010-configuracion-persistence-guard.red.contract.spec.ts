/**
 * KB-010: Configuración persistence - TDD guard tests
 *
 * RED contract: these tests protect the expected persistence behavior for
 * business settings against Supabase, form sync, and resilience fallback.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BusinessSettingsFacade } from '../../facades/business-settings.facade';

type SupabaseSettingsPort = {
  loadFromSupabase?: (businessId: string) => Promise<unknown> | unknown;
  saveToSupabase?: (businessId: string, payload: unknown) => Promise<unknown> | unknown;
  syncFormState?: () => unknown;
  lastPersistenceError?: () => string | null;
  isSyncing?: () => boolean;
};

function readConfiguracionSources(): { facade: string; pageTs: string; pageHtml: string; merged: string } {
  const facadePath = resolve(process.cwd(), 'src/app/facades/business-settings.facade.ts');
  const pageTsPath = resolve(process.cwd(), 'src/app/pages/dashboard/configuracion/configuracion.page.ts');
  const pageHtmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/configuracion/configuracion.page.html');

  const facade = existsSync(facadePath) ? readFileSync(facadePath, 'utf-8') : '';
  const pageTs = existsSync(pageTsPath) ? readFileSync(pageTsPath, 'utf-8') : '';
  const pageHtml = existsSync(pageHtmlPath) ? readFileSync(pageHtmlPath, 'utf-8') : '';

  return {
    facade,
    pageTs,
    pageHtml,
    merged: `${facade}\n${pageTs}\n${pageHtml}`
  };
}

describe('KB-010.1 - Load settings from Supabase', () => {
  let facade: BusinessSettingsFacade;
  let supabasePort: SupabaseSettingsPort;

  beforeEach(() => {
    localStorage.clear();
    facade = new BusinessSettingsFacade();
    supabasePort = facade as unknown as SupabaseSettingsPort;
  });

  it('KB-010.1.1 @RED - wires official Supabase client for settings persistence path', () => {
    const { merged } = readConfiguracionSources();
    const hasSupabaseClient = /@supabase\/supabase-js|createClient\(/i.test(merged);
    const hasSettingsSelect = /from\(['"](business_settings|settings|salon_settings)['"]\)[\s\S]*select\(/i.test(merged);

    expect(hasSupabaseClient).toBe(true);
    expect(hasSettingsSelect).toBe(true);
  });

  it('KB-010.1.2 @RED - exposes loadFromSupabase and hydrates state contract', async () => {
    expect(typeof supabasePort.loadFromSupabase).toBe('function');

    const result = await Promise.resolve(supabasePort.loadFromSupabase?.('biz-kb010-load')) as {
      businessName?: string;
      bufferMinutes?: number;
      minNoticeMinutes?: number;
      slotIntervalMinutes?: number;
      workingHours?: unknown;
      updatedAt?: string;
    };

    expect(result.businessName).toBeTruthy();
    expect(typeof result.bufferMinutes).toBe('number');
    expect(typeof result.minNoticeMinutes).toBe('number');
    expect(typeof result.slotIntervalMinutes).toBe('number');
    expect(result.workingHours).toBeTruthy();
    expect(result.updatedAt).toBeTruthy();
  });
});

describe('KB-010.2 - Save/update settings to Supabase', () => {
  let facade: BusinessSettingsFacade;
  let supabasePort: SupabaseSettingsPort;

  beforeEach(() => {
    localStorage.clear();
    facade = new BusinessSettingsFacade();
    supabasePort = facade as unknown as SupabaseSettingsPort;
  });

  it('KB-010.2.1 @RED - source has upsert/update mutation for business settings table', () => {
    const { merged } = readConfiguracionSources();
    const hasMutation = /from\(['"](business_settings|settings|salon_settings)['"]\)[\s\S]*(upsert|update|insert)\(/i.test(merged);

    expect(hasMutation).toBe(true);
  });

  it('KB-010.2.2 @RED - saveToSupabase returns persisted contract identity (not local-only)', async () => {
    expect(typeof supabasePort.saveToSupabase).toBe('function');

    const payload = {
      businessName: 'KB010 Studio',
      bufferMinutes: 15,
      minNoticeMinutes: 120,
      slotIntervalMinutes: 30,
      workingHours: facade.getDefaultWorkingHours()
    };

    const persisted = await Promise.resolve(
      supabasePort.saveToSupabase?.('biz-kb010-save', payload)
    ) as {
      id?: string;
      businessId?: string;
      updatedAt?: string;
      source?: string;
    };

    expect(persisted.id ?? persisted.businessId).toBeTruthy();
    expect(String(persisted.source ?? '')).toMatch(/supabase|remote/i);
    expect(persisted.updatedAt).toBeTruthy();
  });
});

describe('KB-010.3 - Working hours persistence and validation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('KB-010.3.1 - keeps day-range validator contract (start < end)', () => {
    const { pageTs } = readConfiguracionSources();
    expect(pageTs).toMatch(/startMinutes\s*<\s*endMinutes\s*\?\s*null\s*:\s*\{\s*invalidRange:\s*true\s*\}/);
  });

  it('KB-010.3.2 - preserves workingHours matrix across save/get snapshot roundtrip', () => {
    const facade = new BusinessSettingsFacade();
    const mondayStart = '08:30';

    const persisted = facade.save({
      businessName: 'KB010 Hours',
      bufferMinutes: 10,
      minNoticeMinutes: 90,
      slotIntervalMinutes: 30,
      workingHours: {
        ...facade.getDefaultWorkingHours(),
        monday: { enabled: true, start: mondayStart, end: '17:00' }
      }
    });

    const snapshot = facade.getSnapshot();

    expect(snapshot?.workingHours.monday.start).toBe(mondayStart);
    expect(snapshot?.workingHours.monday.end).toBe('17:00');
    expect(persisted.workingHours.monday.start).toBe(mondayStart);
  });
});

describe('KB-010.4 - Booking policy persistence (buffer/min notice/slot interval)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('KB-010.4.1 - persists booking policy primitives in current snapshot contract', () => {
    const facade = new BusinessSettingsFacade();
    facade.save({
      businessName: 'KB010 Policy',
      bufferMinutes: 20,
      minNoticeMinutes: 180,
      slotIntervalMinutes: 45,
      workingHours: facade.getDefaultWorkingHours()
    });

    const snapshot = facade.getSnapshot();
    expect(snapshot?.bufferMinutes).toBe(20);
    expect(snapshot?.minNoticeMinutes).toBe(180);
    expect(snapshot?.slotIntervalMinutes).toBe(45);
  });

  it('KB-010.4.2 @RED - maps booking policy fields to Supabase schema contract', () => {
    const { merged } = readConfiguracionSources();
    const hasPolicyColumns = /buffer_minutes|min_notice_minutes|slot_interval_minutes/i.test(merged);
    expect(hasPolicyColumns).toBe(true);
  });
});

describe('KB-010.5 - Form state sync and error handling', () => {
  it('KB-010.5.1 - keeps invalid form guard + visible message contract', () => {
    const { pageTs } = readConfiguracionSources();
    expect(pageTs).toMatch(/settingsForm\.invalid/);
    expect(pageTs).toMatch(/markAllAsTouched\(/);
    expect(pageTs).toMatch(/formMessage\.set\(['"]Formulario inválido/i);
  });

  it('KB-010.5.2 @RED - exposes sync/error signals for remote persistence lifecycle', () => {
    const facade = new BusinessSettingsFacade() as unknown as SupabaseSettingsPort;

    expect(typeof facade.syncFormState).toBe('function');
    expect(typeof facade.lastPersistenceError).toBe('function');
    expect(typeof facade.isSyncing).toBe('function');
  });
});

describe('KB-010.6 - Fallback behavior when Supabase unavailable', () => {
  it('KB-010.6.1 @RED - source includes explicit fallback from Supabase to local storage', () => {
    const { merged } = readConfiguracionSources();
    const hasSupabaseFallback = /fallback[\s\S]*(localStorage|storage)|supabase[\s\S]*(unavailable|offline|timeout)[\s\S]*(localStorage|storage)/i.test(merged);
    expect(hasSupabaseFallback).toBe(true);
  });

  it('KB-010.6.2 @RED - loadFromSupabase fallback returns local snapshot on remote failure', async () => {
    const facade = new BusinessSettingsFacade();
    const supabasePort = facade as unknown as SupabaseSettingsPort;

    facade.save({
      businessName: 'KB010 Fallback Local',
      bufferMinutes: 5,
      minNoticeMinutes: 60,
      slotIntervalMinutes: 30,
      workingHours: facade.getDefaultWorkingHours()
    });

    expect(typeof supabasePort.loadFromSupabase).toBe('function');

    const result = await Promise.resolve(
      supabasePort.loadFromSupabase?.('biz-kb010-fallback')
    ) as { businessName?: string; source?: string };

    expect(result.businessName).toBe('KB010 Fallback Local');
    expect(String(result.source ?? '')).toMatch(/local|fallback/i);
  });
});
