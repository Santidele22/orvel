// Turno Form Page - US-002
// Create/Edit Turno with conflict detection

import { Component, EventEmitter, HostListener, Input, OnInit, Output, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingSchedulingService
} from '@orvel/booking/application';
import { ClienteService } from '../../clientes/data-access/cliente.service';
import { ServicioService } from '../../servicios/data-access/servicio.service';
import { AuthService } from '../../../services/auth.service';
import { Turno, TurnoEstado, CreateTurnoDTO } from '../models/turno.model';
import { Cliente } from '../../../models/cliente.model';
import { Servicio } from '../../../models/servicio.model';
import { getBranchContextService } from '../../../core/branches/branch-context.service';
import { logMutationFailure } from '../../../core/observability/mutation-error-log';

@Component({
  selector: 'app-turno-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './turno-form.page.html',
  styleUrl: './turno-form.page.scss'
})
export class TurnoFormPage implements OnInit {
  private crud = inject(BookingCrudService);
  private scheduling = inject(BookingSchedulingService);
  private availability = inject(BookingAvailabilityService);
  private clienteService = inject(ClienteService);
  private servicioService = inject(ServicioService);
  private authService = inject(AuthService);
  protected branchContext = getBranchContextService();
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @Input() presentation: 'page' | 'modal' = 'page';
  @Output() cancelled = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  // State
  protected loading = signal<boolean>(false);
  protected saving = signal<boolean>(false);
  protected isEdit = signal<boolean>(false);
  protected turnoId = signal<string | null>(null);
  protected error = signal<string | null>(null);

  // Form data
  protected clientes = signal<Cliente[]>([]);
  protected servicios = signal<Servicio[]>([]);
  protected disponibles = signal<string[]>([]);
  protected availabilityLoading = signal<boolean>(false);
  protected availabilityError = signal<string | null>(null);
  protected availabilityEmpty = signal<boolean>(false);
  protected hasLoadedAvailability = signal<boolean>(false);
  protected availabilityStale = signal<boolean>(true);
  protected defaultBranchScopeReady = signal<boolean>(false);
  protected defaultBranchSetupError = signal<string | null>(null);
  protected availabilityRequestKey = signal<string>('');
  private latestAvailabilityVersion = 0;

  // Form fields
  protected clienteId = signal<string>('');
  protected walkInName = signal<string>('');
  protected walkInMode = signal<boolean>(false);
  protected servicioId = signal<string>('');
  protected fecha = signal<string>(toLocalDateIso());
  private resolvedBusinessId = signal<string>('');
  protected hora = signal<string>('');
  protected duracionMinutos = signal<number>(30);
  protected precio = signal<number>(0);
  protected notas = signal<string>('');
  protected estado = signal<TurnoEstado>('confirmado');

  // Conflict detection
  protected conflictError = signal<string | null>(null);
  protected isPastDate = signal<boolean>(false);
  private readonly unavailableSlotMessage = 'Este horario no está disponible. Elegí otro turno.';
  protected readonly needServiceHoursMessage = 'Elegí un servicio para ver horarios.';
  protected canSave = computed(() => {
    return !this.saving()
      && !this.availabilityLoading()
      && !this.availabilityError()
      && !this.availabilityEmpty()
      && !this.availabilityStale()
      && this.hasLoadedAvailability()
      && this.defaultBranchScopeReady()
      && !this.defaultBranchSetupError()
      && !this.conflictError()
      && (!!this.clienteId() || !!this.walkInName().trim())
      && !!this.servicioId()
      && !!this.hora()
      && this.disponibles().includes(this.hora());
  });

  async ngOnInit() {
    this.loading.set(true);
    
    try {
      await this.branchContext.ensureLoaded();
      if (this.branchContext.requiresExplicitSelection()) {
        this.defaultBranchSetupError.set('No pudimos preparar el turno para esta cuenta. Revisá la configuración de cuenta o contactá soporte.');
        this.error.set(this.defaultBranchSetupError());
        this.loading.set(false);
        return;
      }

      await this.ensureDefaultBranchScopeReady('turno');

      // Load clientes and servicios
      await Promise.all([
        this.clienteService.getAll().toPromise(),
        this.servicioService.getAll().toPromise()
      ]);

      this.clientes.set(this.clienteService.items());
      this.servicios.set(this.servicioService.items());

      // Check if editing
      const id = this.route.snapshot.paramMap.get('id');
      if (id && id !== 'new') {
        this.turnoId.set(id);
        this.isEdit.set(true);
        await this.loadTurno(id);
      } else {
        // Load available times for initial date
        this.checkAvailability();
      }

      this.loading.set(false);
    } catch {
      this.error.set(this.defaultBranchSetupError() ?? 'Error al cargar datos');
      this.loading.set(false);
    }
  }

