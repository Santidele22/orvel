import { Injector, runInInjectionContext, signal } from '@angular/core';
import { of, throwError, from } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import type { BookingCrudService, BookingSchedulingService } from '@orvel/booking/application';
import type { CreateTurnoDTO, Turno } from '../../features/booking/models/turno.model';
import { ClienteService } from '../../services/cliente.service';
import { ServicioService } from '../../services/servicio.service';

const QA_BRANCH_ID = 'branch-qa-001';
const QA_BUSINESS_ID = 'biz-qa-001';

const mockAuthService = {
  user: () => ({
    id: 'qa-user-001',
    nombre: 'QA Admin',
    activeBranchId: QA_BRANCH_ID
  })
};

const qaBookings = [
  {
    id: 'booking-qa-001',
    business_id: QA_BUSINESS_ID,
    branch_id: QA_BRANCH_ID,
    customer_id: 'cust-qa-001',
    service_id: 'svc-qa-001',
    starts_at: '2035-01-15T13:00:00.000Z',
    ends_at: '2035-01-15T13:30:00.000Z',
    status: 'booked',
    notes: 'QA fixture booking',
    created_at: '2035-01-01T00:00:00.000Z',
    updated_at: '2035-01-01T00:00:00.000Z'
  },
  {
    id: 'booking-qa-002',
    business_id: QA_BUSINESS_ID,
    branch_id: QA_BRANCH_ID,
    customer_id: 'cust-qa-002',
    service_id: 'svc-qa-002',
    starts_at: '2035-01-15T14:00:00.000Z',
    ends_at: '2035-01-15T14:30:00.000Z',
    status: 'confirmed',
    notes: 'QA conflicting booking',
    created_at: '2035-01-01T00:00:00.000Z',
    updated_at: '2035-01-01T00:00:00.000Z'
  },
  {
    id: 'booking-qa-003',
    business_id: QA_BUSINESS_ID,
    branch_id: QA_BRANCH_ID,
    customer_id: 'cust-qa-003',
    service_id: 'svc-qa-003',
    starts_at: '2035-01-16T15:00:00.000Z',
    ends_at: '2035-01-16T15:30:00.000Z',
    status: 'completed',
    notes: 'QA completed booking',
    created_at: '2035-01-01T00:00:00.000Z',
    updated_at: '2035-01-01T00:00:00.000Z'
  }
];

