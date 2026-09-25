import { toBookingShareHead } from '../lib/booking-share-head';
import { isTenantBookingSharePath } from '../lib/booking-share-match';
import { rewriteBookingShareHead } from '../lib/booking-share-rewriter';

const CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300';
const SHELL_PATH = '/dashboard/index.html';
const FALLBACK_SHELL =
  '<!doctype html><html lang="es"><head><title>Orvel</title></head><body><app-root></app-root></body></html>';

function htmlResponse(html: string, cacheShare: boolean): Response {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
  if (cacheShare) {
    headers.set('cache-control', CACHE_CONTROL);
  }
  return new Response(html, { status: 200, headers });
}

function tenantSlug(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[1] ?? '';
}

function previewHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
  };
}

async function fetchSpaShell(request: Request): Promise<string> {
  const response = await fetch(new URL(SHELL_PATH, request.url));
  return await response.text();
}

function previewId(resolved: unknown): string | number | null {
  if (!resolved || typeof resolved !== 'object') {
    return null;
  }
  const id = (resolved as { id?: unknown }).id;
  if (typeof id === 'string' || typeof id === 'number') {
    return id;
  }
  return null;
}

function previewName(resolved: unknown): boolean {
  if (!resolved || typeof resolved !== 'object') {
    return false;
  }
  const name = (resolved as { name?: unknown }).name;
  return typeof name === 'string' && name.trim().length > 0;
}

async function loadPreview(slug: string): Promise<{ resolved: unknown; serviceNames: string[] }> {
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !anonKey) {
    return { resolved: null, serviceNames: [] };
  }

  const headers = previewHeaders(anonKey);
  const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_business_by_slug`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ business_slug: slug }),
  });
  if (!rpcResponse.ok) {
    return { resolved: null, serviceNames: [] };
  }

  const data: unknown = await rpcResponse.json();
  const resolved = Array.isArray(data) ? data[0] : data;
  const id = previewId(resolved);
  if (!previewName(resolved) && id == null) {
    return { resolved, serviceNames: [] };
  }
  if (id == null) {
    return { resolved, serviceNames: [] };
  }

  const servicesResponse = await fetch(
    `${supabaseUrl}/rest/v1/services?select=name&is_active=eq.true&business_id=eq.${encodeURIComponent(String(id))}&limit=3`,
    { headers },
  );
  if (!servicesResponse.ok) {
    return { resolved, serviceNames: [] };
  }

  const services: unknown = await servicesResponse.json();
  const serviceNames = (Array.isArray(services) ? services : [])
    .map((row) => (row && typeof row === 'object' && typeof (row as { name?: unknown }).name === 'string' ? (row as { name: string }).name : ''))
    .filter(Boolean);

  return { resolved, serviceNames };
}

export async function handleBookingShare(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let shell = FALLBACK_SHELL;
  try {
    shell = await fetchSpaShell(request);
  } catch {
    shell = FALLBACK_SHELL;
  }

  if (!isTenantBookingSharePath(url.pathname, url.search)) {
    return htmlResponse(shell, false);
  }

  const slug = tenantSlug(url.pathname);
  let resolved: unknown = null;
  let serviceNames: string[] = [];
  try {
    ({ resolved, serviceNames } = await loadPreview(slug));
  } catch {
    resolved = null;
    serviceNames = [];
  }

  const head = toBookingShareHead({ slug, resolved, serviceNames });
  return htmlResponse(rewriteBookingShareHead(shell, head), true);
}

export default handleBookingShare;
