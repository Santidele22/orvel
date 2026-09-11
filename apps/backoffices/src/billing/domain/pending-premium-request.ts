import type { IsoTimestamp } from '../../shared/kernel';

export type PremiumRequestStatus = 'pending' | 'approved' | 'rejected';

/** Queue row for the first billing slice. UI shows the five fields; `id` is the RPC key. */
export type PendingPremiumRequest = {
  readonly id: string;
  readonly who: string;
  readonly whatTheyAsked: string;
  readonly status: PremiumRequestStatus;
  readonly when: IsoTimestamp;
  readonly accountExists: boolean;
};
