import { Component, EventEmitter, inject, input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isDepositUnpaid } from '@orvel/booking/application';
import type { TurnoWithRelations } from '../../models/turno.model';
import { DashboardService } from '../../../../core/dashboard/dashboard.service';
import { AuthService } from '../../../../services/auth.service';

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
  protected readonly isDepositUnpaid = isDepositUnpaid;
  private readonly dashboardService = inject(DashboardService);
  private readonly authService = inject(AuthService);
  protected readonly confirmingDepositId = signal<string | null>(null);
  protected readonly rejectingDepositId = signal<string | null>(null);

  /** Emit when the user taps the card body — parent navigates to detail. */
  @Output() cardTapped = new EventEmitter<TurnoWithRelations>();

  protected async confirmDepositReceived(event: Event): Promise<void> {
    event.stopPropagation();
    const bookingId = this.turno().id;
    const userId = this.authService.user()?.id;
    if (!userId || this.confirmingDepositId() || this.rejectingDepositId()) return;
    this.confirmingDepositId.set(bookingId);
    try {
      const ok = await this.dashboardService.confirmDepositReceived(bookingId, userId);
      if (ok) window.dispatchEvent(new CustomEvent('operator.agenda.sync'));
    } finally {
      this.confirmingDepositId.set(null);
    }
  }

  protected async rejectBookingDepositUnseen(event: Event): Promise<void> {
    event.stopPropagation();
    const bookingId = this.turno().id;
    const userId = this.authService.user()?.id;
    if (!userId || this.confirmingDepositId() || this.rejectingDepositId()) return;
    this.rejectingDepositId.set(bookingId);
    try {
      const ok = await this.dashboardService.rejectBookingDepositUnseen(bookingId, userId);
      if (ok) window.dispatchEvent(new CustomEvent('operator.agenda.sync'));
    } finally {
      this.rejectingDepositId.set(null);
    }
  }
}
