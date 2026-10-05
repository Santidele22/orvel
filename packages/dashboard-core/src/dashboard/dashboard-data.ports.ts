import { InjectionToken, type Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type { BusinessSettings } from '../models/business.model';
import type { Cliente } from '../models/cliente.model';
import type { Servicio } from '../models/servicio.model';

/**
 * Narrow read ports the dashboard metrics need from feature data-access
 * services.
 *
 * `core/dashboard` injects these tokens instead of importing the feature
 * classes, so core never depends on a feature. The composition root
 * (`dashboard-shell.routes.ts`) binds each token to the feature implementation.
 */
export interface DashboardBusinessSource {
  readonly settings: Signal<BusinessSettings | null>;
}

export interface DashboardClienteSource {
  readonly items: Signal<Cliente[]>;
  getAll(): Observable<Cliente[]>;
}

export interface DashboardServicioSource {
  readonly items: Signal<Servicio[]>;
  getAll(): Observable<Servicio[]>;
}

export const DASHBOARD_BUSINESS_SOURCE = new InjectionToken<DashboardBusinessSource>(
  'DASHBOARD_BUSINESS_SOURCE'
);
export const DASHBOARD_CLIENTE_SOURCE = new InjectionToken<DashboardClienteSource>(
  'DASHBOARD_CLIENTE_SOURCE'
);
export const DASHBOARD_SERVICIO_SOURCE = new InjectionToken<DashboardServicioSource>(
  'DASHBOARD_SERVICIO_SOURCE'
);