function createSupabaseClientDouble() {
  const session = {
    user: {
      id: 'qa-user-001',
      user_metadata: { businessId: QA_BUSINESS_ID }
    }
  };
  const bookingStatuses = new Map(qaBookings.map(booking => [booking.id, booking.status]));

  const makeBuilder = (table: string) => {
    const builder = {
      select: () => builder,
      update: () => builder,
      eq: () => builder,
      order: () => Promise.resolve({ data: table === 'bookings' ? qaBookings : [], error: null }),
      maybeSingle: () => Promise.resolve({
        data: table === 'branches'
          ? { id: QA_BRANCH_ID, business_id: QA_BUSINESS_ID }
          : table === 'bookings'
            ? { id: qaBookings[0].id }
            : null,
        error: null
      }),
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null })
    };

    return builder;
  };

  const rpc = (fn: string, args: Record<string, unknown>) => {
    if (fn === 'get_dashboard_branches') {
      return Promise.resolve({
        data: [{ id: QA_BRANCH_ID, name: 'Principal', business_id: QA_BUSINESS_ID, is_active: true }],
        error: null
      });
    }

    if (fn === 'list_admin_bookings') {
      return Promise.resolve({ data: qaBookings, error: null });
    }

    const bookingId = String(args['booking_id'] ?? '');
    const targetBooking = qaBookings.find(booking => booking.id === bookingId);
    const currentStatus = bookingStatuses.get(bookingId) ?? targetBooking?.status;
    const targetStatus = String(args['status'] ?? '');

    if (fn === 'reschedule_admin_booking') {
      const startsAtIso = String(args['starts_at_iso'] ?? '');
      const collides = qaBookings.some(booking => booking.id !== bookingId && booking.starts_at === startsAtIso);
      if (collides) {
        return Promise.resolve({ data: null, error: { message: 'SLOT_CONFLICT', code: 'P0002' } });
      }
    }

    if (fn === 'cancel_admin_booking' && currentStatus === 'completed') {
      return Promise.resolve({ data: null, error: { message: 'TURNO_INVALID_STATUS_TRANSITION', code: 'P0002' } });
    }

    if (fn === 'update_booking_status') {
      const isCompleted = currentStatus === 'completed';
      const isPendingDirectComplete = currentStatus === 'booked' && targetStatus === 'completed';

      if (isCompleted || isPendingDirectComplete) {
        return Promise.resolve({ data: null, error: { message: 'TURNO_INVALID_STATUS_TRANSITION', code: 'P0002' } });
      }

      bookingStatuses.set(bookingId, targetStatus);
    }

    return Promise.resolve({
      data: {
        booking_id: qaBookings[0].id,
        status: targetStatus || 'booked',
        updated_at: new Date().toISOString(),
        starts_at_iso: args['starts_at_iso'] ?? qaBookings[0].starts_at
      },
      error: null
    });
  };

  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null })
    },
    schema: () => ({ from: (table: string) => makeBuilder(table) }),
    from: (table: string) => makeBuilder(table),
    rpc
  };
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function mockTurnos(): Turno[] {
  const stamp = new Date('2026-04-18T09:00:00.000Z');
  const fixture = (key: string) => new Date(`${key}T12:00:00.000Z`);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
  const tomorrow = new Date(today); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const row = (id: string, clienteId: string, servicioId: string, fecha: Date, hora: string, mins: number, estado: Turno['estado'], precio: number, notas?: string): Turno => ({
    id, clienteId, servicioId, fecha, hora, duracionMinutos: mins, estado, precio, notas, createdAt: stamp, updatedAt: stamp
  });
  return [
    row('turno-001', 'cliente-001', 'servicio-002', fixture('2026-04-20'), '10:00', 45, 'confirmado', 3500),
    row('turno-002', 'cliente-002', 'servicio-001', fixture('2026-04-20'), '11:00', 30, 'confirmado', 2500, 'Primera vez'),
    row('turno-003', 'cliente-003', 'servicio-003', fixture('2026-04-20'), '14:00', 90, 'completado', 8000),
    row('turno-006', 'cliente-006', 'servicio-005', fixture('2026-04-20'), '16:30', 60, 'en-proceso', 5500),
    row('turno-007', 'cliente-007', 'servicio-006', fixture('2026-04-20'), '17:30', 60, 'confirmado', 4500),
    row('turno-004', 'cliente-004', 'servicio-007', fixture('2026-04-21'), '10:00', 120, 'confirmado', 12000),
    row('turno-005', 'cliente-005', 'servicio-004', fixture('2026-04-21'), '14:00', 90, 'confirmado', 8500),
    row('turno-008', 'cliente-001', 'servicio-002', fixture('2026-04-19'), '10:00', 45, 'completado', 3500),
    row('turno-009', 'cliente-002', 'servicio-001', fixture('2026-04-19'), '15:00', 30, 'completado', 2500),
    row('turno-dynamic-today-001', 'cliente-dynamic-001', 'servicio-dynamic-001', today, '10:00', 45, 'confirmado', 3500),
    row('turno-dynamic-tomorrow-001', 'cliente-dynamic-002', 'servicio-dynamic-002', tomorrow, '10:00', 45, 'confirmado', 3500)
  ];
}

export function createMockBookingCrud(): Pick<BookingCrudService, 'getAll' | 'getById' | 'delete' | 'updateEstado' | 'cancelByAdmin'> {
  const rows = mockTurnos();
  return {
    getAll: async () => rows,
    getById: (items, id) => items.find((item) => item.id === id),
    delete: (items, id) => items.filter((item) => item.id !== id),
    updateEstado: async (id, estado) => ({ bookingId: id, status: estado }),
    cancelByAdmin: async (id) => ({ bookingId: id, status: 'cancelled' })
  };
}

export function createMockBookingScheduling(): Pick<BookingSchedulingService, 'create' | 'rescheduleByAdmin' | 'createBlockedTime'> {
  return {
    create: async () => ({ bookingId: 'turno-mock', status: 'booked' }),
    rescheduleByAdmin: async (id) => ({ bookingId: id, status: 'booked' }),
    createBlockedTime: async () => ({ blockId: 'block-mock' })
  };
}

