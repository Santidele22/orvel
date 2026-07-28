import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TurnoWithRelations } from '../../models/turno.model';

@Component({
  selector: 'app-mobile-appointment-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mobile-appointment-card.component.html',
  styleUrl: './mobile-appointment-card.component.scss',
})
export class MobileAppointmentCardComponent {
  /** The appointment data (TurnoWithRelations) to render in this compact card. */
  readonly turno = input.required<TurnoWithRelations>();
}
