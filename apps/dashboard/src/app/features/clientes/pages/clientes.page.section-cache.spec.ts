// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { provideZonelessChangeDetection, signal, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeService } from '../../../core/theming/theme.service';
import { ClienteService } from '../data-access/cliente.service';
import { ClientesPage } from './clientes.page';

const warmItems = [
  {
    id: 'c-1',
    nombre: 'Ada',
    apellido: 'Lovelace',
    telefono: '+543411234567',
    email: 'ada@example.com',
    activo: true,
    active: true
  }
];

describe('ClientesPage section cache remount', () => {
  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await resolveComponentResources(async (url: string) =>
      readFileSync(join(process.cwd(), 'src/app/features/clientes/pages', url.replace('./', '')), 'utf-8')
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not set loading true when items are already warm', () => {
    const getAll = vi.fn(() => of(warmItems));
    TestBed.configureTestingModule({
      imports: [ClientesPage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ClienteService,
          useValue: {
            items: signal(warmItems),
            isLoaded: () => true,
            getAll,
            darDeBajaCliente: vi.fn()
          }
        },
        { provide: ThemeService, useValue: { activeTheme: signal('zen') } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } }
        },
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    });

    const fixture = TestBed.createComponent(ClientesPage);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(getAll).not.toHaveBeenCalled();
  });
});
