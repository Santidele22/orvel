import { CanActivateChildFn, CanActivateFn } from '@angular/router';
import { browserEnvironment } from '../platform/browser-environment.adapter';
import { buildDashboardSignInRedirect, canAccessDashboardAsync, sanitizeReturnTo } from './route-protection';

async function resolveDashboardAccessRedirect(
  currentUrl: string | undefined
): Promise<true | false> {
  const safeReturnTo = sanitizeReturnTo(currentUrl ?? '/dashboard');
  const access = await canAccessDashboardAsync(Date.now(), safeReturnTo);
  if (access.allowed) {
    return true;
  }

  const fallbackRedirect = buildDashboardSignInRedirect(safeReturnTo);
  const landingRedirect = access.redirectTo || fallbackRedirect;

  browserEnvironment().navigateTo(landingRedirect);

  return false;
}

export const dashboardAuthGuard: CanActivateFn = async (_route, state) => {
  return resolveDashboardAccessRedirect(state.url);
};

export const dashboardAuthChildGuard: CanActivateChildFn = async (_route, state) => {
  return resolveDashboardAccessRedirect(state.url);
};
