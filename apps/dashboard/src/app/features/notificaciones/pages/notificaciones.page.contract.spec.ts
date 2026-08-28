import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./notificaciones.page.ts', import.meta.url), 'utf8');

describe('NotificacionesPage contract', () => {
  it('injects DashboardNotificationsService', () => {
    expect(source).toMatch(/from\s+['"][^'"]*core\/notifications\/dashboard-notifications\.service['"]/);
    expect(source).toMatch(/inject\(\s*DashboardNotificationsService/);
  });

  it('refreshes for an authenticated user', () => {
    expect(source).toMatch(/refreshForAdmin\s*\(/);
    expect(source).toMatch(/authenticated\s*\(/);
  });

  it('reads a notification on item click', () => {
    expect(source).toMatch(/readNotification\s*\(/);
  });

  it('exposes page and item test ids', () => {
    expect(source).toMatch(/data-testid=["']notificaciones-page["']/);
    expect(source).toMatch(/data-testid=["']notificaciones-item["']/);
  });

  it('renders title, body, and unread marker', () => {
    expect(source).toMatch(/\.title/);
    expect(source).toMatch(/\.body/);
    expect(source).toMatch(/unread/);
  });

  it('shows empty and error copy', () => {
    expect(source).toContain('No hay notificaciones');
    expect(source).toContain('No pudimos cargar las notificaciones');
  });

  it('reuses service error() or a failed refresh', () => {
    expect(source).toMatch(/\.error\s*\(/);
  });

  it('uses overflow-x-hidden and mobile p-4', () => {
    expect(source).toMatch(/overflow-x-hidden/);
    expect(source).toMatch(/\bp-4\b/);
  });

  it('gives each item a dismiss X that archives without marking read', () => {
    expect(source).toMatch(/data-testid=["']notificaciones-item-dismiss["']/);
    expect(source).toMatch(/aria-label=["']Descartar notificación["']/);
    expect(source).toMatch(/ri-close-line/);
    expect(source).toMatch(/archiveAdminNotification/);
    expect(source).toMatch(/stopPropagation/);
    expect(source).toMatch(/\(click\)="onRead\(notif\.id\)"/);

    const dismissOpenTag = source.slice(source.lastIndexOf('<', source.indexOf('notificaciones-item-dismiss')));
    const dismissTag = dismissOpenTag.match(/<[a-zA-Z][\w-]*\b[^>]*>/)?.[0] ?? '';
    expect(dismissTag).toMatch(/\(click\)="/);
    expect(dismissTag).not.toMatch(/onRead/);
  });
});
