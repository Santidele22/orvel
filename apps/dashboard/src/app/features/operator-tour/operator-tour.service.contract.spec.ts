// @vitest-environment jsdom

import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorTourService, OPERATOR_TOUR_READY_BUDGET } from './operator-tour.service';
import { OPERATOR_TOUR_STORAGE_KEY } from './operator-tour-storage';
import { TOUR_ROUTES } from './operator-tour-steps';

/**
 * #1136 shipped the tour behind a home-route gate, so a new operator — who lands
 * on the agenda — never saw it. The invite is now the only automatic entry
 * point, and it has to start the journey where the journey begins.
 */

interface FakeRouter {
  url: string;
  navigateByUrl: ReturnType<typeof vi.fn>;
}

function createRouter(url: string): FakeRouter {
  return { url, navigateByUrl: vi.fn(async () => true) };
}

function configure(router: FakeRouter, platformId = 'browser'): OperatorTourService {
  TestBed.configureTestingModule({
    providers: [
      { provide: Router, useValue: router },
      { provide: PLATFORM_ID, useValue: platformId },
      // Zero budget: the readiness poll would otherwise wait for home data that
      // never arrives in jsdom.
      { provide: OPERATOR_TOUR_READY_BUDGET, useValue: { pollMs: 0, timeoutMs: 0 } },
    ],
  });

  return TestBed.inject(OperatorTourService);
}

describe('operator tour service contract', () => {
  beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
  beforeEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });
  afterAll(() => TestBed.resetTestEnvironment());

  it('offers the tour on a first visit and stops offering it after a decline', () => {
    const service = configure(createRouter(TOUR_ROUTES.inicio));

    expect(service.canAutoStart()).toBe(true);

    service.declineInvite();

    expect(service.canAutoStart()).toBe(false);
    expect(localStorage.getItem(OPERATOR_TOUR_STORAGE_KEY)).not.toBeNull();
    expect(service.hasCompleted()).toBe(true);
  });

  it('does not offer the tour again on the next visit', () => {
    configure(createRouter(TOUR_ROUTES.inicio)).declineInvite();

    TestBed.resetTestingModule();

    expect(configure(createRouter(TOUR_ROUTES.inicio)).canAutoStart()).toBe(false);
  });

  it('walks the operator to the journey start before running it', async () => {
    const router = createRouter('/dashboard/turnos');
    const service = configure(router);

    await service.acceptInvite();
    service.teardown();

    expect(router.navigateByUrl).toHaveBeenCalledWith(TOUR_ROUTES.inicio);
  });

  it('does not navigate when the operator is already at the journey start', async () => {
    const router = createRouter(TOUR_ROUTES.inicio);
    const service = configure(router);

    await service.acceptInvite();
    service.teardown();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('replays from the journey start too, so the help button recovers the full tour', async () => {
    const router = createRouter('/dashboard/servicios');
    const service = configure(router);

    await service.replay();
    service.teardown();

    expect(router.navigateByUrl).toHaveBeenCalledWith(TOUR_ROUTES.inicio);
  });

  it('stays inert outside the browser (SSR)', async () => {
    const router = createRouter('/dashboard/turnos');
    const service = configure(router, 'server');

    expect(service.canAutoStart()).toBe(false);

    await service.acceptInvite();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('hands driver.js the exact settings tab button, right before the content it opens', async () => {
    // #1153: the strip alone was a click-to-advance guess, so the tour moved on
    // with the previous tab still active and the content step had no anchor.
    const driverFactory = vi.fn(() => ({ drive: vi.fn(), destroy: vi.fn(), moveTo: vi.fn() }));
    vi.doMock('driver.js', () => ({ driver: driverFactory }));

    try {
      const service = configure(createRouter(TOUR_ROUTES.inicio));

      await service.run();

      const config = driverFactory.mock.calls[0]?.[0] as {
        steps: readonly { element?: string; advanceOnClick?: boolean }[];
      };
      const elementOf = (anchorName: string) => `[data-tour="${anchorName}"]`;
      const indexOf = (anchorName: string) =>
        config.steps.findIndex((step) => step.element === elementOf(anchorName));

      const negocioAt = indexOf('config-tab-negocio');

      expect(negocioAt, 'the tour must plan the Negocio tab button').toBeGreaterThanOrEqual(0);
      expect(config.steps[negocioAt]?.advanceOnClick).toBe(true);
      expect(indexOf('config-politicas')).toBe(negocioAt + 1);
      expect(indexOf('config-tab-equipo')).toBeGreaterThan(indexOf('config-horarios'));
      expect(indexOf('config-equipo')).toBe(indexOf('config-tab-equipo') + 1);
      expect(indexOf('config-tab-perfil')).toBeGreaterThan(indexOf('config-equipo'));
      expect(indexOf('config-perfil-datos')).toBe(indexOf('config-tab-perfil') + 1);
      // The strip introduces the tabs; it never waits for a click again.
      expect(config.steps[indexOf('config-tabs')]?.advanceOnClick).toBe(false);

      service.teardown();
    } finally {
      vi.doUnmock('driver.js');
    }
  });
});
