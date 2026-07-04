import { Injector, runInInjectionContext } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { TurnoService } from '../../features/booking/data-access/turno.service';
import type { CreateTurnoDTO } from '../../features/booking/models/turno.model';
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
      return Promise.resolve({
        data: String(args['p_branch_id'] ?? '') === QA_BRANCH_ID ? qaBookings : [],
        error: null
      });
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

export function createMockTurnoService(): TurnoService {
  const injector = Injector.create({
    providers: [{ provide: AuthService, useValue: mockAuthService }]
  });

  const service = runInInjectionContext(injector, () => new TurnoService());
  (service as unknown as { supabaseClient: unknown }).supabaseClient = createSupabaseClientDouble();
  service.setProvider('mock');
  const originalCreate = service.create.bind(service);
  service.create = ((dto: CreateTurnoDTO) => originalCreate({ branchId: QA_BRANCH_ID, ...dto })) as TurnoService['create'];
  return service;
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
