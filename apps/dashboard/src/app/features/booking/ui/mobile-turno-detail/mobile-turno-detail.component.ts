import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import type { BookingQueries } from '@orvel/booking/application';
import { BOOKING_QUERIES } from '@orvel/booking/infrastructure';
import { createIsMobileSignal } from '../../../../core/shell/is-mobile/is-mobile';
import { getBranchContextService } from '../../../../core/branches/branch-context.service';
import type { TurnoWithRelations } from '../../models/turno.model';

@Component({
  selector: 'app-mobile-turno-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mobile-turno-detail.component.html',
  styleUrl: './mobile-turno-detail.component.scss',
})
export class MobileTurnoDetailComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly bookingQueries = inject<BookingQueries>(BOOKING_QUERIES);
  private readonly branchContext = getBranchContextService();
  private readonly isMobileSignal = createIsMobileSignal();
  readonly isMobile = this.isMobileSignal.isMobile;
  private readonly fallbackTurno = signal<TurnoWithRelations | undefined>(undefined);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    const branchId = this.branchContext.getActiveBranchId();
    if (!id || !branchId) return;
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const to = new Date();
    to.setDate(to.getDate() + 30);
    void this.bookingQueries.listBookingsByBranch(branchId, { from, to }).then((rows) => {
      const found = rows.find((row) => row.id === id);
      if (!found) return;
      this.fallbackTurno.set({
        ...found,
        clienteId: found.clienteId ?? '',
        servicioId: found.servicioId ?? '',
        precio: found.precio ?? 0,
        clienteNombre: '',
        servicioNombre: ''
      });
    });
  }

  readonly turno = computed<TurnoWithRelations | undefined>(() => {
    const fromState = this.router.getCurrentNavigation()?.extras.state?.['turno'] as
      | TurnoWithRelations
      | undefined;
    if (fromState) return fromState;
    // Fallback: BookingQueries rows may lack optional relation fields. The template uses
    // optional chaining so missing fields render gracefully. Primary path is router state.
    return this.fallbackTurno();
  });

  readonly telefono = computed(() => this.turno()?.cliente?.telefono ?? null);
  readonly isEmpty = computed(() => this.turno() === undefined);

  back(): void {
    this.router.navigate(['/dashboard/turnos']);
  }
}
