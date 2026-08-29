import type { PendingPremiumRequest, PremiumRequestStatus } from './pending-premium-request';

const PENDING_WHO_FALLBACK = 'Alta pendiente';

export type PendingPremiumRequestRow = {
  request_id: string;
  who: string | null;
  what_they_asked: string;
  status: PremiumRequestStatus;
  requested_at: string;
  account_exists: boolean;
  email_encrypted?: string;
  phone_hmac?: string;
};

export function mapPendingPremiumRequest(
  row: PendingPremiumRequestRow,
): PendingPremiumRequest {
  const who = row.who?.trim() || PENDING_WHO_FALLBACK;

  return {
    id: row.request_id,
    who,
    whatTheyAsked: row.what_they_asked,
    status: row.status,
    when: row.requested_at,
    accountExists: row.account_exists,
  };
}
