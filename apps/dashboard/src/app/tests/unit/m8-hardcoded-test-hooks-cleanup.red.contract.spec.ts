import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(process.cwd(), 'src/app');
const REPO_ROOT = path.resolve(process.cwd(), '../..');
const LANDING_ROOT = path.join(REPO_ROOT, 'apps/landing/src');

function readApp(relativePath: string): string {
  return readFileSync(path.join(APP_ROOT, relativePath), 'utf8');
}

function readIfExists(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function listFiles(root: string, extensions: string[], ignoredSegments = ['tests', '__tests__']): string[] {
  if (!existsSync(root)) return [];

  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    const relativeSegments = absolutePath.split(path.sep);

    if (ignoredSegments.some((segment) => relativeSegments.includes(segment))) {
      return [];
    }

    if (entry.isDirectory()) {
      return listFiles(absolutePath, extensions, ignoredSegments);
    }

    if (!entry.isFile()) return [];
    if (/\.(?:spec|test)\.[cm]?[tj]sx?$/.test(entry.name)) return [];

    return extensions.some((extension) => entry.name.endsWith(extension)) ? [absolutePath] : [];
  });
}

function joinSources(files: string[]): string {
  return files.map((file) => `\n/* ${path.relative(REPO_ROOT, file)} */\n${readFileSync(file, 'utf8')}`).join('\n');
}

function tagElement(source: string, tagName: string, testId: string): string {
  const match = source.match(new RegExp(`<${tagName}\\b(?=[^>]*data-testid=["']${testId}["'])[^>]*>`, 'i'));
  return match?.[0] ?? '';
}

function sourceFrom(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `${marker} must exist before checking its productive source segment`).toBeGreaterThanOrEqual(0);
  return source.slice(markerIndex);
}

