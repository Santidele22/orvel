/**
 * Fase 0 of #1098 — the web/pwa seam, as data.
 *
 * `apps/dashboard` is one Angular application serving two different execution targets: the mobile,
 * installable PWA (public turnero + the operator surfaces people use on a phone) and the desktop
 * operator console. The split is being executed as a strangler, so the first deliverable is not a
 * second app but a *machine-checkable* statement of which surface belongs to which target.
 *
 * `classifyRoutePath` is that statement. Every pattern is explicit on purpose: there is deliberately
 * no `dashboard/**` catch-all, so a new route is either classified here with its reason or the
 * contract spec in `dashboard-targets.contract.spec.ts` fails. `null` means "not classified yet".
 *
 * The decision and its rationale live in docs/adr/0011-dashboard-web-pwa-split.md.
 */

export type DashboardTarget = 'web' | 'pwa' | 'shared';

export type DashboardTargetSurface = {
  /** Stable id, used in the inventory and in failure messages. */
  id: string;
  target: DashboardTarget;
  /** Matched against the full "segments" path of the route table. */
  pattern: RegExp;
  reason: string;
};

/**
 * Ordered most specific first: the first match wins, so `dashboard/installar` (pwa) and the auth
 * pages are resolved before any console pattern. The console surfaces are mounted twice (at
 * `/dashboard/*` and at `/*` through `canMatch`), which is why the patterns accept an optional
 * `dashboard/` prefix.
 */
export const DASHBOARD_TARGETS: readonly DashboardTargetSurface[] = [
  {
    id: 'public-turnero',
    target: 'pwa',
    pattern: /^booking(\/|$)/,
    reason:
      'Public booking and manage-booking are the customer-facing mobile product: they are the reason the app is installable, and they are not used from the desktop console.',
  },
  {
    id: 'pwa-install',
    target: 'pwa',
    pattern: /^dashboard\/installar$/,
    reason:
      'Install guidance only makes sense inside the installable app; on the desktop console it has no meaning.',
  },
  {
    id: 'auth',
    target: 'shared',
    pattern: /^(auth\/|(dashboard\/)?(login|signup)$)/,
    reason:
      'Signing in and signing up happen on both targets from the same in-app pages, mounted with and without the dashboard/ prefix.',
  },
  {
    id: 'operator-mobile-surfaces',
    target: 'shared',
    pattern: /^(dashboard\/)?(inicio|turnos)(\/|$)/,
    reason:
      'The daily operator loop is explicitly mobile-first: the agenda and the turno detail are used from a phone as much as from the desktop console, so these render in both targets.',
  },
  {
    id: 'payment-returns',
    target: 'shared',
    pattern: /^payments\/return(\/|$)/,
    reason:
      'Payment returns hand the operator back into onboarding, which can happen on a phone or on the desktop after paying.',
  },
  {
    id: 'shell-entry',
    target: 'shared',
    pattern: /^(dashboard)?$/,
    reason:
      'The shell is mounted twice - at /dashboard/* and at /* through canMatch - and it is the responsive entry both targets land on, so the entry itself is shared while its children are classified by surface.',
  },
  {
    id: 'operator-console',
    target: 'web',
    pattern: /^(dashboard\/)?(servicios|clientes|configuracion|notificaciones|perfil)(\/|$)/,
    reason:
      'Catalogue, clients, settings, notifications and profile are the desktop configurable surface; the product context declares the operator dashboard a desktop-only carve-out.',
  },
  {
    id: 'operator-billing',
    target: 'web',
    pattern: /^billing\/subscription(\/|$)/,
    reason:
      'Subscription management is a desktop console task today. If paying from the phone becomes a requirement it moves to shared, and that is a one-line change here plus the ADR note.',
  }
];

/** Route paths are compared without leading/trailing slashes. */
export function normalizeRoutePath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+$/, '');
}

/** `null` means "not classified yet": the contract spec turns that into a failing test. */
export function classifyRoutePath(path: string): DashboardTarget | null {
  const normalized = normalizeRoutePath(path);
  const match = DASHBOARD_TARGETS.find((surface) => surface.pattern.test(normalized));
  return match?.target ?? null;
}

/** Human-readable inventory, meant for ADR reviews and issue updates. */
export function describeSurface(): string {
  const heading = `dashboard targets (${DASHBOARD_TARGETS.length} surfaces)`;
  const lines = DASHBOARD_TARGETS.map(
    (surface) => `- [${surface.target}] ${surface.id} (${String(surface.pattern)}): ${surface.reason}`
  );
  return [heading, ...lines].join('\n');
}
