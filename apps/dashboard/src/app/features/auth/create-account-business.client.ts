import { buildCreateAccountBusinessUrl } from '../../core/auth/route-protection';
import type { CreateAccountBusinessPayload } from './in-app-signup-wizard';

export type CreateAccountBusinessResult = {
  ok: boolean;
  status?: string;
  message?: string;
};

export async function createFreeAccountBusiness(
  payload: CreateAccountBusinessPayload,
  fetchImpl: typeof fetch = fetch
): Promise<CreateAccountBusinessResult> {
  const response = await fetchImpl(buildCreateAccountBusinessUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let body: { status?: string; message?: string } = {};
  try {
    body = (await response.json()) as { status?: string; message?: string };
  } catch {
    body = {};
  }

  if (!response.ok) {
    return {
      ok: false,
      status: body.status,
      message: body.message || 'No pudimos crear la cuenta. Reintentá en unos segundos.'
    };
  }

  return { ok: true, status: body.status, message: body.message };
}