describe('RED Contract M8: hardcoded/test hooks/fake history cleanup', () => {
  const turnosTemplate = readApp('features/booking/pages/turnos-list.page.html');
  const turnosController = readApp('features/booking/pages/turnos-list.page.ts');
  const appRoutes = readApp('app.routes.ts');
  const productiveDashboardSource = joinSources(listFiles(APP_ROOT, ['.ts', '.html']));
  const productiveLandingSource = joinSources(listFiles(LANDING_ROOT, ['.ts', '.astro', '.js']));

  it('admin turnos primary actions are visible UX controls, not sr-only compatibility hooks', () => {
    const primaryActions = [
      tagElement(turnosTemplate, 'a', 'turnos-admin-create-primary-action'),
      tagElement(turnosTemplate, 'button', 'turnos-admin-block-time-primary-action'),
      tagElement(turnosTemplate, 'button', 'turnos-admin-reschedule-action'),
      tagElement(turnosTemplate, 'button', 'turno-admin-cancel-action')
    ];

    expect(primaryActions.every(Boolean), 'create/block/reschedule/cancel visible actions must be present').toBe(true);
    for (const action of primaryActions) {
      expect(action).not.toMatch(/\bsr-only\b|\bhidden\b|aria-hidden=["']true["']|display:\s*none/i);
    }

    expect(turnosTemplate, 'legacy hidden admin action hooks must be removed instead of kept as primary UX').not.toMatch(
      /<button\b(?=[^>]*\bsr-only\b)(?=[^>]*data-testid=["'](?:turno-admin-manual-booking-open|turno-admin-manual-booking-submit|turno-admin-blocked-time-open|turno-admin-blocked-time-submit|turno-admin-reschedule-action|turnos-admin-create-action|turnos-admin-edit-action|turnos-admin-cancel-action)["'])/i
    );
  });

  it('admin action payloads do not use stale hardcoded identities, reasons, or current-time fake history defaults', () => {
    const adminActionSource = `${turnosController}\n${readApp('features/booking/data-access/turno.service.ts')}`;
    const mockProviderHistorySegment = sourceFrom(adminActionSource, 'private getMockProviderTurnos');

    expect(adminActionSource).not.toMatch(/['"]Lunch break['"]|['"]\+60min quick reschedule['"]|['"]admin-ui['"]|performedBy:\s*['"]admin['"]/i);
    expect(adminActionSource).not.toMatch(/blockId:\s*['"]mock-block-['"]\s*\+\s*Date\.now\(\)/i);
    expect(mockProviderHistorySegment, 'productive service must not keep fake current-day appointment histories').not.toMatch(
      /const\s+hoy\s*=\s*new Date\(\)|\b(?:ayer|manana)\.setDate\(|fecha:\s*(?:hoy|manana|ayer|new Date\(\s*\))/i
    );
  });

  it('productive dashboard and landing routing expose subscription/preapproval billing, not old checkout remnants', () => {
    const landingPages = listFiles(path.join(LANDING_ROOT, 'pages'), ['.ts', '.astro', '.js']);
    const routeSurface = [appRoutes, joinSources(landingPages)].join('\n');
    const fileNames = [
      ...listFiles(APP_ROOT, ['.ts', '.html']).map((file) => path.relative(APP_ROOT, file)),
      ...landingPages.map((file) => path.relative(LANDING_ROOT, file))
    ].join('\n');

    expect(routeSurface).toMatch(/billing\/subscription|api\/subscriptions|preapproval/i);
    expect(routeSurface).not.toMatch(/path:\s*['"][^'"]*checkout|\/api\/checkout|\/checkout\b/i);
    expect(fileNames).not.toMatch(/(?:^|\/)checkout(?:\.|\/|-)|checkout[-_]?session/i);
  });

  it('public manage frontend never direct-selects, filters, or logs manage_token', () => {
    const publicManageSource = [
      readApp('features/booking/pages/public/manage-booking.page.ts'),
      readApp('features/booking/pages/public/manage-booking.page.html'),
      readApp('features/booking/data-access/public-booking.service.ts'),
      readApp('core/api/supabase-booking.api.ts'),
      readIfExists(path.join(APP_ROOT, 'core/api/supabase-booking.gateway.ts')),
      readIfExists(path.join(APP_ROOT, 'core/api/supabase-booking/real-gateway.ts'))
    ].join('\n');

    expect(publicManageSource).not.toMatch(/\.eq\(\s*['"]manage_token['"]\s*,/i);
    expect(publicManageSource).not.toMatch(/\.select\([^)]*manage_token/i);
    expect(publicManageSource).not.toMatch(/console\.(?:log|warn|error)\([^)]*(?:manage_token|manageToken|management_key|token)[^)]*\)/i);
  });

  it('mock sessions/providers are explicitly dev/test gated and cannot create productive auto-login identity', () => {
    const authAndOnboardingSource = [
      readApp('services/auth.service.ts'),
      readIfExists(path.join(APP_ROOT, 'core/auth/mock-login-business-types.ts')),
      readIfExists(path.join(APP_ROOT, 'features/onboarding/pages/onboarding-business-step.page.ts')),
      readIfExists(path.join(APP_ROOT, 'core/auth/route-protection.ts'))
    ].join('\n');

    expect(authAndOnboardingSource).not.toMatch(/localStorage\.setItem\([^)]*(?:TURNERA_SESSION_KEY|salon_auth)[\s\S]{0,240}(?:navigateByUrl\(['"]\/dashboard|isAuthenticated\.set\(true\))/i);
    expect(authAndOnboardingSource).not.toMatch(/email:\s*['"]demo@|id:\s*['"]user-001['"]|token:\s*`mock\.jwt\.|return\s+['"]mock_['"]\s*\+/i);
    expect(authAndOnboardingSource).toMatch(/import\.meta\.env\.(?:DEV|MODE)|process\.env\.NODE_ENV|environment\.(?:production|mock|dev)|provider\s*={2,3}\s*['"]mock['"]/i);
  });

  it('known TS build-blocker files stay under focused typecheck watch instead of being hidden by M8 cleanup', () => {
    const blockerFiles = [
      'core/api/supabase-booking.gateway.ts',
      'features/onboarding/pages/onboarding-business-step.page.ts',
      'shared/dashboard-shell/dashboard-shell.component.ts'
    ];

    for (const blockerFile of blockerFiles) {
      expect(existsSync(path.join(APP_ROOT, blockerFile)), `${blockerFile} must remain visible for targeted typecheck`).toBe(true);
    }
  });
});
