// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { provideZonelessChangeDetection, Type, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessPublicView, WeekdayKey, WorkingDayHours } from '../../models/business.model';
import { PublicBookingService } from '../../features/booking/data-access/public-booking.service';
import { PublicBookingPage } from '../../features/booking/pages/public/public-booking.page';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import {
  PUBLIC_BOOKING_FAILURE_EVENT,
  setPublicBookingFailureTelemetryClientFactoryForTests,
  type PublicBookingFailureEvent
} from '../../core/observability/public-booking-operational-events';

type ApiResponse<T> = {
  status: number;
  data?: T;
  error?: { code: string; message: string };
};

type BusinessServicePublicResolver = {
  resolveBusinessBySlug: (businessSlug: string) => Promise<ApiResponse<BusinessPublicView>>;
  getDefaultWorkingHours: () => Record<WeekdayKey, WorkingDayHours>;
};

type BusinessServiceModule = {
  BusinessService: new () => BusinessServicePublicResolver;
};

async function loadBusinessServiceModule(): Promise<BusinessServiceModule> {
  try {
    const mod = await import('../../features/settings/data-access/business.service');
    const BusinessService = mod['BusinessService'] as BusinessServiceModule['BusinessService'] | undefined;

    if (!BusinessService) {
      throw new Error('Missing export BusinessService');
    }

    return { BusinessService };
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/features/settings/data-access/business.service.ts exporting BusinessService.'
    );
  }
}

async function loadPublicBookingPageModule() {
  try {
    const mod = await import('../../features/booking/pages/public/public-booking-days');
    const buildPublicBookingDays = mod['buildPublicBookingDays'];
    const toLocalCivilDate = mod['toLocalCivilDate'];

    if (!buildPublicBookingDays || !toLocalCivilDate) {
      throw new Error('Missing public booking day exports');
    }

    return { buildPublicBookingDays, toLocalCivilDate };
  } catch {
    throw new Error(
      'TODO(Aurora): add src/app/features/booking/pages/public/public-booking-days.ts exporting buildPublicBookingDays() and toLocalCivilDate().'
    );
  }
}

function createWorkingHours(enabledDays: WeekdayKey[]): Record<WeekdayKey, WorkingDayHours> {
  const days: WeekdayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  return days.reduce((hours, day) => {
    hours[day] = {
      enabled: enabledDays.includes(day),
      start: '10:00',
      end: '16:00'
    };
    return hours;
  }, {} as Record<WeekdayKey, WorkingDayHours>);
}

function publicBookingFailureEvents(): PublicBookingFailureEvent[] {
  return vi.mocked(window.dispatchEvent).mock.calls
    .map(([event]) => event)
    .filter((event): event is CustomEvent<PublicBookingFailureEvent> => event instanceof CustomEvent && event.type === PUBLIC_BOOKING_FAILURE_EVENT)
    .map(event => event.detail);
}

