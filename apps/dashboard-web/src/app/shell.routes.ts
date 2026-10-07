import { Routes } from '@angular/router';
import { dashboardAuthChildGuard, dashboardAuthGuard } from '@orvel/dashboard-core/auth/dashboard-auth.guard';
import { classifyRoutePath } from '@orvel/dashboard-core/platform/dashboard-targets';
import {
  dashboardShellChildren,
  dashboardShellProviders
} from '../../../dashboard/src/app/dashboard-shell.routes';

/**
 * Fase 3 of #1098 — the shell the web target mounts.
 *
 * The children come from the PWA's own shell table through the transitional alias, filtered by the
 * machine-checkable seam: a child classified `pwa` never reaches this target. The providers are
 * imported, not copied, so the two targets cannot drift while the strangler runs.
 *
 * `dashboardWebShellChildren` dropping a route silently is a bug the contract spec catches: it
 * asserts that nothing classified `web` or `shared` is missing from this target.
 */
export const dashboardWebShellChildren: Routes = dashboardShellChildren.filter(
  (route) => classifyRoutePath(route.path ?? '') !== 'pwa'
);

export const dashboardWebShellRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../../../dashboard/src/app/shared/dashboard-shell/dashboard-shell.component').then(
        (m) => m.DashboardShellComponent
      ),
    canActivate: [dashboardAuthGuard],
    canActivateChild: [dashboardAuthChildGuard],
    providers: dashboardShellProviders,
    children: dashboardWebShellChildren
  }
];
