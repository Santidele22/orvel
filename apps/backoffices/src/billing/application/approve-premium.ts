import type { PendingPremiumRequest } from '../domain/pending-premium-request';
import type { ApprovePremiumPort } from '../domain/ports';

export async function approvePremium(
  port: ApprovePremiumPort,
  request: PendingPremiumRequest,
): Promise<void> {
  await port.approve(request.id);
}
