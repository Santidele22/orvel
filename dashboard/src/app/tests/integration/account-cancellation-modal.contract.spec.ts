// @vitest-environment jsdom

import '@angular/compiler';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../core/theming/theme.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { ConfiguracionPage } from '../../features/settings/pages/configuracion.page';
import { requestSubscriptionCancellation } from '../../features/billing/data-access/payments/subscriptions/request-subscription-cancellation.api';

vi.mock('../../features/billing/data-access/payments/subscriptions/request-subscription-cancellation.api', () => {
  class RequestSubscriptionCancellationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    RequestSubscriptionCancellationError,
    requestSubscriptionCancellation: vi.fn(),
  };
});

const mockedRequestSubscriptionCancellation = requestSubscriptionCancellation as unknown as ReturnType<typeof vi.fn>;
const CONFIG_PAGE_TEMPLATE = resolve(process.cwd(), 'src/app/features/settings/pages/configuracion.page.html');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createPage(): ConfiguracionPage {
  return TestBed.runInInjectionContext(() => new ConfiguracionPage());
}

describe('Configuracion account cancellation modal behavior', () => {
  beforeAll(() => {
    try {
      TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    } catch {
      // Test environment may already be initialized by another Angular spec in the same run.
    }
  });

  beforeEach(() => {
    mockedRequestSubscriptionCancellation.mockReset();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({})) },
        },
        {
          provide: Router,
          useValue: { navigateByUrl: vi.fn() },
        },
        {
          provide: BusinessService,
          useValue: {
            settings: signal(null).asReadonly(),
            getSnapshot: () => null,
            getDefaultWorkingHours: () => ({}),
            getActiveBusinessId: vi.fn(async () => 'business-123'),
            loadFromSupabase: vi.fn(async () => undefined),
            save: vi.fn(async () => undefined),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({ id: 'user-123', email: 'santi@orvel.test', negocioNombre: 'Orvel', tipoNegocio: 'salon' }).asReadonly(),
            requestPasswordReset: vi.fn(async () => ({ success: true })),
          },
        },
        {
          provide: ThemeService,
          useValue: { activeTheme: signal('zen').asReadonly() },
        },
      ],
    });
  });

  it('keeps the template accessible while delegating cancellation through the modal state', async () => {
    const template = await readFile(CONFIG_PAGE_TEMPLATE, 'utf-8');

    expect(template).toMatch(/data-testid=["']account-cancellation-modal["']/i);
    expect(template).toMatch(/role=["']dialog["']/i);
    expect(template).toMatch(/aria-modal=["']true["']/i);
    expect(template).toMatch(/aria-labelledby=["']account-cancellation-modal-title["']/i);
    expect(template).toMatch(/data-testid=["']account-cancellation-confirm["']/i);
    expect(template).toMatch(/data-testid=["']account-cancellation-cancel["']/i);
    expect(template).toMatch(/data-testid=["']account-cancellation-modal-close["']/i);
    expect(template).toMatch(/data-testid=["']account-cancellation-modal-overlay["']/i);
    expect(template).not.toMatch(/Mercado Pago/i);
    expect(template).toMatch(/Santi/i);
    expect(template).toMatch(/baja/i);

    const overlayOpen = template.match(
      /<button\b[^>]*data-testid=["']account-cancellation-modal-overlay["'][^>]*>|<button\b[^>]*class=["'][^"']*["'][^>]*data-testid=["']account-cancellation-modal-overlay["']/i
    );
    const overlayClass =
      template.match(
        /<button\b[^>]*class=["']([^"']+)["'][^>]*data-testid=["']account-cancellation-modal-overlay["']/i
      )?.[1] ??
      template.match(
        /<button\b[^>]*data-testid=["']account-cancellation-modal-overlay["'][^>]*class=["']([^"']+)["']/i
      )?.[1] ??
      '';
    expect(overlayOpen, 'overlay button must remain for click-outside dismiss').toBeTruthy();
    expect(overlayClass).not.toContain('bg-text-primary');
    expect(overlayClass).not.toContain('--zen-overlay-opacity');
    expect(overlayClass).not.toContain('bg-black/65');

    const cardClass =
      template.match(
        /<div\b[^>]*class=["']([^"']+)["'][^>]*data-testid=["']account-cancellation-modal["']/i
      )?.[1] ??
      template.match(
        /<div\b[^>]*data-testid=["']account-cancellation-modal["'][^>]*class=["']([^"']+)["']/i
      )?.[1] ??
      '';
    expect(cardClass).toMatch(/\bmax-w-sm\b/);
    expect(cardClass).not.toContain('max-w-zen-content');
    expect(cardClass).not.toContain('p-zen-xxl');
  });

  it('keeps Seguridad de la cuenta compact with a transparent overlay', async () => {
    const template = await readFile(CONFIG_PAGE_TEMPLATE, 'utf-8');

    expect(template).toMatch(/data-testid=["']account-settings-modal["']/i);
    expect(template).toMatch(/data-testid=["']account-settings-modal-overlay["']/i);
    expect(template).toMatch(/data-testid=["']account-settings-modal-close["']/i);
    expect(template).toMatch(/data-testid=["']account-settings-cancel["']/i);
    expect(template).toMatch(/Enviar correo de recuperación/i);

    const overlayClass =
      template.match(
        /<button\b[^>]*class=["']([^"']+)["'][^>]*data-testid=["']account-settings-modal-overlay["']/i
      )?.[1] ??
      template.match(
        /<button\b[^>]*data-testid=["']account-settings-modal-overlay["'][^>]*class=["']([^"']+)["']/i
      )?.[1] ??
      '';
    expect(overlayClass).toContain('bg-transparent');
    expect(overlayClass).not.toContain('bg-text-primary');
    expect(overlayClass).not.toContain('--zen-overlay-opacity');
    expect(overlayClass).not.toContain('bg-black/65');

    const cardClass =
      template.match(
        /<div\b[^>]*class=["']([^"']+)["'][^>]*data-testid=["']account-settings-modal["']/i
      )?.[1] ??
      template.match(
        /<div\b[^>]*data-testid=["']account-settings-modal["'][^>]*class=["']([^"']+)["']/i
      )?.[1] ??
      '';
    expect(cardClass).toMatch(/\bmax-w-sm\b/);
    expect(cardClass).toMatch(/\bp-zen-md\b/);
    expect(cardClass).not.toContain('max-w-zen-content');
    expect(cardClass).not.toContain('p-zen-xxl');
  });

  it('opens the account-cancellation modal through the component action and resets transient state', () => {
    const page = createPage();
    page.accountCancellationError.set('previous error');
    page.accountCancellationMessage.set('previous success');
    page.accountCancellationSubmitted.set(true);

    page.openAccountCancellationModal();

    expect(page.isAccountCancellationModalOpen()).toBe(true);
    expect(page.accountCancellationError()).toBeNull();
    expect(page.accountCancellationMessage()).toBeNull();
    expect(page.accountCancellationSubmitted()).toBe(false);
  });

  it('confirms account cancellation with backend account mode and records success state', async () => {
    mockedRequestSubscriptionCancellation.mockResolvedValue({
      ok: true,
      requestStatus: 'scheduled_account_closure',
      requestedAt: '2026-07-04T12:00:00.000Z',
      reason: 'manual_request',
      message: 'Baja de cuenta solicitada',
      subscription: { id: 'subscription-1', status: 'active', periodEnd: '2026-08-01T00:00:00.000Z' },
      accountClosureAt: '2026-08-01T00:00:00.000Z',
    });
    const page = createPage();

    await page.confirmAccountCancellation();

    expect(mockedRequestSubscriptionCancellation).toHaveBeenCalledWith({
      businessId: 'business-123',
      reason: 'manual_request',
      mode: 'account_cancellation',
    });
    expect(page.accountCancellationSubmitted()).toBe(true);
    expect(page.accountCancellationMessage()).toMatch(/pedido de baja|Santi/i);
    expect(page.accountCancellationMessage()).not.toMatch(/Mercado Pago/i);
    expect(page.loading()).toBe(false);
  });

  it('keeps loading state while the account-cancellation request is pending', async () => {
    const pending = deferred<Awaited<ReturnType<typeof requestSubscriptionCancellation>>>();
    mockedRequestSubscriptionCancellation.mockReturnValue(pending.promise);
    const page = createPage();

    const confirmation = page.confirmAccountCancellation();

    expect(page.loading()).toBe(true);
    expect(page.accountCancellationError()).toBeNull();

    pending.resolve({
      ok: true,
      requestStatus: 'scheduled_account_closure',
      requestedAt: '2026-07-04T12:00:00.000Z',
      reason: 'manual_request',
      message: 'Baja de cuenta solicitada',
      subscription: { id: 'subscription-1', status: 'active', periodEnd: null },
    });
    await confirmation;

    expect(page.loading()).toBe(false);
    expect(page.accountCancellationSubmitted()).toBe(true);
  });

  it('records an error state when account cancellation fails', async () => {
    mockedRequestSubscriptionCancellation.mockRejectedValue(new Error('Backend unavailable'));
    const page = createPage();

    await page.confirmAccountCancellation();

    expect(page.accountCancellationSubmitted()).toBe(false);
    expect(page.loading()).toBe(false);
    expect(page.accountCancellationError()).toBe('No pudimos solicitar la baja de la cuenta. Contactá soporte.');
  });
});
