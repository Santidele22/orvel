/**
 * Fase 4 of #1098 / ADR 0012 — which execution target this app is, as declared by the app.
 *
 * The shared core serves two apps (`apps/dashboard` = pwa, `apps/dashboard-web` = web) and cannot
 * import either one's build identity, exactly like it cannot import their generated environment.
 * Both apps already hand the core their runtime env from the bootstrap
 * (`src/app/runtime/configure-dashboard-environment.ts`); they declare their target in the same
 * place, before `app/app.config` is evaluated.
 *
 * The default is `pwa` on purpose: that target is the one deployed today, and defaulting to it
 * keeps every existing caller (and every test that does not care about the seam) honest instead of
 * silently claiming the console's key.
 */

import { resolveAuthStorageKey, type OrvelAuthStorageTarget } from '@orvel/config';

export type DashboardAuthTarget = OrvelAuthStorageTarget;

let configuredTarget: DashboardAuthTarget = 'pwa';

/** Declare which execution target this app is. Called once from the app's bootstrap. */
export function configureDashboardAuthTarget(target: DashboardAuthTarget): void {
  configuredTarget = target;
}

/** The target declared by the app; `pwa` until an app says otherwise. */
export function dashboardAuthTarget(): DashboardAuthTarget {
  return configuredTarget;
}

/** The Web Storage key for the session of the declared target. */
export function dashboardAuthStorageKey(): string {
  return resolveAuthStorageKey(configuredTarget);
}

export function resetDashboardAuthTargetForTests(): void {
  configuredTarget = 'pwa';
}
