import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  SelectedBusinessType,
  createMockSessionFromLogin,
  sanitizeSelectedBusinessTypes
} from '../../core/auth/mock-login-business-types';
import { TURNERA_SESSION_KEY } from '../../core/auth/session-contract';
import {
  REQUIRED_RUBROS,
  RequiredRubro,
  canContinueOnboarding,
  toggleSelectedRubro
} from '../../core/onboarding/onboarding-rubros';
import { sanitizeSelectedTemplateIds } from '../../core/onboarding/onboarding-templates';

@Component({
  selector: 'app-onboarding-business-step-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './onboarding-business-step.page.html'
})
export class OnboardingBusinessStepPage {
  protected readonly rubroOptions = [
    { slug: 'peluqueria' as const, label: 'Peluquería' },
    { slug: 'unas' as const, label: 'Uñas' },
    { slug: 'barberia' as const, label: 'Barbería' },
    { slug: 'pestanas' as const, label: 'Pestañas' },
    { slug: 'spa' as const, label: 'Spa' }
  ];

  protected selectedRubros: RequiredRubro[] = [];
  protected selectedTemplateIds: string[] = [];

  private readonly router = inject(Router);

  protected isRubroSelected(rubro: RequiredRubro): boolean {
    return this.selectedRubros.includes(rubro);
  }

  protected onToggleRubro(rubro: RequiredRubro): void {
    this.selectedRubros = toggleSelectedRubro(this.selectedRubros, rubro);
  }

  protected canContinue(): boolean {
    return canContinueOnboarding(this.selectedRubros);
  }

  protected continue(): void {
    if (!this.canContinue()) {
      return;
    }

    const selectedBusinessTypes = this.mapRubrosToBusinessTypes(this.selectedRubros);
    const safeSelectedTemplateIds = sanitizeSelectedTemplateIds(this.selectedTemplateIds);

    const session = createMockSessionFromLogin({
      email: 'demo@turnea.app',
      selectedBusinessTypes,
      selectedRubros: this.selectedRubros,
      selectedTemplateIds: safeSelectedTemplateIds
    });

    localStorage.setItem(TURNERA_SESSION_KEY, JSON.stringify(session));
    this.router.navigateByUrl('/dashboard/turnos');
  }

  private mapRubrosToBusinessTypes(selectedRubros: RequiredRubro[]): SelectedBusinessType[] {
    const map: Record<RequiredRubro, SelectedBusinessType> = {
      peluqueria: 'zen',
      unas: 'zen',
      barberia: 'zen',
      pestanas: 'zen',
      spa: 'zen'
    };

    const rawSelectedBusinessTypes = selectedRubros
      .filter((rubro) => REQUIRED_RUBROS.includes(rubro))
      .map((rubro) => map[rubro]);

    return sanitizeSelectedBusinessTypes(rawSelectedBusinessTypes);
  }
}
