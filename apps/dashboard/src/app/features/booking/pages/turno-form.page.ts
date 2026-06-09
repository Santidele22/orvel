// Turno Form Page - US-002
// Create/Edit Turno with conflict detection

import { Component, OnInit, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TurnoService } from '../data-access/turno.service';
import { ClienteService } from '../../clientes/data-access/cliente.service';
import { ServicioService } from '../../servicios/data-access/servicio.service';
import { AuthService } from '../../../services/auth.service';
import { Turno, TurnoEstado, CreateTurnoDTO } from '../models/turno.model';
import { Cliente } from '../../../models/cliente.model';
import { Servicio } from '../../../models/servicio.model';

@Component({
  selector: 'app-turno-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './turno-form.page.html',
  styleUrl: './turno-form.page.scss'
})
export class TurnoFormPage implements OnInit {
  private turnoService = inject(TurnoService);
  private clienteService = inject(ClienteService);
  private servicioService = inject(ServicioService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

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
  protected availabilityRequestKey = signal<string>('');
  private latestAvailabilityVersion = 0;

  // Form fields
  protected clienteId = signal<string>('');
  protected walkInName = signal<string>('');
  protected servicioId = signal<string>('');
  protected fecha = signal<string>(new Date().toISOString().split('T')[0]);
  protected hora = signal<string>('');
  protected duracionMinutos = signal<number>(30);
  protected precio = signal<number>(0);
  protected notas = signal<string>('');
  protected estado = signal<TurnoEstado>('confirmado');

  // Conflict detection
  protected conflictError = signal<string | null>(null);
  protected isPastDate = signal<boolean>(false);
  private readonly unavailableSlotMessage = 'Este horario no está disponible. Elegí otro turno.';
  protected canSave = computed(() => {
    return !this.saving()
      && !this.availabilityLoading()
      && !this.availabilityError()
      && !this.availabilityEmpty()
      && !this.availabilityStale()
      && this.hasLoadedAvailability()
      && !this.conflictError()
      && (!!this.clienteId() || !!this.walkInName().trim())
      && !!this.servicioId()
      && !!this.hora()
      && this.disponibles().includes(this.hora());
  });

  async ngOnInit() {
    this.loading.set(true);
    
    try {
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
      this.error.set('Error al cargar datos');
      this.loading.set(false);
    }
  }

  private async loadTurno(id: string) {
    try {
      const turno = await this.turnoService.getById(id).toPromise();
      if (turno) {
        this.clienteId.set(turno.clienteId);
        this.servicioId.set(turno.servicioId);
        this.fecha.set(turno.fecha.toISOString().split('T')[0]);
        this.hora.set(turno.hora);
        this.duracionMinutos.set(turno.duracionMinutos);
        this.precio.set(turno.precio);
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
    const fechaDate = new Date(this.fecha());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const requestKey = `${this.fecha()}|${this.duracionMinutos()}|${this.servicioId()}|${this.turnoId() ?? ''}|${availabilityVersion}`;
    this.availabilityRequestKey.set(requestKey);
    this.availabilityLoading.set(true);
    this.availabilityError.set(null);
    this.availabilityEmpty.set(false);
    this.availabilityStale.set(true);
    this.hasLoadedAvailability.set(false);
    this.disponibles.set([]);
    this.hora.set('');

    // Check if past date
    this.isPastDate.set(fechaDate < today);

    try {
      const horarios = await this.turnoService.loadAvailabilityAdminSlotTimes({
        fecha: fechaDate,
        durationMinutes: this.duracionMinutos(),
        serviceId: this.servicioId() || null,
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
    } catch {
      if (availabilityVersion !== this.latestAvailabilityVersion) return;

      this.disponibles.set([]);
      this.hora.set('');
      this.availabilityError.set('No pudimos consultar disponibilidad. Reintentá antes de guardar.');
      this.availabilityStale.set(true);
      this.hasLoadedAvailability.set(false);
      this.conflictError.set(this.unavailableSlotMessage);
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

  protected resetAvailability(staleMessage?: string) {
    this.latestAvailabilityVersion += 1;
    this.turnoService.invalidateAdminAvailability();
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
    const branchId = this.turnoService.getActiveBranchId();

    if (!this.clienteId() && !walkInName) {
      this.error.set('Seleccione un cliente o ingresá un nombre para atención sin ficha');
      return;
    }
    if (!this.servicioId()) {
      this.error.set('Seleccione un servicio');
      return;
    }
    if (!this.canSave()) {
      return;
    }
    if (!branchId) {
      this.error.set('No encontramos la sucursal activa para crear el turno');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const dto: CreateTurnoDTO = {
        branchId: branchId,
        clienteId: this.clienteId(),
        walkInName: this.clienteId() ? undefined : walkInName,
        servicioId: this.servicioId(),
        fecha: new Date(this.fecha()),
        hora: this.hora(),
        duracionMinutos: this.duracionMinutos(),
        precio: this.precio(),
        notas: this.notas(),
        estado: this.estado()
      };

      if (this.isEdit() && this.turnoId()) {
        const performedBy = this.currentAdminActor();
        if (!performedBy) {
          this.error.set('No se pudo identificar la cuenta administradora. Volvé a iniciar sesión.');
          this.saving.set(false);
          return;
        }
        // Admin-managed reschedule/edit flow
        await this.turnoService.rescheduleByAdmin(this.turnoId()!, {
          fecha: new Date(this.fecha()),
          hora: this.hora(),
          performedBy,
          reason: this.notas() || 'Reprogramación desde formulario administrativo'
        }).toPromise();
      } else {
        // Create new
        await this.turnoService.create(dto).toPromise();
      }

      this.resetAvailability();

      this.router.navigate(['/dashboard/turnos']);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (/TURNO_SLOT_COLLISION/i.test(errorMessage) || /(ocupado|no disponible|conflict|bloqueado)/i.test(errorMessage)) {
        this.conflictError.set(this.unavailableSlotMessage);
        this.error.set(null);
      } else if (/TURNO_INVALID_STATUS_TRANSITION/i.test(errorMessage)) {
        this.error.set('No se puede reprogramar el turno con su estado actual');
      } else {
        this.error.set('Error al guardar turno');
      }
      this.saving.set(false);
    }
  }

  private currentAdminActor(): string | null {
    return this.authService.user()?.id?.trim() || null;
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
