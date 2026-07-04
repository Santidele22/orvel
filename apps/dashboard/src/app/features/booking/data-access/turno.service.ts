import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, from, tap, switchMap, map, throwError, catchError } from 'rxjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Turno, CreateTurnoDTO, UpdateTurnoDTO, TurnoEstado } from '../models/turno.model';
import { WeekdayKey, WorkingDayHours } from '../../../models/business.model';
import type { NotificationServicePort } from '../../../services/notification.service';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { ACTIVE_BRANCH_STORAGE_KEY } from '../../../core/storage/browser-storage-keys';
import { AuthService } from '../../../services/auth.service';
import { getBranchContextService } from '../../../core/branches/branch-context.service';
import { resolveVerifiedDashboardBranches, type VerifiedDashboardBranch } from '../../../core/business/verified-dashboard-business-context';
import { emitPublicBookingFailureEvent } from '../../../core/observability/public-booking-operational-events';
import { 
  ApiErrorCode, 
  ApiError, 
  ApiResponse, 
  AdminManualBookingPayload, 
  AdminBlockedTimePayload,
  AdminUpdateBookingPayload,
  AdminCancelBookingPayload,
  AdminRescheduleBookingPayload,
  AdminStatusUpdatePayload
} from '../../../core/api/supabase-booking/types';

type AdminSessionContext = {
  userId: string;
};

type AdminCancelFailureTelemetryStage = 'rpc' | 'ui';

type AdminCancelFailureTelemetryInput = {
  stage: AdminCancelFailureTelemetryStage;
  code: unknown;
  status?: unknown;
  retryable?: boolean;
};

type AdminRescheduleFailureTelemetryInput = AdminCancelFailureTelemetryInput;

// Map Supabase RPC error to ApiError
function mapRpcErrorToApiError(error: { message?: string; code?: string }): ApiError {
  const code = error.code || '';
  const message = error.message || 'Unknown error';
  const slotConflictCode = ['SLOT', 'CONFLICT'].join('_') as ApiErrorCode;
  
  if (code === 'P0001' || message.includes('BUSINESS_NOT_FOUND')) {
    return { code: 'BUSINESS_NOT_FOUND', message: 'Business not found. Please check the booking link.' };
  }
  if (code === 'P0002' || message.includes('BOOKING_VALIDATION_ERROR')) {
    return { code: 'VALIDATION_ERROR', message };
  }
  if (message.includes(slotConflictCode)) {
    return { code: slotConflictCode, message };
  }
  if (message.includes('BLOCKED_TIME_COLLISION')) {
    return { code: 'BLOCKED_TIME_COLLISION', message };
  }
  return { code: 'VALIDATION_ERROR', message };
}


// Timezone for date handling
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const TURNO_NOT_FOUND_MESSAGE = 'TURNO_NOT_FOUND: Turno no encontrado';

type AvailabilitySettingsConfig = {
  bufferMinutes: number;
  minNoticeMinutes: number;
  slotIntervalMinutes: number;
  workingHours: Partial<Record<WeekdayKey, WorkingDayHours>>;
  serviceId?: string;
  branchId?: string | null;
  bookingId?: string | null;
  context?: AdminAvailabilityContext;
};

type AdminAvailabilityContext = 'admin-create' | 'admin-update' | 'admin-reschedule';

type AdminSlotAvailabilityRow = {
  startsAtIso: string;
  endsAtIso: string;
  remainingCapacity: number;
};

export type AdminAvailabilityRequest = {
  fecha: Date;
  durationMinutes: number;
  serviceId?: string | null;
  branchId?: string | null;
  context?: AdminAvailabilityContext;
  bookingId?: string | null;
};

type AdminActionPayload = {
  performedBy: string;
  reason?: string;
};

type AdminReschedulePayload = AdminActionPayload & {
  fecha: Date;
  hora: string;
};

type BranchTenantScope = {
  branchId: string;
  businessId: string;
};

type AdminBlockedTimeCreateInput = Omit<AdminBlockedTimePayload, 'businessId' | 'branchId'> & {
  branchId?: string | null;
  businessId?: string | null;
};

type AdminBookingLifecycleRow = {
  booking_id?: string;
  updated_at?: string;
  customer_id?: string | null;
  service_id?: string | null;
  duration_minutes?: number | null;
  starts_at_iso?: string | null;
  ends_at_iso?: string | null;
  status?: string | null;
};

type AdminBookingUpdateResult = {
  bookingId: string;
  updatedAt: string;
  customerId?: string | null;
  serviceId?: string | null;
  durationMinutes?: number | null;
  startsAtIso?: string | null;
  endsAtIso?: string | null;
};

const ADMIN_TERMINAL_TURNO_STATES = new Set<TurnoEstado>(['cancelado', 'completado', 'no-asistio']);
const ADMIN_INVALID_TRANSITION_CODE = ['TURNO', 'INVALID', 'STATUS', 'TRANSITION'].join('_');

@Injectable({
  providedIn: 'root'
})
export class TurnoService {
  private turnos = signal<Turno[]>([]);
  private loading = signal<boolean>(false);
  private provider: 'mock' | 'supabase' = 'supabase';
  private notificationService?: NotificationServicePort;
  private supabaseClient?: SupabaseClient;
  private adminAvailabilityCache = new Map<string, AdminSlotAvailabilityRow[]>();
  private pendingAdminAvailabilityKeys = new Set<string>();
  private adminAvailabilityRequestVersions = new Map<string, number>();
  private mockBlockedTimeSequence = 0;
  private ignoredImplicitBranchIds = new Set<string>();
  private authService = inject(AuthService);
  private branchContext = getBranchContextService();

  // Readonly signals
  items = this.turnos.asReadonly();
  isLoading = this.loading.asReadonly();

  private getSupabaseClient(): SupabaseClient | null {
    try {
      if (!this.supabaseClient) {
        const env = loadDashboardRuntimeEnv();
        this.supabaseClient = createClient(
          env.NEXT_PUBLIC_SUPABASE_URL,
          env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );
      }
      return this.supabaseClient;
    } catch {
      return null;
    }
  }

  private async requireAdminSession(supabaseClient: SupabaseClient | null): Promise<AdminSessionContext> {
    if (!supabaseClient) throw new Error('SUPABASE_UNAVAILABLE: Supabase client not available');

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw new Error('AUTH_REQUIRED: No active tenant session');

    const user = data.session?.user;
    const userId = user?.id?.trim();
    if (!userId) throw new Error('AUTH_REQUIRED: No active tenant session');

    return { userId };
  }

  // --- Private RPC Implementations (Flattened from Gateway) ---

