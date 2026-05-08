// Status Badge Component - Displays appointment status with colors
// Part of US-002 Turnos View

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TurnoEstado } from '../../../models/turno.model';

type CanonicalStatus = 'confirmed' | 'pending' | 'in_progress' | 'completed';
type SupportedStatus = TurnoEstado | CanonicalStatus;

export interface StatusBadgeConfig {
  estado: TurnoEstado;
  label: string;
}

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="badge" [attr.data-status]="config.estado">
      {{ config.label }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      border-radius: 99px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge[data-status='confirmado'] { background: #E8F5E9; color: #2D6A30; }
    .badge[data-status='en-proceso'] { background: #E3F2FD; color: #1565C0; }
    .badge[data-status='completado'] { background: #E8F5E9; color: #2D6A30; }
    .badge[data-status='cancelado'] { background: #FFEBEE; color: #B71C1C; }
    .badge[data-status='no-asistio'] { background: #F5F5F5; color: #616161; }
  `]
})
export class StatusBadgeComponent {
  @Input() estado: SupportedStatus = 'confirmado';

  private readonly canonicalToLegacyStatus: Record<CanonicalStatus, TurnoEstado> = {
    confirmed: 'confirmado',
    pending: 'confirmado',
    in_progress: 'en-proceso',
    completed: 'completado'
  };

  private readonly estadoConfig: Record<TurnoEstado, { estado: TurnoEstado; label: string }> = {
    'confirmado': { estado: 'confirmado', label: 'Confirmado' },
    'en-proceso': { estado: 'en-proceso', label: 'En Proceso' },
    'completado': { estado: 'completado', label: 'Completado' },
    'cancelado': { estado: 'cancelado', label: 'Cancelado' },
    'no-asistio': { estado: 'no-asistio', label: 'No Asistió' }
  };

  private isCanonicalStatus(status: SupportedStatus): status is CanonicalStatus {
    return status in this.canonicalToLegacyStatus;
  }

  get config(): StatusBadgeConfig {
    const normalizedStatus = this.isCanonicalStatus(this.estado) 
      ? this.canonicalToLegacyStatus[this.estado] 
      : this.estado as TurnoEstado;
      
    return this.estadoConfig[normalizedStatus] || this.estadoConfig['confirmado'];
  }
}
