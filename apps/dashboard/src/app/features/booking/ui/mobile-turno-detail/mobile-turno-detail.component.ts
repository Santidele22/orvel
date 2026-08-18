import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { createIsMobileSignal } from '../../../../core/shell/is-mobile/is-mobile';
import { TurnoService } from '../../data-access/turno.facade';
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
  private readonly turnoService = inject(TurnoService);
  private readonly isMobileSignal = createIsMobileSignal();
  readonly isMobile = this.isMobileSignal.isMobile;

  readonly turno = computed<TurnoWithRelations | undefined>(() => {
    const fromState = this.router.getCurrentNavigation()?.extras.state?.['turno'] as
      | TurnoWithRelations
      | undefined;
    if (fromState) return fromState;
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return undefined;
    // Fallback: items() returns Turno[]. Cast to TurnoWithRelations — runtime may lack optional
    // fields (clienteNombre, servicioNombre, cliente, servicio). The template uses optional chaining
    // so missing fields render gracefully. Primary path (router state) is always populated.
    return this.turnoService.items().find((t) => t.id === id) as TurnoWithRelations | undefined;
  });

  readonly telefono = computed(() => this.turno()?.cliente?.telefono ?? null);
  readonly isEmpty = computed(() => this.turno() === undefined);

  back(): void {
    this.router.navigate(['/dashboard/turnos']);
  }
}
