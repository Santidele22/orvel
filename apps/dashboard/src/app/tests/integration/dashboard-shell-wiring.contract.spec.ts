// Importing the shell routes pulls the Router stack, which needs the JIT compiler
// under vitest (`@angular/compiler` is not linked for these partially compiled libs).
import '@angular/compiler';
// `?raw` keeps this spec free of node typings (tsconfig.spec.json does not include them).
import shellSource from '../../shared/dashboard-shell/dashboard-shell.component.ts?raw';
import shellTemplate from '../../shared/dashboard-shell/dashboard-shell.component.html?raw';
import { describe, expect, it } from 'vitest';

import { dashboardShellRoutes } from '../../dashboard-shell.routes';
import {
  DASHBOARD_BUSINESS_SOURCE,
  DASHBOARD_CLIENTE_SOURCE,
  DASHBOARD_SERVICIO_SOURCE
} from '@orvel/dashboard-core/dashboard/dashboard-data.ports';
import {
  DASHBOARD_ONBOARDING_PAYLOAD,
  DASHBOARD_TOUR,
  DASHBOARD_TOUR_HELP_COMPONENT,
  DASHBOARD_TOUR_INVITE_COMPONENT
} from '@orvel/dashboard-core/shell/dashboard-chrome.ports';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { OperatorTourHelpButtonComponent } from '../../features/operator-tour/operator-tour-help-button.component';
import { OperatorTourInviteComponent } from '../../features/operator-tour/operator-tour-invite.component';
import { OperatorTourService } from '../../features/operator-tour/operator-tour.service';
import { readOnboardingState } from '../../features/onboarding/data-access/onboarding-storage';

/**
 * The dashboard shell must not import features, so `core` owns the contracts it
 * consumes and the composition root binds them to the feature implementations.
 *
 * Every token has an inert default. That means removing a binding does not
 * break the build or any other test: the shell would silently render without
 * the operator tour and without the onboarding payload. This contract pins the
 * bindings structurally (against the real exported routes array, not against
 * the file text) so that a silent degradation becomes a red test.
 */

const shellRoute = dashboardShellRoutes[0];
const providers = (shellRoute.providers ?? []) as unknown as Array<Record<string, unknown>>;

function bindingFor(token: unknown): Record<string, unknown> | undefined {
  return providers.find((provider) => provider['provide'] === token);
}

describe('dashboard shell wiring contract', () => {
  it('binds the shell chrome port to the operator tour service', () => {
    expect(bindingFor(DASHBOARD_TOUR)).toMatchObject({ useExisting: OperatorTourService });
  });

  it('binds the tour help component port to the feature component', () => {
    expect(bindingFor(DASHBOARD_TOUR_HELP_COMPONENT)).toMatchObject({
      useValue: OperatorTourHelpButtonComponent
    });
  });

  it('binds the tour invite port to the feature component', () => {
    expect(bindingFor(DASHBOARD_TOUR_INVITE_COMPONENT)).toMatchObject({
      useValue: OperatorTourInviteComponent
    });
  });

  it('never opens the tour by itself: the invite asks first', () => {
    // The old auto-start polled `home-metrics` and ran the tour on the home
    // route only, so a new operator landing on the agenda never saw it (#1136).
    expect(shellSource).not.toContain('scheduleAutoTour');
    expect(shellSource).not.toContain('home-metrics');
    expect(shellSource).not.toMatch(/this\.tour\?\.run\(\)/);
    expect(shellTemplate).toContain('tourInviteComponent');
  });

  it('binds the onboarding payload port to the onboarding reader', () => {
    expect(bindingFor(DASHBOARD_ONBOARDING_PAYLOAD)).toMatchObject({
      useValue: readOnboardingState
    });
  });

  it('binds the dashboard read ports to the feature data-access services', () => {
    expect(bindingFor(DASHBOARD_CLIENTE_SOURCE)).toMatchObject({ useExisting: ClienteService });
    expect(bindingFor(DASHBOARD_SERVICIO_SOURCE)).toMatchObject({ useExisting: ServicioService });
    expect(bindingFor(DASHBOARD_BUSINESS_SOURCE)).toMatchObject({ useExisting: BusinessService });
  });

  it('keeps the shell free of feature imports (shared must not depend on features)', () => {
    expect(shellSource).not.toMatch(/from\s+['"][^'"]*features\//);
  });
});
