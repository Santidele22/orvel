import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { createMockSessionFromLogin } from '../../../core/auth/mock-login-business-types';
import { TURNERA_SESSION_KEY } from '../../../core/auth/session-contract';
import { getRuntimeReferenceCatalogSnapshot } from '../../../core/catalog/reference-catalog.gateway';
import {
  RequiredRubro,
  canContinueOnboarding,
  toggleSelectedRubro
} from '../data-access/onboarding-rubros';
import { sanitizeSelectedTemplateIds } from '../data-access/onboarding-templates';

const REFERENCE_CATALOG = getRuntimeReferenceCatalogSnapshot();

// Catalog-backed rubros: peluqueria/Peluquería, unas/Uñas, barberia/Barbería, spa/Spa,
// pestanas/Pestañas, cejas/Cejas, masajes/Masajes, otro/Otro.
const RUBRO_OPTIONS = REFERENCE_CATALOG.businessTypes.map(({ code, label }) => ({
  slug: code.toLowerCase() as RequiredRubro,
  label
}));

function canCreateMockOnboardingSession(): boolean {
  if (typeof window === 'undefined') return true;
  return ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
}

@Component({
  selector: 'app-onboarding-business-step-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './onboarding-business-step.page.html'
})
export class OnboardingBusinessStepPage {
  protected readonly rubroOptions = RUBRO_OPTIONS;

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

    const selectedBusinessTypes = this.selectedRubros;
    const safeSelectedTemplateIds = sanitizeSelectedTemplateIds(this.selectedTemplateIds);

    if (!canCreateMockOnboardingSession()) {
      this.router.navigateByUrl('/auth');
      return;
    }

    const session = createMockSessionFromLogin({
      email: 'demo@turnea.app',
      selectedBusinessTypes,
      selectedRubros: this.selectedRubros,
      selectedTemplateIds: safeSelectedTemplateIds
    });

    localStorage.setItem(TURNERA_SESSION_KEY, JSON.stringify(session));
    this.router.navigateByUrl('/dashboard/turnos');
  }
}