export function createMockTurnoService() {
  const items = signal(mockTurnos());
  const loading = signal(false);
  const loadError = signal<string | null>(null);
  const toTime = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const fake = {
    items: items.asReadonly(),
    isLoading: loading.asReadonly(),
    loadError: loadError.asReadonly(),
    setProvider(_provider: 'mock' | 'supabase') { /* in-memory fake */ },
    getAll() { return of(items()).pipe(tap((rows) => items.set(rows))); },
    getById(id: string) { return of(items().find((item) => item.id === id)); },
    getByFecha(fecha: Date) { return of(items().filter((item) => dateKey(item.fecha) === dateKey(fecha))); },
    getByCliente(clienteId: string) { return of(items().filter((item) => item.clienteId === clienteId)); },
    getHoy() {
      const hoyStr = new Date().toISOString().split('T')[0];
      return of(items().filter((item) => item.fecha.toISOString().split('T')[0] === hoyStr));
    },
    getAgendados() { return of(items().filter((item) => item.estado === 'confirmado' || item.estado === 'en-proceso')); },
    delete(id: string) { items.set(items().filter((item) => item.id !== id)); return of(true); },
    create(dto: CreateTurnoDTO) {
      const created: Turno = { ...dto, branchId: dto.branchId ?? QA_BRANCH_ID, id: `turno-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() };
      items.set([...items(), created]);
      return of(created);
    },
    update(id: string, dto: Partial<Turno>) {
      const current = items().find((item) => item.id === id);
      if (!current) throw new Error('TURNO_NOT_FOUND: Turno no encontrado');
      const updated = { ...current, ...dto, updatedAt: new Date() };
      items.set(items().map((item) => item.id === id ? updated : item));
      return of(updated);
    },
    updateEstado(id: string, estado: Turno['estado']) { return fake.update(id, { estado }); },
    markAsNoShow(id: string) { return fake.updateEstado(id, 'no-asistio'); },
    cancelByAdmin(id: string) { return fake.updateEstado(id, 'cancelado'); },
    rescheduleByAdmin(id: string, payload: { fecha: Date; hora: string }) { return fake.update(id, payload); },
    createBlockedTime(payload: { branchId?: string | null; performedBy?: string; startsAtIso?: string; endsAtIso?: string; reason?: string }) {
      const client = (fake as { supabaseClient?: { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> } }).supabaseClient;
      if (client) {
        if (!payload.branchId?.trim()) return throwError(() => new Error('ACTIVE_BRANCH_REQUIRED: Se requiere sucursal activa para bloquear horarios'));
        return from(client.rpc('create_admin_blocked_time', {
          business_id: 'biz-from-branch-tenant',
          branch_id: payload.branchId,
          performed_by: payload.performedBy,
          starts_at_iso: payload.startsAtIso,
          ends_at_iso: payload.endsAtIso,
          reason: payload.reason
        }).then(() => ({ blockId: 'block-qa-001' })));
      }
      return of({ blockId: 'block-mock' });
    },
    getHorariosDisponibles(fecha: Date, mins: number) {
      const occupied = items().filter((item) => dateKey(item.fecha) === dateKey(fecha) && item.estado !== 'cancelado' && item.estado !== 'no-asistio');
      const slots: string[] = [];
      for (let cursor = 9 * 60; cursor + mins <= 19 * 60; cursor += 30) {
        const label = toTime(cursor);
        const collides = occupied.some((item) => {
          const [h, m] = item.hora.split(':').map(Number);
          const start = h * 60 + m;
          return cursor < start + item.duracionMinutos && start < cursor + mins;
        });
        if (!collides) slots.push(label);
      }
      return slots;
    },
    getHorariosDisponiblesConConfiguracion(fecha: Date, mins: number) { return fake.getHorariosDisponibles(fecha, mins); },
    loadAvailabilityAdminSlotTimes(request: { fecha: Date; durationMinutes: number }) {
      return Promise.resolve(fake.getHorariosDisponibles(request.fecha, request.durationMinutes));
    },
    invalidateAdminAvailability() { /* no-op */ },
    attachNotificationService() { /* no-op */ },
    getActiveBranchId() { return QA_BRANCH_ID; },
    ensureDefaultBranchId() { return Promise.resolve(QA_BRANCH_ID); },
    ensureInternalDefaultBranchId() { return Promise.resolve(QA_BRANCH_ID); },
    recordAdminCancelFailureTelemetry() { return Promise.resolve(); },
    recordAdminRescheduleFailureTelemetry() { return Promise.resolve(); }
  };
  return fake;
}

export function createMockClienteService(): ClienteService {
  const injector = Injector.create({
    providers: [{ provide: AuthService, useValue: mockAuthService }]
  });

  const service = runInInjectionContext(injector, () => new ClienteService());
  service.setProvider('mock');
  return service;
}

export function createMockServicioService(): ServicioService {
  const injector = Injector.create({
    providers: [{ provide: AuthService, useValue: mockAuthService }]
  });

  const service = runInInjectionContext(injector, () => new ServicioService());
  service.setProvider('mock');
  return service;
}
