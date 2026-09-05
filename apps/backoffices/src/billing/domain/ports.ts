import type { PendingPremiumRequest } from './pending-premium-request';

export interface ListPendingPremiumPort {
  listPending(): Promise<readonly PendingPremiumRequest[]>;
}

export interface ApprovePremiumPort {
  approve(requestId: string): Promise<void>;
}
