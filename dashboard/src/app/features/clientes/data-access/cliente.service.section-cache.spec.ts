// @vitest-environment jsdom

import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import { ClienteService } from './cliente.service';

async function flushDelay(ms = 350): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ClienteService section cache', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function createService(): ClienteService {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ClienteService,
        { provide: AuthService, useValue: { user: () => null } }
      ]
    });
    const service = TestBed.inject(ClienteService);
    service.setProvider('mock');
    return service;
  }

  it('getAll second call does not hit the mock/network source when warm, including empty lists', async () => {
    const service = createService();
    const loadSpy = vi.spyOn(service as unknown as { getMockClientes: () => unknown[] }, 'getMockClientes');
    loadSpy.mockReturnValue([]);

    const first = await firstValueFrom(service.getAll());
    await flushDelay();
    expect(first).toEqual([]);
    expect(service.isLoaded()).toBe(true);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    const loadingDuringSecond: boolean[] = [];
    const secondPromise = firstValueFrom(service.getAll());
    loadingDuringSecond.push(service.isLoading());
    const second = await secondPromise;
    expect(second).toEqual([]);
    expect(loadingDuringSecond).toEqual([false]);
    expect(loadSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidate makes the next getAll hit the source again', async () => {
    const service = createService();
    const loadSpy = vi.spyOn(service as unknown as { getMockClientes: () => unknown[] }, 'getMockClientes');

    await firstValueFrom(service.getAll());
    await flushDelay();
    expect(loadSpy).toHaveBeenCalledTimes(1);

    service.invalidate();
    expect(service.isLoaded()).toBe(false);
    await firstValueFrom(service.getAll());
    await flushDelay();
    expect(loadSpy).toHaveBeenCalledTimes(2);
  });

  it('create, update, and deactivate invalidate the list cache', async () => {
    const service = createService();
    await firstValueFrom(service.getAll());
    await flushDelay();
    const invalidate = vi.spyOn(service, 'invalidate');
    const created = await firstValueFrom(
      service.create({
        nombre: 'Ada',
        apellido: 'Lovelace',
        telefono: '+543411234567',
        email: 'ada@example.com'
      })
    );
    expect(invalidate).toHaveBeenCalled();

    invalidate.mockClear();
    await firstValueFrom(service.update(created.id, { nombre: 'Ada' }));
    expect(invalidate).toHaveBeenCalled();

    invalidate.mockClear();
    await firstValueFrom(service.deactivateClient(created.id));
    expect(invalidate).toHaveBeenCalled();
  });
});
