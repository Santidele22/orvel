import type { PendingPremiumRequest } from '../domain/pending-premium-request';
import type { ListPendingPremiumPort } from '../domain/ports';

export async function listPendingPremium(
  port: ListPendingPremiumPort,
): Promise<readonly PendingPremiumRequest[]> {
  return port.listPending();
}
