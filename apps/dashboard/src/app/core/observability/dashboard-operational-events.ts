export const DASHBOARD_OPERATIONAL_EVENT = 'orvel.dashboard.operational';

export type DashboardOperationalSource = 'branch-context' | 'notifications' | 'calendar';

export type DashboardOperationalEvent = {
  event: 'get_dashboard_branches.rpc_failed';
  feature: 'dashboard-context';
  source: DashboardOperationalSource;
  rpc: 'get_dashboard_branches';
  errorCode: string;
  errorCategory: 'RPC_SCHEMA_CACHE_MISS' | 'POSTGREST_RPC_ERROR' | 'AUTH_OR_SESSION_ERROR' | 'UNKNOWN_RPC_ERROR';
};

export type DashboardOperationalSubscriber = (event: DashboardOperationalEvent) => void;

const subscribers = new Set<DashboardOperationalSubscriber>();

function sanitizeCode(value: unknown): string {
  if (typeof value !== 'string') return 'UNKNOWN';

  const firstToken = value.trim().split(/[\s;,]+/, 1)[0] ?? '';
  const sanitized = firstToken.toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 64);
  return sanitized || 'UNKNOWN';
}

function safeMessageCategory(error: unknown, code: string): DashboardOperationalEvent['errorCategory'] {
  const message = typeof (error as { message?: unknown } | null)?.message === 'string'
    ? (error as { message: string }).message.toLowerCase()
    : '';

  if (code === 'PGRST202' || /could not find the function|schema cache|get_dashboard_branches/.test(message)) {
    return 'RPC_SCHEMA_CACHE_MISS';
  }

  if (code === '401' || code === '403' || code === 'AUTH_REQUIRED' || code.includes('JWT')) {
    return 'AUTH_OR_SESSION_ERROR';
  }

  if (code.startsWith('PGRST')) return 'POSTGREST_RPC_ERROR';

  return 'UNKNOWN_RPC_ERROR';
}

export function subscribeDashboardOperationalEvents(subscriber: DashboardOperationalSubscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function clearDashboardOperationalEventSubscribersForTests(): void {
  subscribers.clear();
}

export function emitDashboardBranchRpcFailure(input: {
  source: DashboardOperationalSource;
  error?: unknown;
}): DashboardOperationalEvent {
  const errorCode = sanitizeCode((input.error as { code?: unknown } | null)?.code);
  const event: DashboardOperationalEvent = {
    event: 'get_dashboard_branches.rpc_failed',
    feature: 'dashboard-context',
    source: input.source,
    rpc: 'get_dashboard_branches',
    errorCode,
    errorCategory: safeMessageCategory(input.error, errorCode),
  };

  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // Observability hooks must never break dashboard UX.
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent<DashboardOperationalEvent>(DASHBOARD_OPERATIONAL_EVENT, { detail: event }));
  }

  if (subscribers.size === 0) {
    console.warn('[DashboardOperational] Sanitized operational event emitted.', event);
  }

  return event;
}
