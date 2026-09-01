import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = (...parts: string[]) => resolve(process.cwd(), ...parts);
const repoRoot = (...parts: string[]) => resolve(process.cwd(), '..', '..', ...parts);
const readIfPresent = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : '');

const helperPath = root('src/app/features/operator-web-push/operator-web-push-eligibility.ts');
const servicePath = root('src/app/features/operator-web-push/operator-web-push.service.ts');
const swPath = root('src/orvel-push-sw.js');
const homeHtml = readIfPresent(root('src/app/features/dashboard-home/pages/dashboard-home.page.html'));
const homeTs = readIfPresent(root('src/app/features/dashboard-home/pages/dashboard-home.page.ts'));
const settingsHtml = readIfPresent(
  root('src/app/features/settings/pages/themes/configuracion-zen-theme.component.html'),
);
const settingsPageTs = readIfPresent(root('src/app/features/settings/pages/configuracion.page.ts'));
const settingsThemeTs = readIfPresent(
  root('src/app/features/settings/pages/themes/configuracion-zen-theme.component.ts'),
);
const appConfig = readIfPresent(root('src/app/app.config.ts'));
const angularJson = readIfPresent(root('angular.json'));
const requiredEnv = readIfPresent(repoRoot('packages/config/src/dashboard-env.ts'));
const migrationDir = repoRoot('supabase/migrations');
const migrationFile =
  existsSync(migrationDir) ?
    readdirSync(migrationDir).find((name) => name.endsWith('_create_web_push_subscriptions.sql'))
  : undefined;
const migration = migrationFile ? readIfPresent(resolve(migrationDir, migrationFile)) : '';

