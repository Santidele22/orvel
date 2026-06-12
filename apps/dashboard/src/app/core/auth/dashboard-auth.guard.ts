import { CanActivateChildFn, CanActivateFn } from '@angular/router';
import { buildLandingLoginRedirect, canAccessDashboardAsync, sanitizeReturnTo } from './route-protection';

async function resolveDashboardAccessRedirect(
  currentUrl: string | undefined
): Promise<true | false> {
  const safeReturnTo = sanitizeReturnTo(currentUrl ?? '/dashboard');
  const access = await canAccessDashboardAsync(Date.now(), safeReturnTo);
  if (access.allowed) {
    return true;
  }

  const redirectTo = access.redirectTo ?? buildLandingLoginRedirect(safeReturnTo);

  if (typeof window !== 'undefined') {
    window.location.assign(redirectTo);
  }

  return false;
}

export const dashboardAuthGuard: CanActivateFn = async (_route, state) => {
  return resolveDashboardAccessRedirect(state.url);
};

export const dashboardAuthChildGuard: CanActivateChildFn = async (_route, state) => {
  return resolveDashboardAccessRedirect(state.url);
};
