import { describe, expect, it } from 'vitest';
import { approvePremium } from './approve-premium';
import { listPendingPremium } from './list-pending-premium';
import type { PendingPremiumRequest } from '../domain/pending-premium-request';

const row: PendingPremiumRequest = {
  id: 'req-1',
  who: 'Salon Norte',
  whatTheyAsked: 'PREMIUM',
  status: 'pending',
  when: '2026-08-29T12:00:00.000Z',
  accountExists: true,
};

describe('premium queue use cases', () => {
  it('listPendingPremium returns rows from the port', async () => {
    const listed = await listPendingPremium({
      listPending: async () => [row],
    });
    expect(listed).toEqual([row]);
  });

  it('approvePremium calls the port with the request id', async () => {
    const approved: string[] = [];
    await approvePremium(
      {
        approve: async (requestId) => {
          approved.push(requestId);
        },
      },
      row,
    );
    expect(approved).toEqual(['req-1']);
  });
});