describe('Issue #344 slice 1 — operator web push subscribe', () => {
  it('eligibility helper blocks iOS Safari tabs and never treats denied/unsupported as a page error', async () => {
    expect(existsSync(helperPath), 'operator-web-push-eligibility.ts must exist').toBe(true);
    const helper = await import('../../features/operator-web-push/operator-web-push-eligibility');
    const evaluate = helper.evaluateOperatorWebPush as (input: {
      isIos: boolean;
      isStandalone: boolean;
      notificationSupported: boolean;
      permission: 'default' | 'granted' | 'denied' | 'unsupported';
      vapidPublicKey?: string | null;
    }) => { canRequest: boolean; isPageError: boolean };

    expect(
      evaluate({
        isIos: true,
        isStandalone: false,
        notificationSupported: true,
        permission: 'default',
        vapidPublicKey: 'BK',
      }).canRequest,
    ).toBe(false);
    expect(
      evaluate({
        isIos: false,
        isStandalone: true,
        notificationSupported: true,
        permission: 'default',
        vapidPublicKey: 'BK',
      }).canRequest,
    ).toBe(true);
    expect(
      evaluate({
        isIos: true,
        isStandalone: true,
        notificationSupported: true,
        permission: 'default',
        vapidPublicKey: 'BK',
      }).canRequest,
    ).toBe(true);
    expect(
      evaluate({
        isIos: false,
        isStandalone: true,
        notificationSupported: true,
        permission: 'denied',
        vapidPublicKey: 'BK',
      }).isPageError,
    ).toBe(false);
    expect(
      evaluate({
        isIos: false,
        isStandalone: true,
        notificationSupported: false,
        permission: 'unsupported',
      }).isPageError,
    ).toBe(false);
  });

  it('home shows the push coach only when standalone and permission is default', () => {
    expect(homeHtml).toContain('data-testid="web-push-enable-coach"');
    expect(homeHtml).toContain('data-testid="web-push-enable"');
    expect(homeHtml).toMatch(/turno[s]?\s+(creado|crea)|crea[do]*.*cancelad|reprogramad/i);
    expect(homeHtml).toMatch(/creado/i);
    expect(homeHtml).toMatch(/cancelado/i);
    expect(homeHtml).toMatch(/reprogramado/i);
    expect(homeHtml).toMatch(/@if\s*\(\s*!isPwaStandalone\(\)\s*\)/);
    expect(homeHtml).toMatch(/web-push-enable-coach[\s\S]*web-push-enable|showWebPushCoach/);
    expect(homeTs).toMatch(/showWebPushCoach|permission.*default|Notification\.permission/);
    expect(homeTs).toMatch(/evaluateOperatorWebPush|canRequest|Notification\.permission/);
    expect(homeHtml.split('data-testid="web-push-enable-coach"').length - 1).toBeGreaterThanOrEqual(2);
    expect(homeHtml).not.toMatch(
      /@if\s*\(\s*!isPwaStandalone\(\)\s*\)[\s\S]{0,200}web-push-enable-coach/,
    );
  });

  it('service upserts owner-scoped web_push_subscriptions rows', () => {
    const service = readIfPresent(servicePath);
    expect(existsSync(servicePath)).toBe(true);
    expect(service).toContain('web_push_subscriptions');
    expect(service).toMatch(/upsert/);
    expect(service).toMatch(/endpoint/);
    expect(service).toMatch(/p256dh/);
    expect(service).toMatch(/\bauth\b/);
    expect(service).toMatch(/user_id/);
    expect(service).toMatch(/business_id/);
    expect(service).toMatch(/getActiveBusinessId/);
    expect(service).not.toMatch(/business_id\s*:\s*(user(?:Id)?|session\.user\.id)/);
    expect(requiredEnv).not.toMatch(/VAPID_PUBLIC_KEY/);
    expect(service).toContain('readVapidPublicKey');
    expect(readIfPresent(helperPath)).toMatch(/__ORVEL_DASHBOARD_ENV__|VAPID_PUBLIC_KEY/);
  });

  it('Configuración Perfil tab exposes a standalone avisos push switch', () => {
    const perfilTab = settingsHtml.split("activeSettingsTab() === 'perfil'")[1]?.split("activeSettingsTab() === 'negocio'")[0] ?? '';
    const equipoTab = settingsHtml.split("activeSettingsTab() === 'equipo'")[1] ?? '';
    expect(perfilTab).toContain('data-testid="settings-web-push-toggle"');
    expect(perfilTab).toContain('Avisos push');
    expect(perfilTab).toContain(
      'Te avisamos con la app cerrada si entra, se cancela o se reprograma un turno.',
    );
    expect(perfilTab).toMatch(/peer sr-only[\s\S]*role=["']switch["']/);
    expect(perfilTab).toMatch(/ngModelOptions[\s\S]*standalone:\s*true|standalone:\s*true/);
    expect(equipoTab).not.toContain('data-testid="settings-web-push-toggle"');
    expect(settingsPageTs).toMatch(/toggleWebPush|enableWebPush|webPushEnabled/);
    expect(settingsThemeTs).toMatch(/toggleWebPush|enableWebPush|webPushEnabled/);
    expect(settingsHtml).not.toMatch(/formControlName=["'][^"']*webPush/);
  });

  it('service can disable/unsubscribe and re-bind the current business_id after permission is granted', () => {
    const service = readIfPresent(servicePath);
    expect(service).toMatch(/\bdisable\s*\(/);
    expect(service).toMatch(/unsubscribe\s*\(/);
    expect(service).toMatch(/\.delete\(/);
    expect(service).toMatch(/onConflict:\s*['"]endpoint['"]/);
    expect(service).toMatch(/getSubscription\s*\(/);
    expect(service).toMatch(/status|webPushStatus|enabled/);
    expect(service).toMatch(/No se pudieron guardar los avisos push/);
    expect(service).not.toMatch(/Denied, missing VAPID, or persist failure must stay silent\./);
  });

  it('custom SW wraps ngsw-worker and opens /dashboard/turnos on click', () => {
    const sw = readIfPresent(swPath);
    expect(existsSync(swPath)).toBe(true);
    expect(sw).toContain("importScripts('./ngsw-worker.js')");
    expect(sw).toMatch(/addEventListener\(\s*['"]push['"]/);
    expect(sw).toMatch(/addEventListener\(\s*['"]notificationclick['"]/);
    expect(sw).toContain('/dashboard/turnos');
    expect(angularJson).toMatch(/orvel-push-sw\.js/);
  });

  it('app.config registers the custom SW immediately under /dashboard/', () => {
    expect(appConfig).toContain("provideServiceWorker('/dashboard/orvel-push-sw.js'");
    expect(appConfig).toContain('registerImmediately');
    expect(appConfig).toContain("scope: '/dashboard/'");
    expect(appConfig).not.toContain("provideServiceWorker('/dashboard/ngsw-worker.js'");
  });

  it('migration creates web_push_subscriptions with owner RLS and unique endpoint', () => {
    expect(migrationFile, 'timestamped create_web_push_subscriptions migration').toBeTruthy();
    expect(migration).toMatch(/create table if not exists public\.web_push_subscriptions/i);
    expect(migration).toMatch(/endpoint/i);
    expect(migration).toMatch(/p256dh/i);
    expect(migration).toMatch(/\bauth\b/i);
    expect(migration).toMatch(/user_id/i);
    expect(migration).toMatch(/business_id/i);
    expect(migration).toMatch(/unique\s*\(\s*endpoint\s*\)/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/user_id\s*=\s*auth\.uid\(\)/i);
    expect(migration).toMatch(/is_business_owner\s*\(\s*business_id\s*\)/i);
    expect(migration).toMatch(/for insert/i);
    expect(migration).toMatch(/for select/i);
    expect(migration).toMatch(/for delete/i);
  });
});