describe('public booking settings synchronization', () => {
  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await resolveComponentResources(async (url: string) => readFileSync(
      join(process.cwd(), 'src/app/features/booking/pages/public', url.replace('./', '')),
      'utf-8'
    ));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 29, 10, 0, 0));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(window, 'dispatchEvent');
    setPublicBookingFailureTelemetryClientFactoryForTests(() => null);
  });

  afterEach(() => {
    vi.useRealTimers();
    setPublicBookingFailureTelemetryClientFactoryForTests(undefined);
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('maps RPC settings.workingHours without requiring a direct business_settings SELECT', async () => {
    // Arrange
    const { BusinessService } = await loadBusinessServiceModule();
    const service = Object.create(BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    const workingHours = createWorkingHours(['monday']);
    service.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: {
            workingHours,
            slotIntervalMinutes: 45,
            bufferMinutes: 10,
            minNoticeMinutes: 180
          },
          booking_policy: {
            autoConfirm: false,
            cancellationWindowMinutes: 90,
            allowClientProfessionalSelection: true
          }
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public resolver');
      })
    };

    // Act
    const response = await service.resolveBusinessBySlug('studio-roma');

    // Assert
    expect(response.data?.settings).toMatchObject({
      workingHours,
      slotIntervalMinutes: 45,
      bufferMinutes: 10,
      minNoticeMinutes: 180
    });
    expect(service.supabaseClient.from).not.toHaveBeenCalled();
  });

  it('maps BUSINESS_NOT_FOUND resolver RPC errors to 404 instead of retryable unavailability', async () => {
    // Arrange
    const { BusinessService } = await loadBusinessServiceModule();
    const service = Object.create(BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    service.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'P0001', message: 'BUSINESS_NOT_FOUND' }
      }),
      from: vi.fn()
    };

    // Act
    const response = await service.resolveBusinessBySlug('missing-studio');

    // Assert
    expect(response).toMatchObject({
      status: 404,
      error: { code: 'BUSINESS_NOT_FOUND' }
    });
    expect(service.supabaseClient.from).not.toHaveBeenCalled();
  });

  it('marks configured working days without enabling selection before backend availability succeeds', async () => {
    // Arrange
    const { buildPublicBookingDays } = await loadPublicBookingPageModule();
    const workingHours = createWorkingHours(['monday', 'wednesday']);

    // Act
    const days = buildPublicBookingDays(workingHours, new Date('2026-06-29T12:00:00.000Z'), 'America/Argentina/Buenos_Aires');

    // Assert
    expect(days.slice(0, 3).map((day: { isWorkingDay: boolean; hasAvailability: boolean }) => ({
      isWorkingDay: day.isWorkingDay,
      hasAvailability: day.hasAvailability
    }))).toEqual([
      { isWorkingDay: true, hasAvailability: false },
      { isWorkingDay: false, hasAvailability: false },
      { isWorkingDay: true, hasAvailability: false }
    ]);
  });

  it('builds public booking days from the business timezone civil date near UTC day rollover', async () => {
    // Arrange
    const { buildPublicBookingDays } = await loadPublicBookingPageModule();
    const workingHours = createWorkingHours(['monday']);

    // Act
    const days = buildPublicBookingDays(workingHours, new Date('2026-06-30T02:30:00.000Z'), 'America/Argentina/Buenos_Aires');

    // Assert
    expect(days[0]).toMatchObject({
      date: '2026-06-29',
      isWorkingDay: true,
      hasAvailability: false
    });
  });

  it('formats booking day strings from the business timezone civil date instead of UTC ISO conversion', async () => {
    // Arrange
    const { toLocalCivilDate } = await loadPublicBookingPageModule();
    const utcNextDayArgentinaEvening = new Date('2026-06-30T02:30:00.000Z');

    // Act
    const civilDate = toLocalCivilDate(utcNextDayArgentinaEvening, 'America/Argentina/Buenos_Aires');

    // Assert
    expect(civilDate).toBe('2026-06-29');
  });

  it('falls back to Argentina timezone when the resolver omits timezone', async () => {
    // Arrange
    const { toLocalCivilDate } = await loadPublicBookingPageModule();
    const utcNextDayArgentinaEvening = new Date('2026-06-30T02:30:00.000Z');

    // Act
    const civilDate = toLocalCivilDate(utcNextDayArgentinaEvening);

    // Assert
    expect(civilDate).toBe('2026-06-29');
  });

  it('keeps working day buttons disabled when backend availability checks fail', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(() => Promise.reject(new Error('availability RPC failed'))),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Assert
    const dayButtons = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="booking-day-option"]')) as HTMLButtonElement[];
    const availabilityError = fixture.nativeElement.querySelector('[data-testid="booking-availability-error"]') as HTMLElement | null;
    const slotSelect = fixture.nativeElement.querySelector('select[name="selectedSlot"]') as HTMLSelectElement | null;
    expect(dayButtons.slice(0, 3).map(button => button.disabled)).toEqual([
      true,
      true,
      true
    ]);
    expect(availabilityError?.textContent).toContain('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
    expect(availabilityError?.textContent).toContain('Reintentar');
    expect(slotSelect?.textContent).not.toContain('No hay turnos disponibles para este día');
    expect(console.warn).toHaveBeenCalled();
  });

  it('filters inactive public services and only queries availability for an exposed service', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn()
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => Promise.resolve({
        status: 200,
        data: { slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }] }
      })),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([
              { id: 'inactive-service', nombre: 'Inactive service', precio: 9999, duration_minutes: 30, activo: false },
              { id: 'active-service', nombre: 'Active service', precio: 1000, duration_minutes: 45, activo: true }
            ]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Assert
    const serviceSelect = fixture.nativeElement.querySelector('select[name="selectedService"]') as HTMLSelectElement;
    expect(serviceSelect.textContent).toContain('Active service');
    expect(serviceSelect.textContent).not.toContain('Inactive service');
    expect(publicBookingService.queryPublicSlotAvailability).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 'active-service'
    }));
    expect(publicBookingService.queryPublicSlotAvailability).not.toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 'inactive-service'
    }));
  });

  it('does not query availability when the selected public service is no longer exposed', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn()
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => Promise.resolve({
        status: 200,
        data: { slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }] }
      })),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'active-service', nombre: 'Active service', precio: 1000, duration_minutes: 45, activo: true }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    const initialCallCount = publicBookingService.queryPublicSlotAvailability.mock.calls.length;
    const component = fixture.componentInstance as unknown as {
      selectedServiceId: { set: (serviceId: string) => void };
      availabilitySlots: () => Array<{ startsAtIso: string }>;
      selectedSlot: string;
      loadAvailability: () => Promise<void>;
    };

    // Act
    component.selectedServiceId.set('inactive-or-missing-service');
    await component.loadAvailability();

    // Assert
    expect(publicBookingService.queryPublicSlotAvailability).toHaveBeenCalledTimes(initialCallCount);
    expect(component.availabilitySlots()).toEqual([]);
    expect(component.selectedSlot).toBe('');
  });

  it('does not apply stale availability slots after selected service stops being exposed', async () => {
    // Arrange
    let resolveAvailability: (value: { status: number; data: { slots: Array<{ startsAtIso: string; remainingCapacity: number }> } }) => void = () => undefined;
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(() => new Promise(resolve => {
        resolveAvailability = resolve as typeof resolveAvailability;
      })),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: BusinessService,
          useValue: {
            resolveBusinessBySlug: vi.fn(),
            getDefaultWorkingHours: vi.fn()
          }
        },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn()
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    const component = fixture.componentInstance as unknown as {
      resolvedSlug: { set: (slug: string) => void };
      publicServices: { set: (services: Array<{ id: string; name: string; price: number; duration: number }>) => void };
      selectedServiceId: { set: (serviceId: string) => void };
      selectedDate: { set: (dateIso: string) => void };
      workingHours: { set: (hours: Record<WeekdayKey, WorkingDayHours>) => void };
      availableDays: { set: (days: Array<{ date: string; label: string; weekday: string; isWorkingDay: boolean; hasAvailability: boolean }>) => void };
      availabilitySlots: () => Array<{ startsAtIso: string }>;
      selectedSlot: string;
      canSubmit: () => boolean;
      loadAvailability: () => Promise<void>;
    };
    component.resolvedSlug.set('studio-roma');
    component.publicServices.set([{ id: 'active-service', name: 'Active service', price: 1000, duration: 45 }]);
    component.selectedServiceId.set('active-service');
    component.selectedDate.set('2026-06-29');
    component.workingHours.set(createWorkingHours(['monday']));
    component.availableDays.set([{ date: '2026-06-29', label: '29', weekday: 'LUN', isWorkingDay: true, hasAvailability: false }]);

    // Act
    const pendingAvailability = component.loadAvailability();
    component.publicServices.set([]);
    component.selectedServiceId.set('inactive-or-missing-service');
    resolveAvailability({
      status: 200,
      data: { slots: [{ startsAtIso: '2026-06-29T13:00:00.000Z', remainingCapacity: 1 }] }
    });
    await pendingAvailability;

    // Assert
    expect(component.availabilitySlots()).toEqual([]);
    expect(component.selectedSlot).toBe('');
    expect(component.canSubmit()).toBe(false);
  });

  it('blocks submit when the selected service is removed from the exposed public services list', async () => {
    // Arrange
    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: BusinessService,
          useValue: {
            resolveBusinessBySlug: vi.fn(),
            getDefaultWorkingHours: vi.fn()
          }
        },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn()
          }
        },
        {
          provide: PublicBookingService,
          useValue: {
            queryPublicSlotAvailability: vi.fn(),
            createPublicBooking: vi.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    const component = fixture.componentInstance as unknown as {
      publicServices: { set: (services: Array<{ id: string; name: string; price: number; duration: number }>) => void };
      selectedServiceId: { set: (serviceId: string) => void };
      selectedDate: { set: (dateIso: string) => void };
      workingHours: { set: (hours: Record<WeekdayKey, WorkingDayHours>) => void };
      availableDays: { set: (days: Array<{ date: string; label: string; weekday: string; isWorkingDay: boolean; hasAvailability: boolean }>) => void };
      availabilitySlots: { set: (slots: Array<{ startsAtIso: string; remainingCapacity: number }>) => void };
      selectedSlot: string;
      firstName: string;
      lastName: string;
      whatsapp: string;
      email: string;
      canSubmit: () => boolean;
    };
    component.publicServices.set([{ id: 'active-service', name: 'Active service', price: 1000, duration: 45 }]);
    component.selectedServiceId.set('active-service');
    component.selectedDate.set('2026-06-29');
    component.workingHours.set(createWorkingHours(['monday']));
    component.availableDays.set([{ date: '2026-06-29', label: '29', weekday: 'LUN', isWorkingDay: true, hasAvailability: true }]);
    component.availabilitySlots.set([{ startsAtIso: '2026-06-29T13:00:00.000Z', remainingCapacity: 1 }]);
    component.selectedSlot = '2026-06-29T13:00:00.000Z';
    component.firstName = 'Lucía';
    component.lastName = 'García';
    component.whatsapp = '1112345678';
    component.email = 'lucia@example.com';

    // Act
    component.publicServices.set([]);

    // Assert
    expect(component.canSubmit()).toBe(false);
  });

  it('fails closed for reschedule mode without a valid token and never creates a duplicate booking', async () => {
    // Arrange
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(),
      createPublicBooking: vi.fn(),
      rescheduleBookingByToken: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: BusinessService,
          useValue: { resolveBusinessBySlug: vi.fn(), getDefaultWorkingHours: vi.fn() }
        },
        {
          provide: ServicioService,
          useValue: { getByBusinessId: vi.fn() }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: vi.fn(() => 'studio-roma') },
              queryParamMap: { get: vi.fn((key: string) => key === 'mode' ? 'reschedule' : '') }
            }
          }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    const component = fixture.componentInstance as unknown as {
      rescheduleMode: { set: (enabled: boolean) => void };
      publicServices: { set: (services: Array<{ id: string; name: string; price: number; duration: number }>) => void };
      selectedServiceId: { set: (serviceId: string) => void };
      selectedDate: { set: (dateIso: string) => void };
      workingHours: { set: (hours: Record<WeekdayKey, WorkingDayHours>) => void };
      availableDays: { set: (days: Array<{ date: string; label: string; weekday: string; isWorkingDay: boolean; hasAvailability: boolean }>) => void };
      availabilitySlots: { set: (slots: Array<{ startsAtIso: string; remainingCapacity: number }>) => void };
      errorMessage: () => string;
      selectedSlot: string;
      canSubmit: () => boolean;
      submitBooking: () => Promise<void>;
    };
    component.rescheduleMode.set(true);
    component.publicServices.set([{ id: 'service-1', name: 'Corte', price: 1000, duration: 30 }]);
    component.selectedServiceId.set('service-1');
    component.selectedDate.set('2026-06-29');
    component.workingHours.set(createWorkingHours(['monday']));
    component.availableDays.set([{ date: '2026-06-29', label: '29', weekday: 'LUN', isWorkingDay: true, hasAvailability: true }]);
    component.availabilitySlots.set([{ startsAtIso: '2026-06-29T13:00:00.000Z', remainingCapacity: 1 }]);
    component.selectedSlot = '2026-06-29T13:00:00.000Z';

    // Act
    await component.submitBooking();

    // Assert
    expect(component.canSubmit()).toBe(false);
    expect(component.errorMessage()).toContain('Volvé a abrir el link privado de gestión del turno');
    expect(publicBookingService.createPublicBooking).not.toHaveBeenCalled();
    expect(publicBookingService.rescheduleBookingByToken).not.toHaveBeenCalled();
  });

  it('submits valid reschedules through the token API instead of creating a new public booking', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = {
      resolveBusinessBySlug: vi.fn(() => Promise.resolve({
        status: 200,
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          displayName: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: {
            bufferMinutes: 0,
            minNoticeMinutes: 0,
            slotIntervalMinutes: 30,
            workingHours
          },
          bookingPolicy: {
            autoConfirm: true,
            cancellationWindowMinutes: 60,
            allowClientProfessionalSelection: false
          }
        }
      })),
      getDefaultWorkingHours: vi.fn()
    };
    const publicBookingService = {
      manageBookingByToken: vi.fn(() => Promise.resolve({
        status: 200,
        data: {
          bookingId: 'booking-1',
          businessId: 'business-1',
          serviceId: 'service-1',
          startsAtIso: '2026-06-29T13:00:00.000Z',
          canCancelOrReschedule: true
        }
      })),
      queryPublicSlotAvailability: vi.fn(() => Promise.resolve({
        status: 200,
        data: { slots: [{ startsAtIso: '2026-06-29T13:00:00.000Z', remainingCapacity: 1 }] }
      })),
      createPublicBooking: vi.fn(),
      rescheduleBookingByToken: vi.fn(() => Promise.resolve({
        status: 200,
        data: { bookingId: 'booking-1', startsAtIso: '2026-06-29T13:00:00.000Z' }
      }))
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: { getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30, activo: true }])) }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: { get: vi.fn(() => 'studio-roma') },
              queryParamMap: { get: vi.fn((key: string) => key === 'mode' ? 'reschedule' : key === 'token' ? 'manage-token-1' : '') }
            }
          }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    const component = fixture.componentInstance as unknown as {
      rescheduleMode: { set: (enabled: boolean) => void };
      publicServices: { set: (services: Array<{ id: string; name: string; price: number; duration: number }>) => void };
      selectedServiceId: { set: (serviceId: string) => void };
      selectedDate: { set: (dateIso: string) => void };
      workingHours: { set: (hours: Record<WeekdayKey, WorkingDayHours>) => void };
      availableDays: { set: (days: Array<{ date: string; label: string; weekday: string; isWorkingDay: boolean; hasAvailability: boolean }>) => void };
      availabilitySlots: { set: (slots: Array<{ startsAtIso: string; remainingCapacity: number }>) => void };
      bookingConfirmed: () => boolean;
      rescheduleConfirmed: () => boolean;
      selectedSlot: string;
      submitBooking: () => Promise<void>;
    };
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Act
    await component.submitBooking();

    // Assert
    expect(publicBookingService.rescheduleBookingByToken).toHaveBeenCalledWith(
      'manage-token-1',
      expect.any(String),
      '2026-06-29T13:00:00.000Z'
    );
    expect(publicBookingService.createPublicBooking).not.toHaveBeenCalled();
    expect(component.bookingConfirmed()).toBe(true);
    expect(component.rescheduleConfirmed()).toBe(true);
  });

  it('shows retryable portal error when public resolver returns a non-404 failure', async () => {
    // Arrange
    const businessService = {
      resolveBusinessBySlug: vi.fn(() => Promise.resolve({
        status: 503,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'provider unavailable: upstream timeout' }
      })),
      getDefaultWorkingHours: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([]))
          }
        },
        {
          provide: PublicBookingService,
          useValue: {
            queryPublicSlotAvailability: vi.fn(),
            createPublicBooking: vi.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Assert
    const portalError = fixture.nativeElement.querySelector('[data-testid="booking-portal-error-state"]') as HTMLElement | null;
    const bookingForm = fixture.nativeElement.querySelector('form[aria-label="formulario de reserva pública"]') as HTMLFormElement | null;
    expect(portalError?.textContent).toContain('No pudimos cargar el portal de reservas. Intentá nuevamente en unos minutos.');
    expect(portalError?.textContent).toContain('Reintentar');
    expect(portalError?.textContent).not.toContain('provider unavailable');
    expect(bookingForm).toBeNull();
    expect(publicBookingFailureEvents()).toContainEqual({
      feature: 'public-booking',
      stage: 'resolver',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      retryable: true
    });
  });

  it('shows sanitized retryable service error when service loading fails', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    const servicioService = {
      getByBusinessId: vi.fn(() => throwError(() => new Error('provider credential leaked detail')))
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        { provide: ServicioService, useValue: servicioService },
        {
          provide: PublicBookingService,
          useValue: {
            queryPublicSlotAvailability: vi.fn(),
            createPublicBooking: vi.fn()
          }
        },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Assert
    const serviceError = fixture.nativeElement.querySelector('[data-testid="booking-services-error"]') as HTMLElement | null;
    const serviceSelect = fixture.nativeElement.querySelector('select[name="selectedService"]') as HTMLSelectElement | null;
    expect(serviceError?.textContent).toContain('No pudimos cargar los servicios disponibles. Intentá nuevamente.');
    expect(serviceError?.textContent).toContain('Reintentar');
    expect(serviceError?.textContent).not.toContain('provider credential');
    expect(serviceSelect?.disabled).toBe(true);
    expect(serviceSelect?.options.length).toBe(1);
    expect(publicBookingFailureEvents()).toContainEqual({
      feature: 'public-booking',
      stage: 'service',
      code: 'SERVICE_LOAD_FAILED',
      status: 503,
      retryable: true
    });
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ stage: 'service', code: 'SERVICE_LOAD_FAILED' })
    );
  });

  it('shows retryable availability error when availability resolves with ApiResponse error', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(() => Promise.resolve({
        status: 503,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'provider stack trace: rpc outage' }
      })),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Assert
    const availabilityError = fixture.nativeElement.querySelector('[data-testid="booking-availability-error"]') as HTMLElement | null;
    const slotSelect = fixture.nativeElement.querySelector('select[name="selectedSlot"]') as HTMLSelectElement | null;
    const slotOptions = fixture.nativeElement.querySelectorAll('[data-testid="booking-availability-slot"]');
    expect(availabilityError?.textContent).toContain('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
    expect(availabilityError?.textContent).toContain('Reintentar');
    expect(availabilityError?.textContent).not.toContain('provider stack trace');
    expect(slotSelect?.disabled).toBe(true);
    expect(slotOptions.length).toBe(0);
    expect(publicBookingFailureEvents()).toContainEqual({
      feature: 'public-booking',
      stage: 'availability',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      retryable: true
    });
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ stage: 'availability', status: 503, code: 'SERVICE_UNAVAILABLE' })
    );
  });

  it('keeps day buttons disabled when background availability resolves with ApiResponse error', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    let availabilityCallCount = 0;
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => {
        availabilityCallCount += 1;

        if (availabilityCallCount === 1) {
          return Promise.resolve({
            status: 200,
            data: {
              slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }]
            }
          });
        }

        return Promise.resolve({
          status: 503,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'provider stack trace: rpc outage' }
        });
      }),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    await fixture.whenStable();
    fixture.detectChanges();

    // Assert
    const dayButtons = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="booking-day-option"]')) as HTMLButtonElement[];
    const availabilityError = fixture.nativeElement.querySelector('[data-testid="booking-availability-error"]') as HTMLElement | null;
    const slotOptions = fixture.nativeElement.querySelectorAll('[data-testid="booking-availability-slot"]');
    expect(dayButtons.slice(0, 3).map(button => button.disabled)).toEqual([
      true,
      true,
      true
    ]);
    expect(availabilityError?.textContent).toContain('No pudimos consultar los horarios disponibles. Intentá nuevamente.');
    expect(availabilityError?.textContent).not.toContain('provider stack trace');
    expect(slotOptions.length).toBe(0);
    expect(publicBookingFailureEvents()).toContainEqual({
      feature: 'public-booking',
      stage: 'availability',
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      retryable: true
    });
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ stage: 'availability', status: 503, code: 'SERVICE_UNAVAILABLE' })
    );
  });

  it('clears stale selected slot and blocks direct submit when background selected-day availability fails', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    let availabilityCallCount = 0;
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => {
        availabilityCallCount += 1;

        if (availabilityCallCount === 1) {
          return Promise.resolve({
            status: 200,
            data: {
              slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }]
            }
          });
        }

        return Promise.reject(new Error('provider stack trace: selected day outage'));
      }),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    await fixture.whenStable();
    const component = fixture.componentInstance as unknown as {
      selectedSlot: string;
      firstName: string;
      lastName: string;
      whatsapp: string;
      email: string;
      canSubmit: () => boolean;
      submitBooking: () => Promise<void>;
    };
    component.firstName = 'Lucía';
    component.lastName = 'García';
    component.whatsapp = '1112345678';
    component.email = 'lucia@example.com';
    await component.submitBooking();
    fixture.detectChanges();

    // Assert
    expect(component.selectedSlot).toBe('');
    expect(component.canSubmit()).toBe(false);
    expect(publicBookingService.createPublicBooking).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).not.toContain('provider stack trace');
  });

  it('keeps days disabled when RPC workingHours disables them even if backend returns slots', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => Promise.resolve({
        data: {
          slots: ['2026-06-29', '2026-06-30'].includes(dateIso)
            ? [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }]
            : []
        }
      })),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });

    // Act
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    fixture.detectChanges();

    // Assert
    const dayButtons = Array.from(fixture.nativeElement.querySelectorAll('[data-testid="booking-day-option"]')) as HTMLButtonElement[];
    expect(dayButtons.slice(0, 3).map(button => button.disabled)).toEqual([false, true, true]);
    expect(publicBookingService.queryPublicSlotAvailability).toHaveBeenCalledWith(expect.objectContaining({
      dateIso: '2026-06-30'
    }));
    expect(businessService.supabaseClient.from).not.toHaveBeenCalled();
  });

  it('does not populate slots or allow submit when selected date is not a configured working day even if availability returns slots', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn(() => {
        throw new Error('business_settings SELECT must not be used by public page');
      })
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => Promise.resolve({
        data: {
          slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }]
        }
      })),
      createPublicBooking: vi.fn()
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    const component = fixture.componentInstance as unknown as {
      selectedDate: { set: (dateIso: string) => void };
      availabilitySlots: () => Array<{ startsAtIso: string }>;
      selectedSlot: string;
      firstName: string;
      lastName: string;
      whatsapp: string;
      email: string;
      canSubmit: () => boolean;
      loadAvailability: () => Promise<void>;
    };

    // Act
    component.selectedDate.set('2026-06-30');
    component.firstName = 'Lucía';
    component.lastName = 'García';
    component.whatsapp = '1112345678';
    component.email = 'lucia@example.com';
    await component.loadAvailability();
    fixture.detectChanges();

    // Assert
    const submitButton = fixture.nativeElement.querySelector('[data-testid="booking-submit-action"]') as HTMLButtonElement;
    expect(publicBookingService.queryPublicSlotAvailability).toHaveBeenCalledWith(expect.objectContaining({
      dateIso: '2026-06-30'
    }));
    expect(component.availabilitySlots()).toEqual([]);
    expect(component.selectedSlot).toBe('');
    expect(component.canSubmit()).toBe(false);
    expect(submitButton.disabled).toBe(true);
    expect(businessService.supabaseClient.from).not.toHaveBeenCalled();
  });

  it('shows sanitized submit error and clears submitting when createPublicBooking rejects', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn()
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => Promise.resolve({
        status: 200,
        data: {
          slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }]
        }
      })),
      createPublicBooking: vi.fn(() => Promise.reject(new Error('provider stack trace: payment token leaked')))
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    const component = fixture.componentInstance as unknown as {
      firstName: string;
      lastName: string;
      whatsapp: string;
      email: string;
      submitting: () => boolean;
      bookingConfirmed: () => boolean;
      submitBooking: () => Promise<void>;
    };
    component.firstName = 'Lucía';
    component.lastName = 'García';
    component.whatsapp = '1112345678';
    component.email = 'lucia@example.com';

    // Act
    await component.submitBooking();
    fixture.detectChanges();

    // Assert
    const submitButton = fixture.nativeElement.querySelector('[data-testid="booking-submit-action"]') as HTMLButtonElement;
    expect(publicBookingService.createPublicBooking).toHaveBeenCalledOnce();
    expect(component.submitting()).toBe(false);
    expect(component.bookingConfirmed()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('No pudimos confirmar la reserva. Revisá los datos e intentá nuevamente.');
    expect(fixture.nativeElement.textContent).not.toContain('provider stack trace');
    expect(fixture.nativeElement.textContent).not.toContain('payment token');
    expect(submitButton.textContent).toContain('Confirmar Reserva');
    expect(publicBookingFailureEvents()).toContainEqual({
      feature: 'public-booking',
      stage: 'submit',
      code: 'PUBLIC_BOOKING_SUBMIT_FAILED',
      status: 503,
      retryable: true
    });
    expect(console.warn).toHaveBeenCalledWith(
      '[PublicBooking] Operational failure event emitted.',
      expect.objectContaining({ stage: 'submit', code: 'PUBLIC_BOOKING_SUBMIT_FAILED', status: 503 })
    );
    expect(vi.mocked(window.dispatchEvent).mock.calls.some(([event]) => event instanceof CustomEvent && event.type === 'booking.created')).toBe(false);
  });

  it('emits public success metadata without exposing the internal booking id', async () => {
    // Arrange
    const workingHours = createWorkingHours(['monday']);
    const businessService = Object.create((await loadBusinessServiceModule()).BusinessService.prototype) as BusinessServicePublicResolver & {
      supabaseClient: {
        rpc: ReturnType<typeof vi.fn>;
        from: ReturnType<typeof vi.fn>;
      };
    };
    businessService.supabaseClient = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: 'business-1',
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          settings: { workingHours },
          booking_policy: {}
        },
        error: null
      }),
      from: vi.fn()
    };
    const publicBookingService = {
      queryPublicSlotAvailability: vi.fn(({ dateIso }: { dateIso: string }) => Promise.resolve({
        status: 200,
        data: {
          slots: [{ startsAtIso: `${dateIso}T13:00:00.000Z`, remainingCapacity: 1 }]
        }
      })),
      createPublicBooking: vi.fn(() => Promise.resolve({
        status: 200,
        data: { status: 'confirmed', bookingId: 'internal-booking-id-123' }
      }))
    };

    TestBed.configureTestingModule({
      imports: [PublicBookingPage],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BusinessService, useValue: businessService },
        {
          provide: ServicioService,
          useValue: {
            getByBusinessId: vi.fn(() => of([{ id: 'service-1', nombre: 'Corte', precio: 1000, duration_minutes: 30 }]))
          }
        },
        { provide: PublicBookingService, useValue: publicBookingService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'studio-roma') } } }
        }
      ]
    });
    const fixture = TestBed.createComponent(PublicBookingPage as Type<PublicBookingPage>);
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.runAllTimersAsync();
    const component = fixture.componentInstance as unknown as {
      selectedSlot: string;
      firstName: string;
      lastName: string;
      whatsapp: string;
      email: string;
      submitBooking: () => Promise<void>;
    };
    component.firstName = 'Lucía';
    component.lastName = 'García';
    component.whatsapp = '1112345678';
    component.email = 'lucia@example.com';

    // Act
    await component.submitBooking();

    // Assert
    const successEvent = vi.mocked(window.dispatchEvent).mock.calls
      .map(([event]) => event)
      .find((event): event is CustomEvent<{ status: string; startsAtIso: string; bookingId?: string }> => event instanceof CustomEvent && event.type === 'booking.created');
    expect(successEvent?.detail).toEqual({
      status: 'confirmed',
      startsAtIso: component.selectedSlot
    });
    expect(successEvent?.detail.bookingId).toBeUndefined();
    expect(JSON.stringify(successEvent?.detail)).not.toContain('internal-booking-id-123');
  });
});
