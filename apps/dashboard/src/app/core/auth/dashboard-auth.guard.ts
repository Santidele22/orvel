import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { buildLandingLoginRedirect, canAccessDashboardAsync, sanitizeReturnTo } from './route-protection';

async function resolveDashboardAccessRedirect(
  currentUrl: string | undefined
): Promise<true | ReturnType<Router['parseUrl']>> {
  const access = await canAccessDashboardAsync();
  if (access.allowed) {
    return true;
  }

  const router = inject(Router);
  const safeReturnTo = sanitizeReturnTo(currentUrl ?? '/dashboard');
  return router.parseUrl(buildLandingLoginRedirect(safeReturnTo));
}

export const dashboardAuthGuard: CanActivateFn = async (_route, state) => {
  return resolveDashboardAccessRedirect(state.url);
};

export const dashboardAuthChildGuard: CanActivateChildFn = async (_route, state) => {
  return resolveDashboardAccessRedirect(state.url);
};
