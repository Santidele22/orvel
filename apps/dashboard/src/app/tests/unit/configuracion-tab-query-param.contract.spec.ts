// @vitest-environment jsdom

import '@angular/compiler';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../core/theming/theme.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { ConfiguracionPage } from '../../features/settings/pages/configuracion.page';

describe('ConfiguracionPage tab query param behavior', () => {
  let queryParamMap: Subject<ReturnType<typeof convertToParamMap>>;

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    queryParamMap = new Subject<ReturnType<typeof convertToParamMap>>();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: queryParamMap.asObservable()
          }
        },
        {
          provide: BusinessService,
          useValue: {
            settings: signal(null).asReadonly(),
            getSnapshot: () => null,
            getDefaultWorkingHours: () => ({})
          }
        },
        {
          provide: AuthService,
          useValue: {
            user: signal(null).asReadonly(),
            requestPasswordReset: async () => ({ success: true })
          }
        },
        {
          provide: ThemeService,
          useValue: {
            activeTheme: signal('zen').asReadonly()
          }
        }
      ]
    });
  });

  it.each([
    ['perfil', 'perfil'],
    ['negocio', 'negocio']
  ] as const)('selects the %s settings tab from ?tab=%s', (_label, tab) => {
    const page = TestBed.runInInjectionContext(() => new ConfiguracionPage());

    queryParamMap.next(convertToParamMap({ tab }));

    expect(page.activeSettingsTab()).toBe(tab);
  });

  it('ignores unsupported tab query params and keeps the default profile tab', () => {
    const page = TestBed.runInInjectionContext(() => new ConfiguracionPage());

    queryParamMap.next(convertToParamMap({ tab: 'billing' }));

    expect(page.activeSettingsTab()).toBe('perfil');
  });
});