  private async createAdminManualBooking(payload: AdminManualBookingPayload): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    const { data, error } = await supabase.rpc('create_admin_manual_booking', {
      business_id: payload.businessId,
      branch_id: payload.branchId,
      service_id: payload.serviceId,
      starts_at_iso: payload.startsAtIso,
      duration_minutes: payload.durationMinutes,
      client_id: payload.clientId,
      walk_in_name: payload.walkInName,
      professional_id: payload.professionalId,
      performed_by: payload.performedBy,
      notes: payload.notes
    });

    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    const row = data as any;
    return { 
      status: 201, 
      data: { 
        bookingId: row.booking_id, 
        status: row.status || 'confirmed' 
      } 
    };
  }

  private async updateAdminBooking(payload: AdminUpdateBookingPayload): Promise<ApiResponse<AdminBookingUpdateResult>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('update_admin_booking', {
      booking_id: payload.bookingId,
      performed_by: payload.performedBy,
      notes: payload.notes,
      reason: payload.reason,
      client_id: payload.clientId,
      service_id: payload.serviceId,
      duration_minutes: payload.durationMinutes
    });

    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    const row = data as AdminBookingLifecycleRow;
    return { 
      status: 200, 
      data: { 
        bookingId: row.booking_id || payload.bookingId, 
        updatedAt: row.updated_at || new Date().toISOString(),
        customerId: row.customer_id,
        serviceId: row.service_id,
        durationMinutes: row.duration_minutes,
        startsAtIso: row.starts_at_iso,
        endsAtIso: row.ends_at_iso
      } 
    };
  }

  private async cancelAdminBooking(payload: AdminCancelBookingPayload): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    const branchScope = await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('cancel_admin_booking', {
      booking_id: payload.bookingId,
      branch_id: branchScope.branchId,
      performed_by: payload.performedBy,
      notes: payload.notes,
      reason: payload.reason
    });

    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    const row = data as any;
    return { 
      status: 200, 
      data: { 
        bookingId: row.booking_id, 
        status: row.status || 'cancelled' 
      } 
    };
  }

  async recordAdminCancelFailureTelemetry(input: AdminCancelFailureTelemetryInput): Promise<void> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return;

    try {
      await supabase.rpc('record_admin_booking_cancel_failure', {
        p_stage: input.stage,
        p_code: this.sanitizeAdminCancelTelemetryCode(input.code),
        p_status: this.sanitizeAdminCancelTelemetryStatus(input.status),
        p_retryable: input.retryable ?? true
      });
    } catch {
      // Telemetry must never block or alter the admin cancellation UX.
    }
  }

  private sanitizeAdminCancelTelemetryCode(code: unknown): string {
    if (typeof code !== 'string') return 'UNKNOWN';

    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 64);
    return normalized || 'UNKNOWN';
  }

  private sanitizeAdminCancelTelemetryStatus(status: unknown): number | undefined {
    return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  }

  private adminRescheduleTelemetryCode(error: ApiError | Error | unknown): 'PERMISSION_OR_STATE_GUARD' | 'SLOT_UNAVAILABLE' | 'UNEXPECTED_FAILURE' {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && ('message' in error || 'code' in error)
        ? `${(error as { message?: unknown; code?: unknown }).message ?? (error as { code?: unknown }).code ?? ''}`
        : String(error ?? '');
    if (/BRANCH|UNAUTHORIZED|TURNO_NOT_FOUND|INVALID_STATUS|TRANSITION|ACTIVE_BRANCH_REQUIRED/i.test(message)) {
      return 'PERMISSION_OR_STATE_GUARD';
    }

    if (/TURNO_SLOT_COLLISION|SLOT_CONFLICT|BLOCKED_TIME_COLLISION|conflict|no disponible|bloqueado/i.test(message)) {
      return 'SLOT_UNAVAILABLE';
    }

    return 'UNEXPECTED_FAILURE';
  }

  private async rescheduleAdminBooking(payload: AdminRescheduleBookingPayload): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    const branchScope = await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('reschedule_admin_booking', {
      booking_id: payload.bookingId,
      starts_at_iso: payload.startsAtIso,
      branch_id: branchScope.branchId,
      performed_by: payload.performedBy,
      notes: payload.notes,
      reason: payload.reason
    });

    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    const row = data as any;
    return { 
      status: 200, 
      data: { 
        bookingId: row.booking_id, 
        startsAtIso: row.starts_at_iso || payload.startsAtIso 
      } 
    };
  }

  async recordAdminRescheduleFailureTelemetry(input: AdminRescheduleFailureTelemetryInput): Promise<void> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return;

    try {
      await supabase.rpc('record_admin_booking_reschedule_failure', {
        p_stage: input.stage,
        p_code: this.sanitizeAdminCancelTelemetryCode(input.code),
        p_status: this.sanitizeAdminCancelTelemetryStatus(input.status),
        p_retryable: input.retryable ?? true
      });
    } catch {
      // Telemetry must never block or alter the admin reschedule UX.
    }
  }

  private recordAdminRescheduleServiceFailureTelemetry(error: unknown, status?: number): void {
    const resolvedStatus = status ?? this.adminRescheduleServiceFailureStatus(error);

    if (this.isAdminRescheduleAuthRequiredFailure(error, resolvedStatus)) {
      emitPublicBookingFailureEvent({
        stage: 'service',
        code: 'ADMIN_RESCHEDULE_AUTH_REQUIRED',
        status: 401,
        retryable: true
      });
      return;
    }

    void this.recordAdminRescheduleFailureTelemetry({
      stage: 'rpc',
      code: this.adminRescheduleTelemetryCode(error),
      status: resolvedStatus,
      retryable: false
    });
  }

  private isAdminRescheduleAuthRequiredFailure(error: unknown, status: number): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return status === 401 && /AUTH_REQUIRED|SUPABASE_UNAVAILABLE/i.test(message);
  }

  private adminRescheduleServiceFailureStatus(error: unknown): number {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/TURNO_NOT_FOUND/i.test(message)) return 404;
    if (/AUTH_REQUIRED|SUPABASE_UNAVAILABLE/i.test(message)) return 401;
    if (/BRANCH_FORBIDDEN|INVALID_BRANCH|UNAUTHORIZED/i.test(message)) return 403;
    return 400;
  }

  private async updateBookingStatus(payload: AdminStatusUpdatePayload): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('update_booking_status', {
      booking_id: payload.bookingId,
      status: payload.status,
      performed_by: payload.performedBy
    });

    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    const row = data as any;
    return { 
      status: 200, 
      data: { 
        bookingId: row.booking_id, 
        status: row.status || payload.status 
      } 
    };
  }

  private async createAdminBlockedTime(payload: AdminBlockedTimePayload): Promise<ApiResponse<{ blockId: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    if (!payload.branchId?.trim()) {
      return { status: 400, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'ACTIVE_BRANCH_REQUIRED: Se requiere sucursal activa para bloquear horarios' } };
    }

    const { data, error } = await supabase.rpc('create_admin_blocked_time', {
      business_id: payload.businessId,
      branch_id: payload.branchId,
      starts_at_iso: payload.startsAtIso,
      ends_at_iso: payload.endsAtIso,
      reason: payload.reason,
      performed_by: payload.performedBy
    });

    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    const row = data as any;
    return { 
      status: 201, 
      data: { 
        blockId: row.blocked_time_id 
      } 
    };
  }

  // --- End of RPC Implementations ---

  getAll(): Observable<Turno[]> {
    this.loading.set(true);

    if (this.provider === 'mock') {
      return of(this.getMockProviderTurnos()).pipe(
        tap(turnos => {
          this.turnos.set(turnos);
          this.loading.set(false);
        })
      );
    }

    // Supabase provider - load real data
    const supabase = this.getSupabaseClient();
    if (!supabase) {
      // Supabase not configured, return empty array
      return of([]).pipe(
        tap(turnos => {
          this.turnos.set(turnos);
          this.loading.set(false);
        })
      );
    }

    return from(this.loadBookingsFromSupabase(supabase)).pipe(
      tap({
        next: (turnos) => {
          this.turnos.set(turnos);
          this.loading.set(false);
        },
        error: () => {
          this.turnos.set([]);
          this.loading.set(false);
        }
      })
    );
  }

  private async loadBookingsFromSupabase(supabaseClient: SupabaseClient): Promise<Turno[]> {
    const activeBranchId = this.resolveActiveBranchId();
    if (!activeBranchId) return [];

    const branchScope = await this.validateBranchTenant(supabaseClient, activeBranchId);
    if (!branchScope) return [];

    // Query bookings through the least-privilege RPC. Direct bookings table
    // SELECT grants are intentionally revoked for dashboard browser roles.
    const { data: bookings, error } = await supabaseClient.rpc('list_admin_bookings', {
      p_branch_id: branchScope.branchId,
    });


    if (error) {
      return [];
    }

    if (!bookings || bookings.length === 0) {
      return [];
    }

    // Map Supabase records to Turno entities
    return bookings.map((booking: Record<string, unknown>) => {
      // Parse starts_at (ISO 8601) to fecha and hora in Argentina timezone
      const startsAt = new Date(booking['starts_at'] as string);

      // Get date parts in Argentina timezone to create a "local date" object for UI
      // This ensures that the Date object's YYYY-MM-DD matches the date in Argentina
      const argDateStr = startsAt.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // Returns YYYY-MM-DD
      const [y, m, d] = argDateStr.split('-').map(Number);
      const fecha = new Date(y, m - 1, d);

      // Extract time in HH:mm format using the same timezone
      const hora = startsAt.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: TIMEZONE
      });

      // Map status from DB to TurnoEstado
      const estadoMap: Record<string, TurnoEstado> = {
        'booked': 'confirmado',
        'confirmed': 'confirmado',
        'in_progress': 'en-proceso',
        'completed': 'completado',
        'cancelled': 'cancelado',
        'no_show': 'no-asistio'
      };

      // Calculate duration from starts_at and ends_at
      const starts = new Date(booking['starts_at'] as string).getTime();
      const ends = new Date(booking['ends_at'] as string).getTime();
      const duracionMinutos = Math.round((ends - starts) / 60000);

      return {
        id: booking['id'] as string,
        branchId: (booking['branch_id'] ?? branchScope.branchId) as string,
        clienteId: booking['customer_id'] as string,
        servicioId: booking['service_id'] as string,
        fecha,
        hora,
        duracionMinutos,
        estado: (estadoMap[booking['status'] as string] || 'confirmado') as TurnoEstado,
        notas: booking['notes'] as string | undefined,
        precio: 0, // Price not in bookings table
        createdAt: new Date((booking['created_at'] || booking['createdAt'] || new Date()) as string),
        updatedAt: new Date((booking['updated_at'] || booking['updatedAt'] || booking['created_at'] || new Date()) as string)
      };
    });
  }

  getById(id: string): Observable<Turno | undefined> {
    const turno = this.turnos().find(t => t.id === id);
    return of(turno);
  }

  create(dto: CreateTurnoDTO): Observable<Turno> {
    this.invalidateAdminAvailabilityForLoadAvailability();
    // Validate required fields before calling Supabase
    if (!dto.clienteId?.trim() && !dto.walkInName?.trim()) {
      return throwError(() => new Error('CLIENT_REQUIRED: Seleccioná un cliente o ingresá nombre walk-in'));
    }
    if (!dto.servicioId?.trim()) {
      return throwError(() => new Error('servicioId es requerido'));
    }
    if (!dto.fecha || isNaN(dto.fecha.getTime())) {
      return throwError(() => new Error('fecha inválida'));
    }
    if (!dto.hora?.trim()) {
      return throwError(() => new Error('hora es requerido'));
    }
    if (!dto.duracionMinutos || dto.duracionMinutos <= 0) {
      return throwError(() => new Error('duracionMinutos debe ser mayor a 0'));
    }

    // Validate not in the past
    const now = new Date();
    const appointmentDate = new Date(dto.fecha);
    const [hours, minutes] = dto.hora.split(':').map(Number);
    appointmentDate.setHours(hours, minutes, 0, 0);

    if (appointmentDate < now) {
      return throwError(() => new Error('No se puede agendar en fecha pasada'));
    }

    // Convert fecha + hora to ISO 8601 in Argentina timezone
    const startDateTime = new Date(dto.fecha);
    const [horaHours, horaMinutes] = dto.hora.split(':').map(Number);
    startDateTime.setHours(horaHours, horaMinutes, 0, 0);

    // Format as ISO 8601 with timezone
    const startsAtIso = startDateTime.toISOString();

    // Check provider and use appropriate method
    if (this.provider === 'mock') {
      return this.createWithMock(dto);
    }

    // Use Supabase RPC
    return from(this.createWithSupabase(dto, startsAtIso)).pipe(
      switchMap(turno => {
        // Refresh the entire list to ensure signal is in sync with DB
        return this.getAll().pipe(map(() => (turno as Turno)));
      }),
      tap(() => this.invalidateAdminAvailabilityForLoadAvailability()),
      catchError(error => throwError(() => error))
    );
  }

  private async createWithSupabase(dto: CreateTurnoDTO, startsAtIso: string): Promise<Turno> {
    // Build payload for createAdminManualBooking RPC
    const supabase = this.getSupabaseClient();
    if (!supabase) throw new Error('AUTH_REQUIRED: Supabase no disponible');

    const adminSession = await this.requireAdminSession(supabase);
    const branchScope = await this.resolveInternalDefaultBranchScope(supabase, dto.branchId, adminSession);
    if (!branchScope) throw new Error('INVALID_BRANCH: La sucursal no pertenece a la cuenta activa');

    const payload: AdminManualBookingPayload = {
      businessId: branchScope.businessId,
      branchId: branchScope.branchId,
      serviceId: dto.servicioId,
      startsAtIso: startsAtIso,
      durationMinutes: dto.duracionMinutos,
      clientId: dto.clienteId || undefined,
      walkInName: dto.clienteId ? undefined : dto.walkInName?.trim(),
      performedBy: adminSession.userId,
      notes: dto.notas
    };

    // Call internal RPC implementation
    const response = await this.createAdminManualBooking(payload);

    if (response.error) {
      // Map Supabase error codes to proper error messages
      const errorCode = response.error.code;
      const errorMessage = response.error.message;

      if (errorCode === 'SLOT_CONFLICT') {
        throw new Error('SLOT_CONFLICT: El horario solicitado no está disponible');
      }
      if (errorCode === 'BLOCKED_TIME_COLLISION') {
        throw new Error('BLOCKED_TIME_COLLISION: El horario está bloqueado');
      }
      if (errorCode === 'VALIDATION_ERROR') {
        throw new Error('VALIDATION_ERROR: ' + errorMessage);
      }
      if (errorCode === 'BUSINESS_NOT_FOUND') {
        throw new Error('BUSINESS_NOT_FOUND: Negocio no encontrado');
      }

      // Generic error
      throw new Error(errorMessage || 'Error al crear turno');
    }

    // Map response to Turno entity
    if (!response.data) {
      throw new Error('Error al crear turno: no se recibió respuesta');
    }

    const now = new Date();
    return {
      id: response.data.bookingId,
      branchId: branchScope.branchId,
      clienteId: dto.clienteId,
      servicioId: dto.servicioId,
      fecha: dto.fecha,
      hora: dto.hora,
      duracionMinutos: dto.duracionMinutos,
      estado: response.data.status as TurnoEstado,
      notas: dto.notas,
      precio: dto.precio || 0,
      createdAt: now,
      updatedAt: now
    };
  }

  getActiveBranchId(): string | null {
    return this.branchContext.getActiveBranchId() ?? this.resolveActiveBranchId();
  }

  async ensureInternalDefaultBranchId(): Promise<string> {
    const supabase = this.getSupabaseClient();
    if (!supabase) throw new Error('AUTH_REQUIRED: Supabase no disponible');

    const branchScope = await this.resolveInternalDefaultBranchScope(supabase);
    return branchScope.branchId;
  }

  async ensureDefaultBranchId(): Promise<string> {
    return this.ensureInternalDefaultBranchId();
  }

  private resolveActiveBranchId(): string | null {
    const contextBranchId = this.branchContext.getActiveBranchId();
    if (contextBranchId && !this.ignoredImplicitBranchIds.has(contextBranchId)) return contextBranchId;

    const authUser = this.authService.user() as unknown as Record<string, unknown> | null;
    const activeBranchId = authUser?.['activeBranchId'] ?? authUser?.['branchId'];
    const authBranchId = typeof activeBranchId === 'string' ? activeBranchId.trim() : '';
    if (authBranchId && !this.ignoredImplicitBranchIds.has(authBranchId)) {
      return authBranchId;
    }

    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(ACTIVE_BRANCH_STORAGE_KEY) ?? window.localStorage.getItem('activeSalonId') ?? window.localStorage.getItem('activeLocationId');
      const storedBranchId = stored?.trim() || null;
      return storedBranchId && !this.ignoredImplicitBranchIds.has(storedBranchId) ? storedBranchId : null;
    }

    return null;
  }

  private selectDefaultVerifiedBranch(branches: VerifiedDashboardBranch[]): VerifiedDashboardBranch | null {
    if (!this.resolveBackendOwnedBusinessId(branches)) return null;

    return branches.find((branch) => {
      const name = branch.name.toLowerCase();
      return name.includes('principal');
    }) ?? (branches.length === 1 ? branches[0] : null);
  }

  private resolveBackendOwnedBusinessId(branches: VerifiedDashboardBranch[]): string | null {
    const businessIds = new Set(branches.map((branch) => branch.businessId));
    return businessIds.size === 1 ? [...businessIds][0] : null;
  }

  private async resolveBackendOwnedBusinessBranches(supabaseClient: SupabaseClient): Promise<VerifiedDashboardBranch[]> {
    return resolveVerifiedDashboardBranches(supabaseClient, 'calendar');
  }

  private async validateBranchTenant(
    supabaseClient: SupabaseClient | null,
    branchId?: string,
    adminSession?: AdminSessionContext
  ): Promise<BranchTenantScope | null> {
    if (!supabaseClient) return null;
    if (!branchId?.trim()) throw new Error('BRANCH_REQUIRED: Active branch context is required');

    if (!adminSession) await this.requireAdminSession(supabaseClient);

    const dashboardBranches = await this.resolveBackendOwnedBusinessBranches(supabaseClient);
    const branch = dashboardBranches.find((candidate) => candidate.id === branchId.trim());

    if (!branch) {
      throw new Error('BRANCH_NOT_FOUND: Sucursal inválida para el tenant activo');
    }

    return {
      branchId: branch.id,
      businessId: branch.businessId,
    };
  }

  private async resolveInternalDefaultBranchScope(
    supabaseClient: SupabaseClient | null,
    requestedBranchId?: string | null,
    adminSession?: AdminSessionContext
  ): Promise<BranchTenantScope> {
    if (!supabaseClient) throw new Error('SUPABASE_UNAVAILABLE: Supabase client not available');

    const explicitRequestedBranchId = requestedBranchId?.trim() || null;
    if (explicitRequestedBranchId) {
      const branchScope = await this.validateBranchTenant(supabaseClient, explicitRequestedBranchId, adminSession);
      if (!branchScope) throw new Error('INVALID_BRANCH: La sucursal no pertenece a esta cuenta');
      this.rememberResolvedBranchScope(branchScope.branchId);
      return branchScope;
    }

    const rememberedBranchId = this.resolveActiveBranchId();
    if (rememberedBranchId) {
      try {
        const branchScope = await this.validateBranchTenant(supabaseClient, rememberedBranchId, adminSession);
        if (branchScope) {
          this.rememberResolvedBranchScope(branchScope.branchId);
          return branchScope;
        }
      } catch (error) {
        if (!this.isImplicitBranchValidationFailure(error)) {
          throw error;
        }
        this.clearRememberedBranchScope(rememberedBranchId);
      }
    }

    const sessionContext = adminSession ?? await this.requireAdminSession(supabaseClient);
    const ownedBranches = await this.resolveBackendOwnedBusinessBranches(supabaseClient);
    const defaultBranch = this.selectDefaultVerifiedBranch(ownedBranches);

    if (defaultBranch?.id) {
      const branchScope = await this.validateBranchTenant(supabaseClient, defaultBranch.id, sessionContext);
      if (!branchScope) throw new Error('INVALID_BRANCH: La sucursal no pertenece a esta cuenta');
      this.rememberResolvedBranchScope(branchScope.branchId);
      return branchScope;
    }

    if (ownedBranches.length > 1) {
      throw new Error('ACTIVE_BRANCH_REQUIRED: No se pudo resolver una sucursal interna única para esta cuenta');
    }

    throw new Error('ACCOUNT_SETUP_REQUIRED: No se pudo resolver una sucursal propia para esta cuenta');
  }

  private rememberResolvedBranchScope(branchId: string): void {
    this.ignoredImplicitBranchIds.delete(branchId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, branchId);
    }
  }

  private clearRememberedBranchScope(branchId?: string): void {
    if (branchId?.trim()) {
      this.ignoredImplicitBranchIds.add(branchId.trim());
    }
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
      window.localStorage.removeItem('activeSalonId');
      window.localStorage.removeItem('activeLocationId');
    }
  }

  private isImplicitBranchValidationFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /^(BRANCH_NOT_FOUND|INVALID_BRANCH):/.test(message);
  }

  private async assertBookingInActiveBranch(supabaseClient: SupabaseClient, bookingId: string): Promise<BranchTenantScope> {
    const branchScope = await this.validateBranchTenant(supabaseClient, this.resolveActiveBranchId() ?? undefined);
    if (!branchScope) throw new Error('BRANCH_REQUIRED: Active branch context is required');

    const { data: booking, error } = await supabaseClient.rpc('assert_admin_booking_in_branch', {
      p_booking_id: bookingId,
      p_branch_id: branchScope.branchId,
    });

    if (error || !booking) {
      throw new Error('TURNO_NOT_FOUND');
    }

    return branchScope;
  }

  private createWithMock(dto: CreateTurnoDTO): Observable<Turno> {
    const disponibles = this.getHorariosDisponibles(dto.fecha, dto.duracionMinutos);
    if (!disponibles.includes(dto.hora)) {
      return throwError(() => new Error('Horario no disponible: el turno solicitado está ocupado o bloqueado'));
    }

    const nuevo: Turno = {
      ...dto,
      id: 'turno-' + Date.now(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.turnos.update(t => [...t, nuevo]);
    return of(nuevo).pipe(
      tap(created => {
        this.notificationService?.emit({
          eventKey: `booking.created:${created.id}`,
          eventType: 'booking.created',
          channel: 'email',
          recipientRole: 'admin',
          appointmentId: created.id,
          occurredAt: created.createdAt.toISOString()
        });
      })
    );
  }

  update(id: string, dto: UpdateTurnoDTO): Observable<Turno> {
    this.invalidateAdminAvailabilityForLoadAvailability();
    const exists = this.turnos().some(t => t.id === id);
    if (!exists) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    // Check provider first
    if (this.provider === 'mock') {
      return this.updateWithMock(id, dto);
    }

    // Use Supabase provider - convert Promise to Observable
    return from(this.updateWithSupabase(id, dto)).pipe(tap(() => this.invalidateAdminAvailabilityForLoadAvailability()));
  }

  private updateWithMock(id: string, dto: UpdateTurnoDTO): Observable<Turno> {
    const index = this.turnos().findIndex(t => t.id === id);
    if (index === -1) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    const actualizado = { ...this.turnos()[index], ...dto, updatedAt: new Date() };
    this.turnos.update(t => {
      const nuevas = [...t];
      nuevas[index] = actualizado;
      return nuevas;
    });

    return of(actualizado);
  }

  private async updateWithSupabase(id: string, dto: UpdateTurnoDTO): Promise<Turno> {
    const supabase = this.getSupabaseClient();
    if (!supabase) {
      throw new Error('SUPABASE_UNAVAILABLE: Supabase client not available');
    }
    const adminSession = await this.requireAdminSession(supabase);

    const payload: AdminUpdateBookingPayload = {
      bookingId: id,
      performedBy: adminSession.userId,
      notes: dto.notas,
      clientId: dto.clienteId,
      serviceId: dto.servicioId,
      durationMinutes: dto.duracionMinutos
    };
    const response = await this.updateAdminBooking(payload);

    if (response.error) {
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      throw new Error(errorMessage || 'Error al actualizar turno');
    }

    // Reload the updated turno from signal or fetch fresh
    const existing = this.turnos().find(t => t.id === id);
    if (!existing) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    // Update local state with all provided fields
    const backendPatch = response.data ? this.toTurnoPatchFromAdminUpdate(response.data) : {};
    const actualizado = { ...existing, ...dto, ...backendPatch, updatedAt: new Date(response.data?.updatedAt ?? Date.now()) };
    this.turnos.update(t => {
      const index = t.findIndex(turno => turno.id === id);
      const nuevas = [...t];
      if (index !== -1) {
        nuevas[index] = actualizado;
      }
      return nuevas;
    });

    return actualizado;
  }

  private toTurnoPatchFromAdminUpdate(result: AdminBookingUpdateResult): Partial<Turno> {
    const patch: Partial<Turno> = {};

    if (result.customerId !== undefined && result.customerId !== null) {
      patch.clienteId = result.customerId;
    }
    if (result.serviceId !== undefined && result.serviceId !== null) {
      patch.servicioId = result.serviceId;
    }
    if (typeof result.durationMinutes === 'number') {
      patch.duracionMinutos = result.durationMinutes;
    }
    if (result.startsAtIso) {
      const startsAt = new Date(result.startsAtIso);
      patch.fecha = this.toArgentinaDate(startsAt);
      patch.hora = this.toArgentinaTime(startsAt);
    }

    return patch;
  }

  updateEstado(id: string, estado: TurnoEstado): Observable<Turno> {
    this.invalidateAdminAvailabilityForLoadAvailability();
    const exists = this.turnos().some(t => t.id === id);
    if (!exists) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    // Check provider first
    if (this.provider === 'mock') {
      return this.updateEstadoWithMock(id, estado);
    }

    // Use Supabase provider
    return from(this.updateEstadoWithSupabase(id, estado)).pipe(tap(() => this.invalidateAdminAvailabilityForLoadAvailability()));
  }

  private updateEstadoWithMock(id: string, estado: TurnoEstado): Observable<Turno> {
    return this.updateWithMock(id, { estado });
  }

  private async updateEstadoWithSupabase(id: string, estado: TurnoEstado): Promise<Turno> {
    // Map TurnoEstado to DB status
    const statusMap: Record<TurnoEstado, string> = {
      'confirmado': 'booked',
      'en-proceso': 'in_progress',
      'completado': 'completed',
      'cancelado': 'cancelled',
      'no-asistio': 'no_show'
    };

    const dbStatus = statusMap[estado];

    const supabase = this.getSupabaseClient();
    const adminSession = await this.requireAdminSession(supabase);

    const payload: AdminStatusUpdatePayload = {
      bookingId: id,
      status: dbStatus,
      performedBy: adminSession.userId
    };

    const current = this.turnos().find(t => t.id === id);
    if (!current) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    const response = await this.updateBookingStatus(payload);

    if (response.error) {
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      if (errorMessage.includes(ADMIN_INVALID_TRANSITION_CODE)) {
        throw new Error(ADMIN_INVALID_TRANSITION_CODE);
      }
      // If it's a "no change needed" case (same status), handle gracefully
      if (errorMessage.includes('same') || errorMessage.includes('already')) {
        const currentTurno = this.turnos().find(t => t.id === id);
        if (currentTurno) {
          return currentTurno;
        }
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      throw new Error(errorMessage || 'Error al actualizar estado');
    }

    // Update local state
    const backendEstado = this.toTurnoEstado(response.data?.status) ?? estado;
    const actualizado = { ...current, estado: backendEstado, updatedAt: new Date() };
    this.turnos.update(t => {
      const index = t.findIndex(turno => turno.id === id);
      const nuevas = [...t];
      if (index !== -1) {
        nuevas[index] = actualizado;
      }
      return nuevas;
    });

    return actualizado;
  }

  markAsNoShow(id: string): Observable<Turno> {
    return this.updateEstado(id, 'no-asistio');
  }

  cancelByAdmin(id: string, payload: AdminActionPayload): Observable<Turno> {
    this.invalidateAdminAvailabilityForLoadAvailability();
    // Validate performedBy is required
    if (!payload.performedBy?.trim()) {
      return throwError(() => new Error('performedBy es requerido para cancelar'));
    }

    // Check provider first
    if (this.provider === 'mock') {
      return this.cancelByAdminWithMock(id, payload);
    }

    // Use Supabase provider
    return from(this.cancelByAdminWithSupabase(id, payload)).pipe(
      tap(() => this.invalidateAdminAvailabilityForLoadAvailability())
    );
  }

  private cancelByAdminWithMock(id: string, payload: AdminActionPayload): Observable<Turno> {
    const turno = this.turnos().find(t => t.id === id);

    if (!turno) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    if (this.isAdminLifecycleTerminalState(turno.estado)) {
      return throwError(() => new Error(ADMIN_INVALID_TRANSITION_CODE));
    }

    return this.updateAdminManagedTurno(id, {
      estado: 'cancelado',
      notas: this.appendAdminAudit(turno.notas, 'cancel', payload)
    }).pipe(
      tap(updated => {
        this.notificationService?.emit({
          eventKey: `booking.cancelled:admin:${updated.id}`,
          eventType: 'booking.cancelled',
          channel: 'email',
          recipientRole: 'client',
          sourceRole: 'admin',
          appointmentId: updated.id,
          occurredAt: updated.updatedAt.toISOString()
        });
      })
    );
  }

  private async cancelByAdminWithSupabase(id: string, payload: AdminActionPayload): Promise<Turno> {
    // Validate performedBy
    if (!payload.performedBy?.trim()) {
      throw new Error('performedBy es requerido para cancelar');
    }

    const supabase = this.getSupabaseClient();
    const adminSession = await this.requireAdminSession(supabase);

    const payloadSupabase: AdminCancelBookingPayload = {
      bookingId: id,
      // Supabase session is authoritative; the caller payload only proves admin UI intent.
      performedBy: adminSession.userId,
      notes: payload.reason
    };

    const response = await this.cancelAdminBooking(payloadSupabase);

    if (response.error) {
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      if (errorMessage.includes(ADMIN_INVALID_TRANSITION_CODE)) {
        throw new Error(ADMIN_INVALID_TRANSITION_CODE);
      }
      throw new Error(errorMessage || 'Error al cancelar turno');
    }

    // Update local state
    const existing = this.turnos().find(t => t.id === id);
    if (!existing) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    const auditEntry = `[admin:cancel] by=${adminSession.userId} at=${new Date().toISOString()}${payload.reason ? ' | reason=' + payload.reason : ''}`;
    const newNotes = existing.notas ? `${existing.notas}\n${auditEntry}` : auditEntry;

    const backendEstado = this.toTurnoEstado(response.data?.status) ?? 'cancelado';
    const actualizado = { ...existing, estado: backendEstado, notas: newNotes, updatedAt: new Date() };
    this.turnos.update(t => {
      const index = t.findIndex(turno => turno.id === id);
      const nuevas = [...t];
      if (index !== -1) {
        nuevas[index] = actualizado;
      }
      return nuevas;
    });

    return actualizado;
  }

  attachNotificationService(notificationService: NotificationServicePort): void {
    this.notificationService = notificationService;
  }

  rescheduleByAdmin(id: string, payload: AdminReschedulePayload): Observable<Turno> {
    this.invalidateAdminAvailabilityForLoadAvailability();
    // Check provider first
    if (this.provider === 'mock') {
      return this.rescheduleByAdminWithMock(id, payload);
    }

    // Use Supabase provider
    return from(this.rescheduleByAdminWithSupabase(id, payload)).pipe(tap(() => this.invalidateAdminAvailabilityForLoadAvailability()));
  }

  private rescheduleByAdminWithMock(id: string, payload: AdminReschedulePayload): Observable<Turno> {
    const turno = this.turnos().find(t => t.id === id);

    if (!turno) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    if (this.isAdminLifecycleTerminalState(turno.estado)) {
      return throwError(() => new Error(ADMIN_INVALID_TRANSITION_CODE));
    }

    const hasCollision = this.turnos().some(existing => {
      if (existing.id === id) {
        return false;
      }

      if (this.toDateKey(existing.fecha) !== this.toDateKey(payload.fecha)) {
        return false;
      }

      if (this.isAdminAvailabilityIgnoredState(existing.estado)) {
        return false;
      }

      const requestedStart = this.timeToMinutes(payload.hora);
      const requestedEnd = requestedStart + turno.duracionMinutos;

      const existingStart = this.timeToMinutes(existing.hora);
      const existingEnd = existingStart + existing.duracionMinutos;

      return requestedStart < existingEnd && existingStart < requestedEnd;
    });

    if (hasCollision) {
      return throwError(() => new Error('TURNO_SLOT_COLLISION'));
    }

    return this.updateAdminManagedTurno(id, {
      fecha: payload.fecha,
      hora: payload.hora,
      notas: this.appendAdminAudit(turno.notas, 'reschedule', payload)
    });
  }

  private async rescheduleByAdminWithSupabase(id: string, payload: AdminReschedulePayload): Promise<Turno> {
    let existing!: Turno;
    let adminSession!: AdminSessionContext;
    let response!: ApiResponse<{ bookingId: string; startsAtIso: string }>;
    let startsAtIso!: string;

    try {
      const localExisting = this.turnos().find(t => t.id === id);

      if (!localExisting) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }

      existing = localExisting;

      // Convert fecha + hora to ISO 8601
      const startDateTime = new Date(payload.fecha);
      const [horaHours, horaMinutes] = payload.hora.split(':').map(Number);
      startDateTime.setHours(horaHours, horaMinutes, 0, 0);
      startsAtIso = startDateTime.toISOString();

      const supabase = this.getSupabaseClient();
      adminSession = await this.requireAdminSession(supabase);

      const payloadSupabase: AdminRescheduleBookingPayload = {
        bookingId: id,
        performedBy: adminSession.userId,
        notes: payload.reason,
        startsAtIso
      };

      response = await this.rescheduleAdminBooking(payloadSupabase);
    } catch (error) {
      this.recordAdminRescheduleServiceFailureTelemetry(error);
      throw error;
    }

    if (response.error) {
      void this.recordAdminRescheduleFailureTelemetry({
        stage: 'rpc',
        code: this.adminRescheduleTelemetryCode(response.error),
        status: response.status,
        retryable: true
      });
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      if (errorMessage.includes(ADMIN_INVALID_TRANSITION_CODE)) {
        throw new Error(ADMIN_INVALID_TRANSITION_CODE);
      }
      if (errorMessage.includes('SLOT_CONFLICT') || errorMessage.includes('conflict')) {
        throw new Error('TURNO_SLOT_COLLISION');
      }
      throw new Error(errorMessage || 'Error al reprogramar turno');
    }

    // Update local state
    const auditEntry = `[admin:reschedule] by=${adminSession.userId} at=${new Date().toISOString()}${payload.reason ? ' | reason=' + payload.reason : ''}`;
    const newNotes = existing.notas ? `${existing.notas}\n${auditEntry}` : auditEntry;

    const backendStart = response.data?.startsAtIso ? new Date(response.data.startsAtIso) : null;
    const actualizado = {
      ...existing,
      fecha: backendStart ? this.toArgentinaDate(backendStart) : payload.fecha,
      hora: backendStart ? this.toArgentinaTime(backendStart) : payload.hora,
      notas: newNotes,
      updatedAt: new Date()
    };
    this.turnos.update(t => {
      const index = t.findIndex(turno => turno.id === id);
      const nuevas = [...t];
      if (index !== -1) {
        nuevas[index] = actualizado;
      }
      return nuevas;
    });

    return actualizado;
  }

  createBlockedTime(payload: AdminBlockedTimeCreateInput): Observable<{ blockId: string }> {
    this.invalidateAdminAvailabilityForLoadAvailability();

    if (!payload.performedBy?.trim()) {
      return throwError(() => new Error('AUTH_REQUIRED: No se pudo identificar el administrador'));
    }

    if (this.provider === 'mock') {
      this.mockBlockedTimeSequence += 1;
      return of({ blockId: `mock-block-${this.mockBlockedTimeSequence}` });
    }

    return from(this.createBlockedTimeWithResolvedTenant(payload, payload.branchId?.trim() || undefined)).pipe(
      map(response => {
        if (response.error) {
          throw new Error(response.error.message || 'Error al crear bloqueo de tiempo');
        }
        if (!response.data) {
          throw new Error('Error al crear bloqueo de tiempo: no se recibió respuesta');
        }
        return response.data;
      }),
      tap(() => this.invalidateAdminAvailabilityForLoadAvailability())
    );
  }

  private async createBlockedTimeWithResolvedTenant(
    payload: AdminBlockedTimeCreateInput,
    branchId?: string
  ): Promise<ApiResponse<{ blockId: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    const adminSession = await this.requireAdminSession(supabase);
    const branchScope = branchId
      ? await this.validateBranchTenant(supabase, branchId, adminSession)
      : await this.resolveInternalDefaultBranchScope(supabase, payload.branchId, adminSession);
    if (!branchScope) {
      return { status: 400, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'ACTIVE_BRANCH_REQUIRED: Se requiere sucursal activa para bloquear horarios' } };
    }

    const resolvedPayload: AdminBlockedTimePayload = {
      businessId: branchScope.businessId,
      branchId: branchScope.branchId,
      startsAtIso: payload.startsAtIso,
      endsAtIso: payload.endsAtIso,
      reason: payload.reason,
      performedBy: adminSession.userId
    };

    return this.createAdminBlockedTime(resolvedPayload);
  }

  delete(id: string): Observable<boolean> {
    this.turnos.update(t => t.filter(turno => turno.id !== id));
    return of(true).pipe(tap(() => this.invalidateAdminAvailabilityForLoadAvailability()));
  }

  // Filtrar turnos por fecha
  getByFecha(fecha: Date): Observable<Turno[]> {
    const fechaStr = this.toDateKey(fecha);
    const filtrados = this.turnos().filter(t =>
      this.toDateKey(t.fecha) === fechaStr
    );
    return of(filtrados);
  }

  // Filtrar turnos por cliente
  getByCliente(clienteId: string): Observable<Turno[]> {
    const filtrados = this.turnos().filter(t => t.clienteId === clienteId);
    return of(filtrados);
  }

  // Obtener turnos de hoy
  getHoy(): Observable<Turno[]> {
    const hoy = this.toDateKey(new Date());
    const filtrados = this.turnos().filter(t =>
      this.toDateKey(t.fecha) === hoy
    );
    return of(filtrados);
  }

  // Obtener turnos agendados/confirmados
  getAgendados(): Observable<Turno[]> {
    const agendados = this.turnos().filter(t =>
      t.estado === 'confirmado' || t.estado === 'en-proceso'
    );
    return of(agendados);
  }

  // Disponibilidad de horarios (para una fecha)
  getHorariosDisponibles(fecha: Date, duracionMinutos: number): string[] {
    if (this.provider === 'mock') {
      return this.getMockHorariosDisponibles(fecha, duracionMinutos);
    }

    const request: AdminAvailabilityRequest = {
      fecha,
      durationMinutes: duracionMinutos,
      context: 'admin-create'
    };
    const cacheKey = this.adminAvailabilityCacheKey(request);
    this.adminAvailabilityCache.delete(cacheKey);
    this.pendingAdminAvailabilityKeys.add(cacheKey);
    void this.queryAdminSlotAvailability(request).catch(() => undefined);
    if (this.pendingAdminAvailabilityKeys.has(cacheKey)) return [];
    const availableSlots = (this.adminAvailabilityCache.get(cacheKey) ?? [])
      .filter(slot => slot.remainingCapacity > 0);

    return availableSlots.map(slot => this.toArgentinaTime(new Date(slot.startsAtIso)));
  }

  getHorariosDisponiblesConConfiguracion(
    fecha: Date,
    duracionMinutos: number,
    config: AvailabilitySettingsConfig
  ): string[] {
    if (this.provider === 'mock') {
      return this.getMockHorariosDisponibles(fecha, duracionMinutos, config);
    }

    const request: AdminAvailabilityRequest = {
      fecha,
      durationMinutes: duracionMinutos,
      serviceId: config.serviceId,
      branchId: config.branchId,
      context: config.context ?? 'admin-create',
      bookingId: config.bookingId
    };
    const cacheKey = this.adminAvailabilityCacheKey(request);
    this.adminAvailabilityCache.delete(cacheKey);
    this.pendingAdminAvailabilityKeys.add(cacheKey);
    void this.queryAdminSlotAvailability(request).catch(() => undefined);
    if (this.pendingAdminAvailabilityKeys.has(cacheKey)) return [];
    const availableSlots = (this.adminAvailabilityCache.get(cacheKey) ?? [])
      .filter(slot => slot.remainingCapacity > 0);

    return availableSlots.map(slot => this.toArgentinaTime(new Date(slot.startsAtIso)));
  }

  public async loadAvailabilityAdminSlotTimes(request: AdminAvailabilityRequest): Promise<string[]> {
    const slots = await this.queryAdminSlotAvailability(request);
    return slots
      .filter(slot => slot.remainingCapacity > 0)
      .map(slot => this.toArgentinaTime(new Date(slot.startsAtIso)));
  }

  public invalidateAdminAvailability(): void {
    this.adminAvailabilityCache.clear();
    this.pendingAdminAvailabilityKeys.clear();
    this.adminAvailabilityRequestVersions.clear();
  }

  private invalidateAdminAvailabilityForLoadAvailability(): void {
    this.invalidateAdminAvailability();
  }

  private async queryAdminSlotAvailability(request: AdminAvailabilityRequest): Promise<AdminSlotAvailabilityRow[]> {
    const cacheKey = this.adminAvailabilityCacheKey(request);
    const availabilityRequestVersion = (this.adminAvailabilityRequestVersions.get(cacheKey) ?? 0) + 1;
    this.adminAvailabilityRequestVersions.set(cacheKey, availabilityRequestVersion);
    this.pendingAdminAvailabilityKeys.add(cacheKey);
    this.adminAvailabilityCache.delete(cacheKey);

    const supabase = this.getSupabaseClient();
    if (!supabase) {
      this.pendingAdminAvailabilityKeys.delete(cacheKey);
      this.adminAvailabilityCache.set(cacheKey, []);
      return [];
    }

    let data: unknown;
    let error: { message?: string; code?: string } | null = null;
    try {
      const branchScope = request.branchId
        ? await this.validateBranchTenant(supabase, request.branchId)
        : await this.resolveInternalDefaultBranchScope(supabase);
      if (!branchScope) {
        this.pendingAdminAvailabilityKeys.delete(cacheKey);
        this.adminAvailabilityCache.set(cacheKey, []);
        return [];
      }

      const response = await supabase.rpc('query_admin_slot_availability', {
        business_id: branchScope.businessId,
        service_id: request.serviceId ?? null,
        date_iso: this.toDateKey(request.fecha),
        branch_id: branchScope.branchId,
        context: request.context ?? 'admin-create',
        booking_id: request.bookingId ?? null,
        duration_minutes: request.durationMinutes ?? null
      });
      data = response.data;
      error = response.error;
    } catch {
      this.adminAvailabilityCache.delete(cacheKey);
      this.pendingAdminAvailabilityKeys.delete(cacheKey);
      throw new Error('ADMIN_AVAILABILITY_RPC_ERROR: No se pudo consultar disponibilidad');
    }

    if (error) {
      this.adminAvailabilityCache.delete(cacheKey);
      this.pendingAdminAvailabilityKeys.delete(cacheKey);
      throw new Error('ADMIN_AVAILABILITY_RPC_ERROR: No se pudo consultar disponibilidad');
    }

    if (this.adminAvailabilityRequestVersions.get(cacheKey) !== availabilityRequestVersion) {
      return this.adminAvailabilityCache.get(cacheKey) ?? [];
    }

    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    const slots = rows.map(row => ({
      startsAtIso: String(row['starts_at_iso'] ?? ''),
      endsAtIso: String(row['ends_at_iso'] ?? ''),
      remainingCapacity: Number(row['remaining_capacity'] ?? 0)
    })).filter(slot => slot.startsAtIso && slot.endsAtIso && slot.remainingCapacity > 0);

    this.adminAvailabilityCache.set(cacheKey, slots);
    this.pendingAdminAvailabilityKeys.delete(cacheKey);
    return slots;
  }

  private adminAvailabilityCacheKey(request: AdminAvailabilityRequest): string {
    return [
      this.toDateKey(request.fecha),
      request.durationMinutes,
      request.serviceId ?? '',
      request.branchId ?? this.resolveActiveBranchId() ?? '',
      request.context ?? 'admin-create',
      request.bookingId ?? ''
    ].join('|');
  }

  private getMockHorariosDisponibles(
    fecha: Date,
    duracionMinutos: number,
    config?: AvailabilitySettingsConfig
  ): string[] {
    const occupiedWindows = this.getOccupiedWindowsForDate(fecha);
    const dayKey = this.toWeekdayKey(fecha);
    const defaultWindow = { start: '09:00', end: '19:00' };
    const configuredHours = config?.workingHours?.[dayKey];
    const workingWindows = config
      ? (configuredHours?.enabled ? [{ start: configuredHours.start, end: configuredHours.end }] : [])
      : [defaultWindow];
    const interval = config?.slotIntervalMinutes ?? 30;
    const buffer = config?.bufferMinutes ?? 0;
    const minNotice = config?.minNoticeMinutes ?? 0;
    const nowMinutes = config ? this.timeToMinutes('00:00') + minNotice : 0;

    return workingWindows.flatMap(window => {
      const startMinutes = this.timeToMinutes(window.start);
      const endMinutes = this.timeToMinutes(window.end);
      const slots: string[] = [];

      for (let cursor = startMinutes; cursor + duracionMinutos <= endMinutes; cursor += interval) {
        if (cursor < nowMinutes) continue;

        const slotEnd = cursor + duracionMinutos + buffer;
        const collides = occupiedWindows.some(occupied => {
          const occupiedStart = this.timeToMinutes(occupied.start);
          const occupiedEnd = this.timeToMinutes(occupied.end) + buffer;
          return cursor < occupiedEnd && occupiedStart < slotEnd;
        });

        if (!collides) {
          slots.push(this.minutesToTime(cursor));
        }
      }

      return slots;
    });
  }

  private getOccupiedWindowsForDate(fecha: Date): Array<{ start: string; end: string }> {
    const fechaStr = this.toDateKey(fecha);
    const turnosEnFecha = this.turnos().filter(t =>
      this.toDateKey(t.fecha) === fechaStr &&
      (t.estado !== 'cancelado' && t.estado !== 'no-asistio')
    );

    return turnosEnFecha.map(turno => ({
      start: turno.hora,
      end: this.addMinutesToTime(turno.hora, turno.duracionMinutos)
    }));
  }

  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + minutesToAdd;
    const clampedMinutes = Math.min(Math.max(totalMinutes, 0), 24 * 60 - 1);
    const normalized = clampedMinutes;
    const nextHour = Math.floor(normalized / 60);
    const nextMinute = normalized % 60;

    return `${nextHour.toString().padStart(2, '0')}:${nextMinute.toString().padStart(2, '0')}`;
  }

  private minutesToTime(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private toArgentinaDate(date: Date): Date {
    const argDateStr = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const [year, month, day] = argDateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private toArgentinaTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: TIMEZONE
    });
  }

  private toTurnoEstado(status?: string | null): TurnoEstado | null {
    const statusMap: Record<string, TurnoEstado> = {
      booked: 'confirmado',
      confirmed: 'confirmado',
      in_progress: 'en-proceso',
      completed: 'completado',
      cancelled: 'cancelado',
      no_show: 'no-asistio'
    };

    return status ? (statusMap[status] ?? null) : null;
  }

  private isAdminLifecycleTerminalState(estado: TurnoEstado): boolean {
    return ADMIN_TERMINAL_TURNO_STATES.has(estado);
  }

  private isAdminAvailabilityIgnoredState(estado: TurnoEstado): boolean {
    return estado === 'cancelado' || estado === 'no-asistio';
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
  }

  private toDateKey(fecha: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(fecha);
  }

  private toWeekdayKey(fecha: Date): WeekdayKey {
    const keys: WeekdayKey[] = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday'
    ];

    return keys[fecha.getDay()];
  }

  private updateAdminManagedTurno(id: string, dto: UpdateTurnoDTO): Observable<Turno> {
    const index = this.turnos().findIndex(t => t.id === id);
    if (index === -1) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    const previous = this.turnos()[index];
    const actualizado: Turno = {
      ...previous,
      ...dto,
      createdAt: previous.createdAt,
      updatedAt: new Date()
    };

    this.turnos.update(current => {
      const next = [...current];
      next[index] = actualizado;
      return next;
    });

    return of(actualizado);
  }

  private appendAdminAudit(currentNotas: string | undefined, action: 'cancel' | 'reschedule', payload: AdminActionPayload): string {
    const timestamp = new Date().toISOString();
    const reasonSegment = payload.reason ? ` | reason=${payload.reason}` : '';
    const entry = `[admin:${action}] by=${payload.performedBy} at=${timestamp}${reasonSegment}`;
    return currentNotas ? `${currentNotas}\n${entry}` : entry;
  }

  setProvider(provider: 'mock' | 'supabase'): void {
    this.provider = provider;
  }

  private getMockProviderTurnos(): Turno[] {
    const fixtureDate = (dateKey: string) => new Date(`${dateKey}T12:00:00.000Z`);
    const fixtureTimestamp = new Date('2026-04-18T09:00:00.000Z');
    const todayFixture = new Date();
    todayFixture.setHours(12, 0, 0, 0);
    const tomorrowFixture = new Date(todayFixture);
    tomorrowFixture.setDate(tomorrowFixture.getDate() + 1);
    const fixtureDates = {
      past: fixtureDate('2026-04-19'),
      current: fixtureDate('2026-04-20'),
      future: fixtureDate('2026-04-21')
    };

    return [
      {
        id: 'turno-001',
        clienteId: 'cliente-001',
        servicioId: 'servicio-002',
        fecha: fixtureDates.current,
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'confirmado',
        precio: 3500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-002',
        clienteId: 'cliente-002',
        servicioId: 'servicio-001',
        fecha: fixtureDates.current,
        hora: '11:00',
        duracionMinutos: 30,
        estado: 'confirmado',
        notas: 'Primera vez',
        precio: 2500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-003',
        clienteId: 'cliente-003',
        servicioId: 'servicio-003',
        fecha: fixtureDates.current,
        hora: '14:00',
        duracionMinutos: 90,
        estado: 'completado',
        precio: 8000,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-006',
        clienteId: 'cliente-006',
        servicioId: 'servicio-005',
        fecha: fixtureDates.current,
        hora: '16:30',
        duracionMinutos: 60,
        estado: 'en-proceso',
        precio: 5500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-007',
        clienteId: 'cliente-007',
        servicioId: 'servicio-006',
        fecha: fixtureDates.current,
        hora: '17:30',
        duracionMinutos: 60,
        estado: 'confirmado',
        precio: 4500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-004',
        clienteId: 'cliente-004',
        servicioId: 'servicio-007',
        fecha: fixtureDates.future,
        hora: '10:00',
        duracionMinutos: 120,
        estado: 'confirmado',
        precio: 12000,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-005',
        clienteId: 'cliente-005',
        servicioId: 'servicio-004',
        fecha: fixtureDates.future,
        hora: '14:00',
        duracionMinutos: 90,
        estado: 'confirmado',
        precio: 8500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-008',
        clienteId: 'cliente-001',
        servicioId: 'servicio-002',
        fecha: fixtureDates.past,
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'completado',
        precio: 3500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-009',
        clienteId: 'cliente-002',
        servicioId: 'servicio-001',
        fecha: fixtureDates.past,
        hora: '15:00',
        duracionMinutos: 30,
        estado: 'completado',
        precio: 2500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-dynamic-today-001',
        clienteId: 'cliente-dynamic-001',
        servicioId: 'servicio-dynamic-001',
        fecha: todayFixture,
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'confirmado',
        precio: 3500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      },
      {
        id: 'turno-dynamic-tomorrow-001',
        clienteId: 'cliente-dynamic-002',
        servicioId: 'servicio-dynamic-002',
        fecha: tomorrowFixture,
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'confirmado',
        precio: 3500,
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp
      }
    ];
  }
}