  private async loadTurno(id: string) {
    try {
      const items = await this.crud.getAll((await this.resolveScope()).branchId);
      const turno = this.crud.getById(items, id);
      if (turno) {
        this.clienteId.set(turno.clienteId ?? '');
        this.servicioId.set(turno.servicioId ?? '');
        this.fecha.set(turno.fecha.toISOString().split('T')[0]);
        this.hora.set(turno.hora);
        this.duracionMinutos.set(turno.duracionMinutos);
        this.precio.set(turno.precio ?? 0);
        this.notas.set(turno.notas || '');
        this.estado.set(turno.estado);
        
        // Check availability after loading
        this.checkAvailability();
      }
    } catch {
      this.error.set('Turno no encontrado');
    }
  }

  protected onfechaChange() {
    this.resetAvailability('La disponibilidad cambió: elegí un horario disponible.');
    this.checkAvailability();
  }

  protected onServicioChange() {
    const servicio = this.servicios().find(s => s.id === this.servicioId());
    if (servicio) {
      this.duracionMinutos.set(servicio.duracionMinutos);
      this.precio.set(servicio.precio);
    }
    this.resetAvailability('La disponibilidad cambió: elegí un horario disponible.');
    this.checkAvailability();
  }

  protected async checkAvailability() {
    const availabilityVersion = ++this.latestAvailabilityVersion;
    const fechaDate = parseLocalDate(this.fecha());
    const today = parseLocalDate(toLocalDateIso());
    const requestKey = `${this.fecha()}|${this.duracionMinutos()}|${this.servicioId()}|${this.turnoId() ?? ''}|${availabilityVersion}`;
    this.availabilityRequestKey.set(requestKey);
    this.disponibles.set([]);
    this.hora.set('');
    this.availabilityError.set(null);
    this.availabilityEmpty.set(false);
    this.hasLoadedAvailability.set(false);
    this.availabilityStale.set(true);
    this.isPastDate.set(fechaDate < today);

    if (!this.servicioId()) {
      this.availabilityLoading.set(false);
      this.conflictError.set(null);
      return;
    }

    this.availabilityLoading.set(true);
    this.conflictError.set(null);

    try {
      const scope = await this.resolveScope();
      this.defaultBranchScopeReady.set(true);
      const horarios = await this.availability.loadAvailabilityAdminSlotTimes({
        fecha: fechaDate,
        dateIso: this.fecha(),
        durationMinutes: this.duracionMinutos(),
        serviceId: this.servicioId(),
        branchId: scope.branchId,
        businessId: scope.businessId,
        context: this.isEdit() ? 'admin-reschedule' : 'admin-create',
        bookingId: this.turnoId()
      });

      if (availabilityVersion !== this.latestAvailabilityVersion || requestKey !== this.availabilityRequestKey()) {
        return;
      }

      this.disponibles.set(horarios);
      this.availabilityEmpty.set(horarios.length === 0);
      this.hasLoadedAvailability.set(true);
      this.availabilityStale.set(false);
      this.conflictError.set(null);
    } catch (error) {
      if (availabilityVersion !== this.latestAvailabilityVersion) return;

      logMutationFailure({
        operation: 'query_admin_slot_availability',
        error,
        ids: {
          businessId: this.resolvedBusinessId() || undefined,
          branchId: this.branchContext.getActiveBranchId() ?? undefined,
          bookingId: this.turnoId() ?? undefined
        }
      });

      this.disponibles.set([]);
      this.hora.set('');
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/SERVICE_NOT_FOUND/i.test(errorMessage)) {
        this.availabilityError.set('Ese servicio no pertenece a esta cuenta. Recargá e intentá de nuevo.');
        this.availabilityStale.set(true);
        this.hasLoadedAvailability.set(false);
        this.conflictError.set(this.unavailableSlotMessage);
      } else if (/BOOKING_VALIDATION_ERROR/i.test(errorMessage)) {
        this.availabilityError.set(mapBookingValidationAvailabilityCopy(errorMessage));
        this.availabilityEmpty.set(false);
        this.hasLoadedAvailability.set(true);
        this.availabilityStale.set(false);
        this.conflictError.set(null);
      } else {
        this.availabilityError.set(/ACCOUNT_SETUP_REQUIRED|ACTIVE_BRANCH_REQUIRED|BRANCH_REQUIRED|INVALID_BRANCH|BRANCH_NOT_FOUND|BRANCH_FORBIDDEN|UNAUTHORIZED|BUSINESS_NOT_FOUND/i.test(errorMessage)
          ? 'No pudimos preparar el turno para esta cuenta. Revisá la configuración de cuenta o contactá soporte.'
          : 'No pudimos consultar disponibilidad. Reintentá antes de guardar.');
        this.availabilityStale.set(true);
        this.hasLoadedAvailability.set(false);
        this.conflictError.set(this.unavailableSlotMessage);
      }
    } finally {
      if (availabilityVersion === this.latestAvailabilityVersion) {
        this.availabilityLoading.set(false);
      }
    }
  }

  protected validateSelectedHour() {
    if (!this.hora()) {
      this.conflictError.set(null);
      return;
    }

    this.conflictError.set(this.disponibles().includes(this.hora()) ? null : this.unavailableSlotMessage);
  }

  protected onClientSelectionChange(clientId: string): void {
    this.clienteId.set(clientId);
    this.walkInName.set('');
    this.walkInMode.set(false);
    this.error.set(null);
  }

  protected startWalkIn(): void {
    this.clienteId.set('');
    this.walkInMode.set(true);
    this.error.set(null);
  }

  protected resetAvailability(staleMessage?: string) {
    this.latestAvailabilityVersion += 1;
    this.disponibles.set([]);
    this.hora.set('');
    this.availabilityLoading.set(false);
    this.availabilityError.set(null);
    this.availabilityEmpty.set(false);
    this.hasLoadedAvailability.set(false);
    this.availabilityStale.set(true);
    this.conflictError.set(staleMessage ?? null);
  }

  protected async save() {
    // Validate
    const walkInName = this.walkInName().trim();

    if (!this.clienteId() && !walkInName) {
      this.error.set('Elegí un cliente o cargá el nombre para una atención sin ficha.');
      return;
    }
    if (!this.servicioId()) {
      this.error.set('Seleccione un servicio');
      return;
    }
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);

    try {
      if (this.isEdit() && this.turnoId()) {
        const performedBy = this.currentAdminActor();
        if (!performedBy) {
          this.error.set('No se pudo identificar la cuenta administradora. Volvé a iniciar sesión.');
          this.saving.set(false);
          return;
        }
        // Admin-managed reschedule/edit flow
        await this.scheduling.rescheduleByAdmin(this.turnoId()!, {
          fecha: parseLocalDate(this.fecha()),
          hora: this.hora(),
          performedBy,
          reason: this.notas() || 'Reprogramación desde formulario administrativo'
        }, await this.resolveScope());
      } else {
        // Create new
        const scope = await this.resolveScope();
        this.defaultBranchScopeReady.set(true);
        const dto: CreateTurnoDTO = {
          branchId: scope.branchId,
          clienteId: this.clienteId(),
          walkInName: this.clienteId() ? undefined : walkInName,
          servicioId: this.servicioId(),
          fecha: parseLocalDate(this.fecha()),
          hora: this.hora(),
          duracionMinutos: this.duracionMinutos(),
          precio: this.precio(),
          notas: this.notas(),
          estado: this.estado()
        };
        await this.scheduling.create(dto, scope);
      }

      this.resetAvailability();

      if (this.presentation === 'modal') {
        this.saved.emit();
        return;
      }

      this.router.navigate(['/dashboard/turnos']);
    } catch (error) {
      logMutationFailure({
        operation: this.isEdit() ? 'reschedule_admin_booking' : 'create_admin_manual_booking',
        error,
        ids: {
          businessId: this.resolvedBusinessId() || undefined,
          branchId: this.branchContext.getActiveBranchId() ?? undefined,
          bookingId: this.turnoId() ?? undefined
        }
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/TURNO_SLOT_COLLISION/i.test(errorMessage) || /(ocupado|no disponible|conflict|bloqueado)/i.test(errorMessage)) {
        this.conflictError.set(this.unavailableSlotMessage);
        this.error.set(null);
      } else if (/ACTIVE_BRANCH_REQUIRED|BRANCH_REQUIRED|INVALID_BRANCH|BRANCH_NOT_FOUND|BRANCH_FORBIDDEN/i.test(errorMessage)) {
        this.error.set('No pudimos preparar el turno para esta cuenta. Reintentá más tarde o contactá soporte.');
      } else if (/TURNO_INVALID_STATUS_TRANSITION/i.test(errorMessage)) {
        this.error.set('No se puede reprogramar el turno con su estado actual');
      } else {
        this.error.set('Error al guardar turno');
      }
      this.saving.set(false);
    }
  }

  protected cancel() {
    if (this.presentation === 'modal') {
      this.cancelled.emit();
      return;
    }

    this.router.navigate(['/dashboard/turnos']);
  }

  @HostListener('document:keydown.escape')
  protected onEscapeKey() {
    if (this.presentation === 'modal') {
      this.cancelled.emit();
    }
  }

  protected async onBranchSelectionChange(branchId: string) {
    if (!this.branchContext.setActiveBranch(branchId)) {
      this.error.set('ACTIVE_BRANCH_REQUIRED: Seleccioná una sucursal válida.');
      return;
    }

    this.error.set(null);
    if (this.clientes().length === 0 || this.servicios().length === 0) {
      await Promise.all([
        this.clienteService.getAll().toPromise(),
        this.servicioService.getAll().toPromise()
      ]);
      this.clientes.set(this.clienteService.items());
      this.servicios.set(this.servicioService.items());
    }
    this.resetAvailability('La sucursal activa cambió: elegí un horario disponible.');
    await this.checkAvailability();
  }

  private async ensureDefaultBranchScopeReady(context: 'turno' | 'disponibilidad'): Promise<string> {
    try {
      const scope = await this.resolveScope();
      this.defaultBranchScopeReady.set(true);
      this.defaultBranchSetupError.set(null);
      return scope.branchId;
    } catch (error) {
      this.defaultBranchScopeReady.set(false);
      const copy = context === 'turno'
        ? 'No pudimos preparar el turno para esta cuenta. Revisá la configuración de cuenta o contactá soporte.'
        : 'No pudimos preparar la disponibilidad para esta cuenta. Revisá la configuración de cuenta o contactá soporte.';
      this.defaultBranchSetupError.set(copy);
      throw error;
    }
  }

  private currentAdminActor(): string | null {
    return this.authService.user()?.id?.trim() || null;
  }

  private async resolveScope() {
    const user = this.authService.user() as { id?: string; activeBranchId?: string } | null;
    const userId = String(user?.id ?? '').trim();
    const branchId = this.branchContext.getActiveBranchId() ?? user?.activeBranchId ?? '';
    if (!userId) throw new Error('AUTH_REQUIRED: No active tenant session');
    if (!branchId) throw new Error('ACTIVE_BRANCH_REQUIRED: Se requiere sucursal activa');
    let businessId = this.resolvedBusinessId();
    if (!businessId) {
      businessId = (await this.branchContext.getActiveBusinessId())?.trim() || '';
      this.resolvedBusinessId.set(businessId);
    }
    if (!businessId) throw new Error('ACCOUNT_SETUP_REQUIRED: No active business');
    return { userId, branchId, businessId, performedBy: userId };
  }

  protected getHorarioLabel(hora: string): string {
    const [h, m] = hora.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  protected formatCurrency = (precio: number): string => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(precio);
  };
}

function toLocalDateIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

const bookingValidationBranchInactiveCopy =
  'Esta sucursal no está activa. Elegí otra sucursal o revisá la configuración de cuenta.';
const bookingValidationWorkingHoursCopy =
  'El horario de atención de este día está incompleto o inválido. Revisá inicio y fin en Configuraciones.';
const bookingValidationDurationCopy =
  'La duración del servicio no es válida. Revisá el servicio o la duración.';
const bookingValidationUnknownCopy =
  'No pudimos armar los horarios con esta configuración. Revisá sucursal, horario de atención y duración.';

function mapBookingValidationAvailabilityCopy(errorMessage: string): string {
  if (/BRANCH_INACTIVE/i.test(errorMessage)) {
    return bookingValidationBranchInactiveCopy;
  }
  if (/WORKING_HOURS/i.test(errorMessage)) {
    return bookingValidationWorkingHoursCopy;
  }
  if (/DURATION/i.test(errorMessage)) {
    return bookingValidationDurationCopy;
  }
  return bookingValidationUnknownCopy;
}
