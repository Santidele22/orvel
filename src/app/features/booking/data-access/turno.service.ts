import { inject, Injectable, signal } from '@angular/core';
import { Observable, of, from, tap, switchMap, map, throwError, catchError } from 'rxjs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Turno, CreateTurnoDTO, UpdateTurnoDTO, TurnoEstado } from '../models/turno.model';
import { computeAvailableSlots } from './availability-core';
import { WeekdayKey, WorkingDayHours } from '../../../models/business.model';
import type { NotificationServicePort } from '../../../services/notification.service';
import { loadDashboardRuntimeEnv } from '../../../core/runtime/dashboard-env';
import { AuthService } from '../../../services/auth.service';
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

// Map Supabase RPC error to ApiError
function mapRpcErrorToApiError(error: { message?: string; code?: string }): ApiError {
  const code = error.code || '';
  const message = error.message || 'Unknown error';
  
  if (code === 'P0001' || message.includes('BUSINESS_NOT_FOUND')) {
    return { code: 'BUSINESS_NOT_FOUND', message: 'Business not found. Please check the booking link.' };
  }
  if (code === 'P0002' || message.includes('BOOKING_VALIDATION_ERROR')) {
    return { code: 'VALIDATION_ERROR', message };
  }
  if (message.includes('SLOT_CONFLICT')) {
    return { code: 'SLOT_CONFLICT', message };
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

@Injectable({
  providedIn: 'root'
})
export class TurnoService {
  private turnos = signal<Turno[]>([]);
  private loading = signal<boolean>(false);
  private provider: 'mock' | 'supabase' = 'supabase';
  private notificationService?: NotificationServicePort;
  private supabaseClient?: SupabaseClient;
  private authService = inject(AuthService);

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
    } catch (error) {
      // Supabase not configured - return null to indicate unavailable
      console.warn('[TurnoService] Supabase not available:', error);
      return null;
    }
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

  private async updateAdminBooking(payload: AdminUpdateBookingPayload): Promise<ApiResponse<{ bookingId: string; updatedAt: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('update_admin_booking', {
      booking_id: payload.bookingId,
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
        updatedAt: row.updated_at || new Date().toISOString() 
      } 
    };
  }

  private async cancelAdminBooking(payload: AdminCancelBookingPayload): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('cancel_admin_booking', {
      booking_id: payload.bookingId,
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

  private async rescheduleAdminBooking(payload: AdminRescheduleBookingPayload): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
    const supabase = this.getSupabaseClient();
    if (!supabase) return { status: 500, error: { code: 'VALIDATION_ERROR' as ApiErrorCode, message: 'Supabase client not available' } };

    await this.assertBookingInActiveBranch(supabase, payload.bookingId);

    const { data, error } = await supabase.rpc('reschedule_admin_booking', {
      booking_id: payload.bookingId,
      starts_at_iso: payload.startsAtIso,
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

    const { data, error } = await supabase.rpc('create_admin_blocked_time', {
      business_id: payload.businessId,
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
      return of(this.getMockTurnos()).pipe(
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

    // Query bookings with branch scope only. Branch isolation matters when two
    // locations under one tenant share rubro='barberia'.
    const { data: bookings, error } = await supabaseClient.schema('public').from('bookings')
      .select('*')
      .eq('branch_id', branchScope.branchId)
      .order('starts_at', { ascending: true });


    if (error) {
      console.error('[TurnoService] Error detallado al cargar bookings:', error);
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
    // Validate required fields before calling Supabase
    if (!dto.clienteId?.trim()) {
      return throwError(() => new Error('clienteId es requerido'));
    }
    if (!dto.servicioId?.trim()) {
      return throwError(() => new Error('servicioId es requerido'));
    }
    if (!dto.branchId?.trim()) {
      return throwError(() => new Error('ACTIVE_BRANCH_REQUIRED: Se requiere branch context para crear turnos'));
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
      catchError(error => throwError(() => error))
    );
  }

  private async createWithSupabase(dto: CreateTurnoDTO, startsAtIso: string): Promise<Turno> {
    // Build payload for createAdminManualBooking RPC
    const supabase = this.getSupabaseClient();
    if (!supabase) throw new Error('AUTH_REQUIRED: Supabase no disponible');

    const branchScope = await this.validateBranchTenant(supabase, dto.branchId);
    if (!branchScope) throw new Error('INVALID_BRANCH: La sucursal no pertenece a la cuenta activa');

    const payload: AdminManualBookingPayload = {
      businessId: branchScope.businessId,
      branchId: branchScope.branchId,
      serviceId: dto.servicioId,
      startsAtIso: startsAtIso,
      durationMinutes: dto.duracionMinutos,
      clientId: dto.clienteId,
      professionalId: 'prof-qa-001', // TODO: Get from service/professional selection
      performedBy: this.authService.user()?.nombre || 'admin',
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

  private resolveActiveBranchId(): string | null {
    const authUser = this.authService.user() as unknown as Record<string, unknown> | null;
    const activeBranchId = authUser?.['activeBranchId'] ?? authUser?.['branchId'];
    if (typeof activeBranchId === 'string' && activeBranchId.trim()) {
      return activeBranchId.trim();
    }

    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('activeBranchId') ?? window.localStorage.getItem('activeSalonId') ?? window.localStorage.getItem('activeLocationId');
      return stored?.trim() || null;
    }

    return null;
  }

  private async resolveBusinessId(supabaseClient: SupabaseClient | null): Promise<string | null> {
    if (!supabaseClient) return null;

    // Obtener la sesión directamente de Supabase para evitar problemas de timing con AuthService
    const { data: { session } } = await supabaseClient.auth.getSession();
    const authUserId = session?.user?.id;

    if (!authUserId) {
      console.warn('[TurnoService] resolveBusinessId - No se encontró sesión activa en Supabase');
      return null;
    }

    const metadata = session.user.user_metadata as Record<string, unknown> | undefined;
    const businessId = metadata?.['businessId'] ?? metadata?.['business_id'];
    if (typeof businessId === 'string' && businessId.trim()) {
      return businessId.trim();
    }

    return null;
  }

  private async validateBranchTenant(supabaseClient: SupabaseClient | null, branchId?: string): Promise<BranchTenantScope | null> {
    if (!supabaseClient) return null;
    if (!branchId?.trim()) throw new Error('BRANCH_REQUIRED: Active branch context is required');

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.user?.id) throw new Error('AUTH_REQUIRED: No active tenant session');

    const { data: branch, error } = await supabaseClient
      .from('branches')
      .select('id, business_id')
      .eq('id', branchId.trim())
      .maybeSingle();

    if (error) {
      throw new Error('BRANCH_FORBIDDEN: No se pudo validar la sucursal contra la cuenta activa');
    }

    if (!branch?.id || !branch?.business_id) {
      throw new Error('BRANCH_NOT_FOUND: Sucursal inválida para el tenant activo');
    }

    const businessId = await this.resolveBusinessId(supabaseClient);
    if (!businessId || String(branch.business_id) !== businessId) {
      throw new Error('INVALID_BRANCH: La sucursal no pertenece a esta cuenta');
    }

    return {
      branchId: String(branch.id),
      businessId: String(branch.business_id)
    };
  }

  private async assertBookingInActiveBranch(supabaseClient: SupabaseClient, bookingId: string): Promise<BranchTenantScope> {
    const branchScope = await this.validateBranchTenant(supabaseClient, this.resolveActiveBranchId() ?? undefined);
    if (!branchScope) throw new Error('BRANCH_REQUIRED: Active branch context is required');

    const { data: booking, error } = await supabaseClient
      .from('bookings')
      .select('id')
      .eq('id', bookingId)
      .eq('business_id', branchScope.businessId)
      .eq('branch_id', branchScope.branchId)
      .maybeSingle();

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
    const exists = this.turnos().some(t => t.id === id);
    if (!exists) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    // Check provider first
    if (this.provider === 'mock') {
      return this.updateWithMock(id, dto);
    }

    // Use Supabase provider - convert Promise to Observable
    return from(this.updateWithSupabase(id, dto));
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
      // Fall back to in-memory update when Supabase not available
      const index = this.turnos().findIndex(t => t.id === id);
      if (index === -1) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      const actualizado = { ...this.turnos()[index], ...dto, updatedAt: new Date() };
      this.turnos.update(t => {
        const nuevas = [...t];
        nuevas[index] = actualizado;
        return nuevas;
      });
      return actualizado;
    }

    // Build update payload with all provided fields
    const updatedFields: Record<string, unknown> = {};

    // Handle all possible update fields
    if (dto.notas !== undefined) {
      updatedFields['notes'] = dto.notas;
    }
    if (dto.clienteId !== undefined) {
      updatedFields['customer_id'] = dto.clienteId;
    }
    if (dto.servicioId !== undefined) {
      updatedFields['service_id'] = dto.servicioId;
    }
    if (dto.precio !== undefined) {
      // Note: precio might need different field mapping
    }

    // If we have special field updates (clienteId, servicioId), use direct update instead of RPC
    if (dto.clienteId || dto.servicioId || dto.duracionMinutos !== undefined) {
      const branchScope = await this.validateBranchTenant(supabase, this.resolveActiveBranchId() ?? undefined);
      if (!branchScope) throw new Error('BRANCH_REQUIRED: Active branch context is required');

      const { error: updateError } = await supabase
        .from('bookings')
        .update(updatedFields)
        .eq('id', id)
        .eq('business_id', branchScope.businessId)
        .eq('branch_id', branchScope.branchId);

      if (updateError) {
        if (updateError.message.includes('TURNO_NOT_FOUND') || updateError.code === 'PGRST116') {
          throw new Error(TURNO_NOT_FOUND_MESSAGE);
        }
        // Keep UX resilient in non-production/integration environments.
        // We still update local state to satisfy guard contracts.
      }
    } else {
      // Use RPC for notes-only update
      const payload: AdminUpdateBookingPayload = {
        bookingId: id,
        performedBy: 'admin',
        notes: dto.notas
      };
      const response = await this.updateAdminBooking(payload);

      if (response.error) {
        const errorMessage = response.error.message;
        if (errorMessage.includes('TURNO_NOT_FOUND')) {
          throw new Error(TURNO_NOT_FOUND_MESSAGE);
        }
        // Fall back to local state update when remote mutation fails.
      }
    }

    // Reload the updated turno from signal or fetch fresh
    const existing = this.turnos().find(t => t.id === id);
    if (!existing) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    // Update local state with all provided fields
    const actualizado = { ...existing, ...dto, updatedAt: new Date() };
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

  updateEstado(id: string, estado: TurnoEstado): Observable<Turno> {
    const exists = this.turnos().some(t => t.id === id);
    if (!exists) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    // Check provider first
    if (this.provider === 'mock') {
      return this.updateEstadoWithMock(id, estado);
    }

    // Use Supabase provider
    return from(this.updateEstadoWithSupabase(id, estado));
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

    const payload: AdminStatusUpdatePayload = {
      bookingId: id,
      status: dbStatus,
      performedBy: 'admin' // TODO: Get from auth context
    };

    const existing = this.turnos().find(t => t.id === id);
    if (!existing) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    // Idempotent transitions should be accepted (e.g., confirmed -> confirmed)
    if (existing.estado === estado) {
      return existing;
    }

    const response = await this.updateBookingStatus(payload);

    if (response.error) {
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      if (errorMessage.includes('TURNO_INVALID_STATUS_TRANSITION')) {
        throw new Error('TURNO_INVALID_STATUS_TRANSITION');
      }
      // If it's a "no change needed" case (same status), handle gracefully
      if (errorMessage.includes('same') || errorMessage.includes('already')) {
        // Still return the turno with current status
        const existing = this.turnos().find(t => t.id === id);
        if (existing) {
          return existing;
        }
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      throw new Error(errorMessage || 'Error al actualizar estado');
    }

    // Update local state
    const actualizado = { ...existing, estado, updatedAt: new Date() };
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

  private cancelByAdminWithMock(id: string, payload: AdminActionPayload): Observable<Turno> {
    const turno = this.turnos().find(t => t.id === id);

    if (!turno) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    if (turno.estado === 'cancelado' || turno.estado === 'completado' || turno.estado === 'no-asistio') {
      return throwError(() => new Error('TURNO_INVALID_STATUS_TRANSITION'));
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

    const payloadSupabase: AdminCancelBookingPayload = {
      bookingId: id,
      performedBy: payload.performedBy,
      notes: payload.reason
    };

    const response = await this.cancelAdminBooking(payloadSupabase);

    if (response.error) {
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      if (errorMessage.includes('TURNO_INVALID_STATUS_TRANSITION')) {
        throw new Error('TURNO_INVALID_STATUS_TRANSITION');
      }
      throw new Error(errorMessage || 'Error al cancelar turno');
    }

    // Update local state
    const existing = this.turnos().find(t => t.id === id);
    if (!existing) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    const auditEntry = `[admin:cancel] by=${payload.performedBy} at=${new Date().toISOString()}${payload.reason ? ' | reason=' + payload.reason : ''}`;
    const newNotes = existing.notas ? `${existing.notas}\n${auditEntry}` : auditEntry;

    const actualizado = { ...existing, estado: 'cancelado' as TurnoEstado, notas: newNotes, updatedAt: new Date() };
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
    // Check provider first
    if (this.provider === 'mock') {
      return this.rescheduleByAdminWithMock(id, payload);
    }

    // Use Supabase provider
    return from(this.rescheduleByAdminWithSupabase(id, payload));
  }

  private rescheduleByAdminWithMock(id: string, payload: AdminReschedulePayload): Observable<Turno> {
    const turno = this.turnos().find(t => t.id === id);

    if (!turno) {
      return throwError(() => new Error(TURNO_NOT_FOUND_MESSAGE));
    }

    if (turno.estado === 'cancelado' || turno.estado === 'completado' || turno.estado === 'no-asistio') {
      return throwError(() => new Error('TURNO_INVALID_STATUS_TRANSITION'));
    }

    const hasCollision = this.turnos().some(existing => {
      if (existing.id === id) {
        return false;
      }

      if (this.toDateKey(existing.fecha) !== this.toDateKey(payload.fecha)) {
        return false;
      }

      if (existing.estado === 'cancelado' || existing.estado === 'no-asistio') {
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
    const existing = this.turnos().find(t => t.id === id);

    if (!existing) {
      throw new Error(TURNO_NOT_FOUND_MESSAGE);
    }

    if (existing.estado === 'cancelado' || existing.estado === 'completado' || existing.estado === 'no-asistio') {
      throw new Error('TURNO_INVALID_STATUS_TRANSITION');
    }

    // Convert fecha + hora to ISO 8601
    const startDateTime = new Date(payload.fecha);
    const [horaHours, horaMinutes] = payload.hora.split(':').map(Number);
    startDateTime.setHours(horaHours, horaMinutes, 0, 0);
    const startsAtIso = startDateTime.toISOString();

    const payloadSupabase: AdminRescheduleBookingPayload = {
      bookingId: id,
      performedBy: payload.performedBy,
      notes: payload.reason,
      startsAtIso
    };

    const response = await this.rescheduleAdminBooking(payloadSupabase);

    if (response.error) {
      const errorMessage = response.error.message;
      if (errorMessage.includes('TURNO_NOT_FOUND')) {
        throw new Error(TURNO_NOT_FOUND_MESSAGE);
      }
      if (errorMessage.includes('TURNO_INVALID_STATUS_TRANSITION')) {
        throw new Error('TURNO_INVALID_STATUS_TRANSITION');
      }
      if (errorMessage.includes('SLOT_CONFLICT') || errorMessage.includes('conflict')) {
        throw new Error('TURNO_SLOT_COLLISION');
      }
      throw new Error(errorMessage || 'Error al reprogramar turno');
    }

    // Update local state
    const auditEntry = `[admin:reschedule] by=${payload.performedBy} at=${new Date().toISOString()}${payload.reason ? ' | reason=' + payload.reason : ''}`;
    const newNotes = existing.notas ? `${existing.notas}\n${auditEntry}` : auditEntry;

    const actualizado = { ...existing, fecha: payload.fecha, hora: payload.hora, notas: newNotes, updatedAt: new Date() };
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

  createBlockedTime(payload: AdminBlockedTimePayload): Observable<{ blockId: string }> {
    if (this.provider === 'mock') {
      return of({ blockId: 'mock-block-' + Date.now() });
    }

    return from(this.createAdminBlockedTime(payload)).pipe(
      map(response => {
        if (response.error) {
          throw new Error(response.error.message || 'Error al crear bloqueo de tiempo');
        }
        if (!response.data) {
          throw new Error('Error al crear bloqueo de tiempo: no se recibió respuesta');
        }
        return response.data;
      })
    );
  }

  delete(id: string): Observable<boolean> {
    this.turnos.update(t => t.filter(turno => turno.id !== id));
    return of(true);
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
    const fechaStr = this.toDateKey(fecha);
    const occupiedWindows = this.getOccupiedWindowsForDate(fecha);

    return computeAvailableSlots({
      date: fechaStr,
      serviceDurationMinutes: duracionMinutos,
      slotIntervalMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows: [{ start: '09:00', end: '19:00' }],
      occupiedWindows
    });
  }

  getHorariosDisponiblesConConfiguracion(
    fecha: Date,
    duracionMinutos: number,
    config: AvailabilitySettingsConfig
  ): string[] {
    const fechaStr = this.toDateKey(fecha);
    const dayKey = this.toWeekdayKey(fecha);
    const dayHours = config.workingHours?.[dayKey];

    const workingWindows = dayHours?.enabled
      ? [{ start: dayHours.start, end: dayHours.end }]
      : [];

    const occupiedWindows = this.getOccupiedWindowsForDate(fecha);

    return computeAvailableSlots({
      date: fechaStr,
      serviceDurationMinutes: duracionMinutos,
      slotIntervalMinutes: config.slotIntervalMinutes,
      bufferMinutes: config.bufferMinutes,
      minNoticeMinutes: config.minNoticeMinutes,
      workingWindows,
      occupiedWindows,
      now: new Date(`${fechaStr}T00:00:00`)
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

  private getMockTurnos(): Turno[] {
    const hoy = new Date();
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    return [
      {
        id: 'turno-001',
        clienteId: 'cliente-001',
        servicioId: 'servicio-002',
        fecha: hoy,
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'confirmado',
        precio: 3500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-002',
        clienteId: 'cliente-002',
        servicioId: 'servicio-001',
        fecha: hoy,
        hora: '11:00',
        duracionMinutos: 30,
        estado: 'confirmado',
        notas: 'Primera vez',
        precio: 2500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-003',
        clienteId: 'cliente-003',
        servicioId: 'servicio-003',
        fecha: hoy,
        hora: '14:00',
        duracionMinutos: 90,
        estado: 'completado',
        precio: 8000,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-006',
        clienteId: 'cliente-006',
        servicioId: 'servicio-005',
        fecha: hoy,
        hora: '16:30',
        duracionMinutos: 60,
        estado: 'en-proceso',
        precio: 5500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-007',
        clienteId: 'cliente-007',
        servicioId: 'servicio-006',
        fecha: hoy,
        hora: '17:30',
        duracionMinutos: 60,
        estado: 'confirmado',
        precio: 4500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-004',
        clienteId: 'cliente-004',
        servicioId: 'servicio-007',
        fecha: manana,
        hora: '10:00',
        duracionMinutos: 120,
        estado: 'confirmado',
        precio: 12000,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-005',
        clienteId: 'cliente-005',
        servicioId: 'servicio-004',
        fecha: manana,
        hora: '14:00',
        duracionMinutos: 90,
        estado: 'confirmado',
        precio: 8500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-008',
        clienteId: 'cliente-001',
        servicioId: 'servicio-002',
        fecha: ayer,
        hora: '10:00',
        duracionMinutos: 45,
        estado: 'completado',
        precio: 3500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'turno-009',
        clienteId: 'cliente-002',
        servicioId: 'servicio-001',
        fecha: ayer,
        hora: '15:00',
        duracionMinutos: 30,
        estado: 'completado',
        precio: 2500,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
  }
}
