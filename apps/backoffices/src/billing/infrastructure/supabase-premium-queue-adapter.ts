import type { SupabaseClient } from '@supabase/supabase-js';
import { mapPendingPremiumRequest, type PendingPremiumRequestRow } from '../domain/map-pending-premium-request';
import type { ApprovePremiumPort, ListPendingPremiumPort } from '../domain/ports';

export const BUSINESS_NOT_MATERIALIZED = 'BUSINESS_NOT_MATERIALIZED';

export function createPremiumQueueAdapter(
  client: SupabaseClient,
): ListPendingPremiumPort & ApprovePremiumPort {
  return {
    async listPending() {
      const { data, error } = await client.rpc('list_pending_premium_requests');
      if (error) {
        throw error;
      }

      return (data ?? []).map((row: PendingPremiumRequestRow) => mapPendingPremiumRequest(row));
    },
    async approve(requestId) {
      const { error } = await client.rpc('approve_manual_premium', { p_request_id: requestId });
      if (!error) {
        return;
      }

      const message = error.message ?? '';
      if (message.includes(BUSINESS_NOT_MATERIALIZED)) {
        throw new Error(BUSINESS_NOT_MATERIALIZED);
      }

      throw error;
    },
  };
}
