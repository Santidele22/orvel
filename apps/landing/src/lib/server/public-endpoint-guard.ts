import { createClient } from '@supabase/supabase-js';

const RATE_LIMIT_MAX_REQUESTS = 5;

export const ALLOWED_DASHBOARD_ORIGINS = new Set([
  'https://orvel.pro',
  'https://www.orvel.pro',
  'https://dashboard.orvel.pro',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

export function getClientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('client-ip') || 'unknown';
}

export function isDisallowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  return !ALLOWED_DASHBOARD_ORIGINS.has(origin);
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function isPublicEndpointRateLimited(supabaseAdmin: ReturnType<typeof createClient>, request: Request, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  const bucketHash = await sha256Text(`${getClientIp(request)}:${normalizedEmail}`);
  // The RPC stores p_email_hmac verbatim; a plain SHA-256 digest keeps rate-limit rows pseudonymous.
  const emailHmac = await sha256Text(normalizedEmail);
  const { data, error } = await supabaseAdmin.rpc('guard_signup_request_rate_limit', {
    p_bucket_hash: bucketHash,
    p_email_hmac: emailHmac,
    p_max_requests: RATE_LIMIT_MAX_REQUESTS,
  });
  if (error) {
    console.warn('guard_signup_request_rate_limit_failed', {
      rpc: 'guard_signup_request_rate_limit',
      code: error.code,
      class: error.message,
    });
    throw new Error('public_endpoint_rate_limit_unavailable');
  }
  return data === true;
}
