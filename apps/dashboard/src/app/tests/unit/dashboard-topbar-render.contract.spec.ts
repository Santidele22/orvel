// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import '@angular/compiler';
import { CommonModule, NgComponentOutlet } from '@angular/common';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { DashboardNotificationsService } from '../../core/notifications/dashboard-notifications.service';
import { ZenTopbarComponent } from '../../shared/dashboard-topbar/templates/zen-topbar.component';

const dashboardTopbarTemplate = readFileSync(
  join(process.cwd(), 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html'),
  'utf-8'
);

@Component({
  standalone: true,
  imports: [CommonModule, NgComponentOutlet],
  template: dashboardTopbarTemplate
})
class DashboardTopbarWrapperHostComponent {
  protected readonly activeTemplate = signal({ topbarComponent: ZenTopbarComponent }).asReadonly();
  protected readonly templateInputs = signal({ onLogout: vi.fn() }).asReadonly();
}

describe('Dashboard topbar rendered behavior', () => {
  const authenticated = signal(true);
  const notificationError = signal<string | null>(null);
  let refreshForAdmin: ReturnType<typeof vi.fn>;

  const authenticatedUser = signal({
    id: 'user-123',
    email: 'santi@example.com',
    nombre: 'Santi',
    apellido: 'Idele',
    negocioNombre: 'Orvel Studio',
    tipoNegocio: 'otro',
    telefono: '',
    plan: '',
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z')
  });

  const businessSettings = signal({
    businessName: 'Orvel Studio',
    firstName: 'Santi',
    lastName: 'Idele'
  });

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    authenticated.set(true);
    notificationError.set(null);
    refreshForAdmin = vi.fn().mockResolvedValue(undefined);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ZenTopbarComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: authenticatedUser.asReadonly(),
            authenticated: authenticated.asReadonly(),
            logout: vi.fn()
          }
        },
        {
          provide: BusinessService,
          useValue: {
            settings: businessSettings.asReadonly()
          }
        },
        {
          provide: DashboardNotificationsService,
          useValue: {
            loading: signal(false).asReadonly(),
            notificationsUnread: signal(false).asReadonly(),
            notifications: signal([]).asReadonly(),
            unreadNotificationCount: signal(0).asReadonly(),
            error: notificationError.asReadonly(),
            refreshForAdmin,
            readNotification: vi.fn().mockResolvedValue(undefined),
            archiveAdminNotification: vi.fn().mockResolvedValue(undefined),
            clearAll: vi.fn().mockResolvedValue(undefined)
          }
        }
      ]
    });
  });

  it.each([
    ['tablet', 768],
    ['desktop', 1280]
  ])('renders the topbar user area at %s width', async (_label, width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const topbar = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement | null;
    const notifications = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-notifications"]') as HTMLElement | null;
    expect(topbar).not.toBeNull();
    expect(topbar?.hidden).toBe(false);
    expect(topbar?.className).not.toMatch(/(?:^|\s)(?:hidden|lg:hidden)(?:\s|$)/);
    expect(notifications).not.toBeNull();
    expect(topbar?.textContent).toContain('Santi Idele');
  });

  it('displays the authenticated profile name instead of a generic Usuario label', async () => {
    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const topbar = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement;

    expect(topbar.textContent).toContain('Santi Idele');
    expect(topbar.textContent).not.toContain('Usuario');
  });

  it('opens the user menu with functional profile, settings, and logout actions', async () => {
    const logoutSpy = vi.fn();
    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.componentRef.setInput('onLogout', logoutSpy);
    fixture.detectChanges();
    await fixture.whenStable();

    const userMenuButton = fixture.nativeElement.querySelector('button.group') as HTMLButtonElement;
    userMenuButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const profileAction = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-profile-action"]') as HTMLAnchorElement | null;
    const settingsAction = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-settings-action"]') as HTMLAnchorElement | null;
    const logoutAction = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-logout-action"]') as HTMLButtonElement | null;

    expect(profileAction?.getAttribute('href')).toBe('/dashboard/configuracion?tab=perfil');
    expect(settingsAction?.getAttribute('href')).toBe('/dashboard/configuracion?tab=negocio');

    logoutAction?.click();
    expect(logoutSpy).toHaveBeenCalledOnce();
  });

  it('opens the notifications empty state from the bell button', async () => {
    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const notifications = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-notifications"]') as HTMLButtonElement;
    notifications.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const topbar = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement;
    expect(notifications.getAttribute('aria-expanded')).toBe('true');
    expect(topbar.textContent).toContain('No hay notificaciones');
  });

  it('opens the notifications panel in an empty degraded state when auth is not ready', async () => {
    authenticated.set(false);

    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const notifications = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-notifications"]') as HTMLButtonElement;
    notifications.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const topbar = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement;
    expect(notifications.getAttribute('aria-expanded')).toBe('true');
    expect(topbar.textContent).toContain('No hay notificaciones');
    expect(refreshForAdmin).not.toHaveBeenCalled();
  });

  it('shows retryable degraded copy when refreshing notifications rejects', async () => {
    authenticated.set(false);

    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    authenticated.set(true);
    refreshForAdmin.mockRejectedValueOnce(new Error('remote table secret failure'));

    const notifications = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-notifications"]') as HTMLButtonElement;
    notifications.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const topbar = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement;
    expect(topbar.textContent).toContain('No pudimos cargar las notificaciones');
    expect(topbar.textContent).toContain('Intentá de nuevo en unos segundos');
    expect(topbar.textContent).not.toContain('No hay notificaciones');
    expect(topbar.textContent).not.toContain('remote table secret failure');
  });

  it('shows retryable degraded copy when the notifications service reports an error state', async () => {
    notificationError.set('remote table secret failure');

    const fixture = TestBed.createComponent(ZenTopbarComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const notifications = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-notifications"]') as HTMLButtonElement;
    notifications.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const topbar = fixture.nativeElement.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement;
    expect(topbar.textContent).toContain('No pudimos cargar las notificaciones');
    expect(topbar.textContent).not.toContain('No hay notificaciones');
    expect(topbar.textContent).not.toContain('remote table secret failure');
  });

  it.each([
    ['tablet', 768],
    ['desktop', 1280]
  ])('keeps the composed DashboardTopbar wrapper visible and rendering ZenTopbar at %s width', async (_label, width) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardTopbarWrapperHostComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: authenticatedUser.asReadonly(),
            authenticated: signal(true).asReadonly(),
            logout: vi.fn()
          }
        },
        {
          provide: BusinessService,
          useValue: {
            settings: businessSettings.asReadonly()
          }
        },
        {
          provide: DashboardNotificationsService,
          useValue: {
            loading: signal(false).asReadonly(),
            notificationsUnread: signal(false).asReadonly(),
            notifications: signal([]).asReadonly(),
            unreadNotificationCount: signal(0).asReadonly(),
            error: signal(null).asReadonly(),
            refreshForAdmin: vi.fn().mockResolvedValue(undefined),
            readNotification: vi.fn().mockResolvedValue(undefined),
            archiveAdminNotification: vi.fn().mockResolvedValue(undefined),
            clearAll: vi.fn().mockResolvedValue(undefined)
          }
        }
      ]
    });

    const fixture = TestBed.createComponent(DashboardTopbarWrapperHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    const composedWrapper = Array.from(fixture.nativeElement.children)
      .find((element): element is HTMLElement => element instanceof HTMLElement && !element.classList.contains('sr-only'));
    const wrapperClasses = Array.from(composedWrapper?.classList ?? []);
    const renderedTopbar = composedWrapper?.querySelector('[data-testid="dashboard-topbar-responsive"]') as HTMLElement | null;
    const notifications = composedWrapper?.querySelector('[data-testid="dashboard-topbar-notifications"]') as HTMLElement | null;

    expect(composedWrapper).not.toBeUndefined();
    expect(wrapperClasses).toEqual(expect.arrayContaining(['relative', 'sm:block', 'md:block', 'lg:block']));
    expect(wrapperClasses).not.toContain('hidden');
    expect(wrapperClasses).not.toContain('lg:hidden');
    expect(renderedTopbar).not.toBeNull();
    expect(notifications).not.toBeNull();
    expect(renderedTopbar?.textContent).toContain('Santi Idele');
  });
});
