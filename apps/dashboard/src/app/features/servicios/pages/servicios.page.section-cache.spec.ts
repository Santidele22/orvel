// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { provideZonelessChangeDetection, signal, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeService } from '../../../core/theming/theme.service';
import { ServicioService } from '../data-access/servicio.service';
import { ServiciosPage } from './servicios.page';

const warmItems = [
  {
    id: 's-1',
    nombre: 'Corte',
    categoria: 'Cortes',
    duracionMinutos: 30,
    precio: 1000,
    activo: true,
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

describe('ServiciosPage section cache remount', () => {
  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await resolveComponentResources(async (url: string) =>
      readFileSync(join(process.cwd(), 'src/app/features/servicios/pages', url.replace('./', '')), 'utf-8')
    );
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('does not set loading true when items are already warm', () => {
    const getAll = vi.fn(() => of(warmItems));
    TestBed.configureTestingModule({
      imports: [ServiciosPage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ServicioService,
          useValue: {
            items: signal(warmItems),
            isLoaded: () => true,
            getAll,
            listCategorias: () => []
          }
        },
        { provide: ThemeService, useValue: { activeTheme: signal('zen') } }
      ]
    });

    const fixture = TestBed.createComponent(ServiciosPage);
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(getAll).not.toHaveBeenCalled();
  });
});
