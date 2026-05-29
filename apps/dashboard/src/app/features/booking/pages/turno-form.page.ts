// Turno Form Page - US-002
// Create/Edit Turno with conflict detection

import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TurnoService } from '../data-access/turno.service';
import { ClienteService } from '../../clientes/data-access/cliente.service';
import { ServicioService } from '../../servicios/data-access/servicio.service';
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

  // Form fields
  protected clienteId = signal<string>('');
  protected servicioId = signal<string>('');
  protected fecha = signal<string>(new Date().toISOString().split('T')[0]);
  protected hora = signal<string>('10:00');
  protected duracionMinutos = signal<number>(30);
  protected precio = signal<number>(0);
  protected notas = signal<string>('');
  protected estado = signal<TurnoEstado>('confirmado');

  // Conflict detection
  protected conflictError = signal<string | null>(null);
  protected isPastDate = signal<boolean>(false);
  private readonly unavailableSlotMessage = 'Este horario no está disponible. Elegí otro turno.';

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
    } catch (error) {
      console.error('Error initializing form:', error);
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
    } catch (error) {
      console.error('Error loading turno:', error);
      this.error.set('Turno no encontrado');
    }
  }

  protected onfechaChange() {
    this.conflictError.set(null);
    this.checkAvailability();
  }

  protected onServicioChange() {
    const servicio = this.servicios().find(s => s.id === this.servicioId());
    if (servicio) {
      this.duracionMinutos.set(servicio.duracionMinutos);
      this.precio.set(servicio.precio);
    }
    this.checkAvailability();
  }

  protected checkAvailability() {
    const fechaDate = new Date(this.fecha());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check if past date
    this.isPastDate.set(fechaDate < today);
    
    // Get available times
    const horarios = this.turnoService.getHorariosDisponibles(fechaDate, this.duracionMinutos());
    this.disponibles.set(horarios);
    
    // Check if current time slot is available
    if (!horarios.includes(this.hora()) && this.hora()) {
      this.conflictError.set(this.unavailableSlotMessage);
    } else {
      this.conflictError.set(null);
    }
  }

  protected async save() {
    // Validate
    if (!this.clienteId()) {
      this.error.set('Seleccione un cliente');
      return;
    }
    if (!this.servicioId()) {
      this.error.set('Seleccione un servicio');
      return;
    }
    if (this.conflictError()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const dto: CreateTurnoDTO = {
        clienteId: this.clienteId(),
        servicioId: this.servicioId(),
        fecha: new Date(this.fecha()),
        hora: this.hora(),
        duracionMinutos: this.duracionMinutos(),
        precio: this.precio(),
        notas: this.notas(),
        estado: this.estado()
      };

      if (this.isEdit() && this.turnoId()) {
        // Admin-managed reschedule/edit flow
        await this.turnoService.rescheduleByAdmin(this.turnoId()!, {
          fecha: new Date(this.fecha()),
          hora: this.hora(),
          performedBy: 'admin-ui',
          reason: this.notas() || 'Reprogramación desde formulario administrativo'
        }).toPromise();
      } else {
        // Create new
        await this.turnoService.create(dto).toPromise();
      }

      this.router.navigate(['/dashboard/turnos']);
    } catch (error) {
      console.error('Error saving turno:', error);
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
