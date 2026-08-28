// @vitest-environment jsdom

import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import { BusinessService } from '../../settings/data-access/business.service';
import { ServicioService } from './servicio.service';

async function flushDelay(ms = 350): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ServicioService section cache', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function createService(): ServicioService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ServicioService,
        { provide: AuthService, useValue: { user: () => ({ tipoNegocio: 'peluqueria' }) } },
        { provide: BusinessService, useValue: { settings: () => ({ businessType: 'peluqueria' }) } }
      ]
    });
    const service = TestBed.inject(ServicioService);
    service.setProvider('mock');
    return service;
  }

  it('getAll second call does not hit the mock/network source when warm, including empty lists', async () => {
    const service = createService();
    const loadSpy = vi.spyOn(service as unknown as { getMockServicios: () => unknown[] }, 'getMockServicios');
    loadSpy.mockReturnValue([]);

    const first = await firstValueFrom(service.getAll());
    await flushDelay();
    expect(first).toEqual([]);
    expect(service.isLoaded()).toBe(true);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    const loadingDuringSecond: boolean[] = [];
    const secondPromise = firstValueFrom(service.getAll());
    loadingDuringSecond.push(service.isLoading());
    await secondPromise;
    expect(loadingDuringSecond).toEqual([false]);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('create, update, delete, and category persist invalidate the list cache', async () => {
    const service = createService();
    await firstValueFrom(service.getAll());
    await flushDelay();
    const invalidate = vi.spyOn(service, 'invalidate');

    const created = await firstValueFrom(
      service.create({
        nombre: 'Corte',
        categoria: 'Cortes',
        duracionMinutos: 30,
        precio: 1000,
        activo: true
      })
    );
    expect(invalidate).toHaveBeenCalled();

    invalidate.mockClear();
    await firstValueFrom(service.update(created.id, { precio: 1200 }));
    expect(invalidate).toHaveBeenCalled();

    invalidate.mockClear();
    await firstValueFrom(service.delete(created.id));
    expect(invalidate).toHaveBeenCalled();

    invalidate.mockClear();
    await service.createCategoriaAndPersist({ nombre: 'Cache Cat' });
    expect(invalidate).toHaveBeenCalled();
  });
});
