type DashboardSession = {
  access_token: string;
  refresh_token: string;
};

export type HandoffInvoke = (
  functionName: 'create-session-handoff',
  options: {
    method: 'POST';
    headers: { Authorization: string };
    body: { refresh_token: string };
  }
) => Promise<{ data?: { handoff?: unknown } | null; error?: unknown }>;

const DEFAULT_DASHBOARD_ORIGIN = 'https://dashboard.orvel.pro';
const DEFAULT_DASHBOARD_PATH = '/dashboard/inicio';

function resolveDashboardOrigin(raw: string | null | undefined): string {
  try {
    return new URL(raw?.trim() || DEFAULT_DASHBOARD_ORIGIN).origin;
  } catch {
    return DEFAULT_DASHBOARD_ORIGIN;
  }
}

function resolveDashboardTarget(dashboardOrigin: string, returnTo: string | null | undefined): URL {
  const origin = resolveDashboardOrigin(dashboardOrigin);
  const fallback = new URL(DEFAULT_DASHBOARD_PATH, origin);
  if (!returnTo) return fallback;

  try {
    const candidate = new URL(returnTo, origin);
    if (candidate.origin !== origin) return fallback;
    if (!candidate.pathname.startsWith('/dashboard')) return fallback;
    candidate.hash = '';
    return candidate;
  } catch {
    return fallback;
  }
}

export function createDashboardSessionHandoffInvoke(input: {
  supabaseUrl?: string | null;
  fetch?: typeof fetch;
}): HandoffInvoke {
  return async (_functionName, options) => {
    const supabaseUrl = input.supabaseUrl?.trim();
    if (!supabaseUrl) {
      throw new Error('Supabase URL is required to create a dashboard session handoff.');
    }

    const base = new URL(supabaseUrl);
    const response = await (input.fetch ?? fetch)(
      new URL('/functions/v1/create-session-handoff', base).toString(),
      {
        method: options.method,
        headers: {
          ...options.headers,
          'content-type': 'application/json'
        },
        body: JSON.stringify(options.body)
      }
    );

    const data = await response.json().catch(() => null);
    return response.ok ? { data, error: null } : { data, error: data ?? response.statusText };
  };
}

export async function createDashboardSessionHandoff(input: {
  dashboardOrigin: string;
  returnTo?: string | null;
  session: DashboardSession;
  invoke: HandoffInvoke;
}): Promise<string> {
  const { data, error } = await input.invoke('create-session-handoff', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.session.access_token}`
    },
    body: {
      refresh_token: input.session.refresh_token
    }
  });

  if (error) {
    throw new Error('Could not create dashboard session handoff.');
  }

  const handoff = data?.handoff;
  if (typeof handoff !== 'string' || handoff.trim().length === 0) {
    throw new Error('Dashboard session handoff did not return an opaque handoff value.');
  }

  const target = resolveDashboardTarget(input.dashboardOrigin, input.returnTo);
  target.searchParams.set('handoff', handoff);
  return target.toString();
}
