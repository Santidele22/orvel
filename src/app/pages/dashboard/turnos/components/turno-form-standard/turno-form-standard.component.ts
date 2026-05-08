import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Cliente } from '../../../../../models/cliente.model';
import { Servicio } from '../../../../../models/servicio.model';
import { TurnoEstado } from '../../../../../models/turno.model';
import { DASHBOARD_STRUCTURAL_TOKENS } from '../../../../../core/theming/dashboard-structural.tokens';

@Component({
  selector: 'app-turno-form-standard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section [class]="structure.pageRoot + ' bg-bg text-text-primary'" data-testid="turno-form-responsive-container">
      <div [class]="'flex-1 overflow-y-auto h-full no-scrollbar ' + structure.containerPadding">
        <div class="grid grid-cols-12" [class]="structure.containerGap">
          <main class="col-span-12 lg:col-span-8" data-layout-section="main_agenda">
            <div class="flex flex-col gap-zen-xxl">
              <!-- Header -->
              <header class="flex flex-col gap-zen-sm">
                <a routerLink="/dashboard/turnos" class="flex items-center gap-zen-xs text-sm font-medium text-primary hover:underline transition-all">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 18 9 12 15 6"></polyline>
                  </svg>
                  Volver
                </a>
                <h1 class="text-3xl font-black tracking-zen-tight text-text-primary uppercase" [style.fontFamily]="'var(--heading-font)'">
                  {{ isEdit() ? 'Actualizar' : 'Agendar' }} Turno
                </h1>
              </header>

              <!-- Loading -->
              @if (loading()) {
                <div class="flex flex-col items-center justify-center py-zen-section gap-zen-lg">
                  <div class="w-zen-control-md h-zen-control-md border-zen-icon-sm border-primary border-t-transparent rounded-full animate-spin"></div>
                  <p class="text-sm font-medium opacity-60">Sincronizando agenda...</p>
                </div>
              } @else {
                <form (ngSubmit)="save.emit()" class="flex flex-col gap-zen-xl">
                  <!-- Error Message -->
                  @if (error()) {
                    <div class="flex items-center gap-zen-md p-zen-lg rounded-zen-xl bg-primary/5 border border-primary/20 text-primary text-sm font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      {{ error() }}
                    </div>
                  }

                  <div class="grid grid-cols-1 gap-zen-xl">
                    <!-- Cliente & Servicio -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-zen-xl">
                      <div class="flex flex-col gap-zen-sm">
                        <label class="text-xs font-bold uppercase tracking-zen-wide text-text-secondary">Cliente *</label>
                        <select 
                          [ngModel]="clienteId()" 
                          (ngModelChange)="clienteIdChange.emit($event)"
                          name="cliente"
                          required
                          class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all">
                          <option value="">Seleccionar cliente</option>
                          @for (cliente of clientes(); track cliente.id) {
                            <option [value]="cliente.id">{{ cliente.nombre }} {{ cliente.apellido }}</option>
                          }
                        </select>
                      </div>

                      <div class="flex flex-col gap-zen-sm">
                        <label class="text-xs font-bold uppercase tracking-zen-wide text-text-secondary">Servicio *</label>
                        <select 
                          [ngModel]="servicioId()" 
                          (ngModelChange)="servicioIdChange.emit($event)"
                          name="servicio"
                          required
                          class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all">
                          <option value="">Seleccionar servicio</option>
                          @for (servicio of servicios(); track servicio.id) {
                            <option [value]="servicio.id">
                              {{ servicio.nombre }} ({{ formatCurrency(servicio.precio) }})
                            </option>
                          }
                        </select>
                      </div>
                    </div>

                    <!-- Fecha y Hora -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-zen-xl rounded-zen-card bg-text-primary/5 p-zen-xl border border-text-primary/5">
                      <div class="flex flex-col gap-zen-sm">
                        <label class="text-xs font-bold uppercase tracking-zen-wide text-text-secondary">Fecha *</label>
                        <input 
                          type="date" 
                          [ngModel]="fecha()" 
                          (ngModelChange)="fechaChange.emit($event)"
                          name="fecha"
                          required
                          class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all" />
                        @if (isPastDate()) {
                          <p class="text-xs text-primary font-bold italic">No se permiten fechas pasadas</p>
                        }
                      </div>

                      <div class="flex flex-col gap-zen-sm">
                        <label class="text-xs font-bold uppercase tracking-zen-wide text-text-secondary">Hora *</label>
                        <select 
                          [ngModel]="hora()" 
                          (ngModelChange)="horaChange.emit($event)"
                          name="hora"
                          required
                          class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all">
                          <option value="">Horario disponible</option>
                          @for (horario of disponibles(); track horario) {
                            <option [value]="horario">{{ getHorarioLabel(horario) }}</option>
                          }
                        </select>
                        @if (conflictError()) {
                          <p class="text-xs text-primary font-bold" data-testid="turno-slot-blocked-feedback">{{ conflictError() }}</p>
                        }
                      </div>
                    </div>

                    <!-- Precios y Notas -->
                    <div class="flex flex-col gap-zen-xl">
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-zen-xl">
                        <div class="flex flex-col gap-zen-sm">
                          <label class="text-sm font-semibold opacity-80">Duración (min)</label>
                          <input 
                            type="number" 
                            [ngModel]="duracionMinutos()" 
                            (ngModelChange)="duracionMinutosChange.emit($event)"
                            name="duracion"
                            min="15"
                            step="15"
                            class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all" />
                        </div>
                        <div class="flex flex-col gap-zen-sm">
                          <label class="text-xs font-bold uppercase tracking-zen-wide text-text-secondary">Precio sugerido ($)</label>
                          <input 
                            type="number" 
                            [ngModel]="precio()" 
                            (ngModelChange)="precioChange.emit($event)"
                            name="precio"
                            min="0"
                            step="100"
                            class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all" />
                        </div>
                      </div>

                      @if (isEdit()) {
                        <div class="flex flex-col gap-zen-sm">
                          <label class="text-xs font-bold uppercase tracking-zen-wide text-text-secondary">Estado actual del turno</label>
                          <select 
                            [ngModel]="estado()" 
                            (ngModelChange)="estadoChange.emit($event)"
                            name="estado"
                            class="h-zen-control-lg w-full rounded-zen-xl border border-text-primary/10 bg-surface px-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all">
                            <option value="confirmado">Confirmado</option>
                            <option value="en-proceso">En Proceso</option>
                            <option value="completado">Completado</option>
                            <option value="cancelado">Cancelado</option>
                            <option value="no-asistio">No Asistió</option>
                          </select>
                        </div>
                      }

                      <div class="space-y-(--zen-space-sm)">
                        <label class="text-sm font-semibold opacity-80">Observaciones</label>
                        <textarea 
                          [ngModel]="notas()" 
                          (ngModelChange)="notasChange.emit($event)"
                          name="notas"
                          rows="4"
                          placeholder="Agregar detalles adicionales aquí..."
                          class="w-full rounded-zen-xl border border-text-primary/10 bg-surface p-zen-lg text-sm focus:outline-none focus:ring-zen-icon-sm focus:ring-primary/20 transition-all resize-none"></textarea>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex items-center justify-end gap-zen-md pt-zen-xl border-t border-text-primary/5">
                    <a routerLink="/dashboard/turnos" class="h-zen-control-lg flex items-center px-zen-xl text-sm font-bold opacity-60 hover:opacity-100 transition-opacity uppercase tracking-zen-wide">Cancelar</a>
                    <button 
                      type="submit" 
                      data-testid="turno-admin-reschedule-submit"
                      class="h-zen-control-lg px-zen-xxl rounded-zen-xl bg-primary text-white font-black text-xs uppercase tracking-zen-wide shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
                      [disabled]="saving() || conflictError() || !clienteId() || !servicioId()">
                      @if (saving()) {
                        <div class="flex items-center gap-zen-sm">
                          <div class="w-zen-icon-md h-zen-icon-md border-zen-icon-sm border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Guardando...</span>
                        </div>
                      } @else {
                        {{ isEdit() ? 'Actualizar' : 'Confirmar' }} Turno
                      }
                    </button>
                  </div>
                </form>
              }
            </div>
          </main>

          <aside class="col-span-12 lg:col-span-4" data-layout-section="right_panel">
            <div class="sticky top-zen-xl flex flex-col gap-zen-xl">
              <div class="rounded-zen-card bg-text-primary/5 border border-text-primary/5 p-zen-xxl backdrop-blur-sm">
                <h3 class="text-xs font-black uppercase tracking-zen-wide text-primary">Información de Gestión</h3>
                <div class="mt-zen-xl flex flex-col gap-zen-lg">
                  <p class="text-sm leading-relaxed opacity-70">
                    Asegúrese de que el cliente esté correctamente seleccionado antes de confirmar la reserva.
                  </p>
                  @if (!isEdit()) {
                    <div class="pt-zen-lg border-t border-text-primary/10">
                      <span class="text-2xl font-black text-text-primary tracking-zen-tight">{{ disponibles().length }}</span>
                      <p class="text-xs font-bold uppercase tracking-zen-wide opacity-50">Horarios disponibles para la fecha seleccionada</p>
                    </div>
                  }
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  `
})
export class TurnoFormStandardComponent {
  // Inputs
  loading = input<boolean>(false);
  saving = input<boolean>(false);
  isEdit = input<boolean>(false);
  clientes = input<Cliente[]>([]);
  servicios = input<Servicio[]>([]);
  disponibles = input<string[]>([]);
  clienteId = input<string>('');
  servicioId = input<string>('');
  fecha = input<string>('');
  hora = input<string>('');
  duracionMinutos = input<number>(30);
  precio = input<number>(0);
  notas = input<string>('');
  estado = input<TurnoEstado>('confirmado');
  conflictError = input<string | null>(null);
  isPastDate = input<boolean>(false);
  error = input<string | null>(null);

  // Outputs
  save = output<void>();
  clienteIdChange = output<string>();
  servicioIdChange = output<string>();
  fechaChange = output<string>();
  horaChange = output<string>();
  duracionMinutosChange = output<number>();
  precioChange = output<number>();
  notasChange = output<string>();
  estadoChange = output<TurnoEstado>();

  protected readonly structure = DASHBOARD_STRUCTURAL_TOKENS;

  getHorarioLabel(hora: string): string {
    const [h, m] = hora.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  formatCurrency(precio: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(precio);
  }
}
