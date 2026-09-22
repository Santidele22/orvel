import { describe, expect, it } from 'vitest';
import { createContact } from '../contact';
import { computePipelineStats } from '../pipeline-stats';
import type { StageId } from '../stage';

function contact(stage: StageId, id: string) {
  return createContact({
    id,
    name: id,
    phoneRaw: `294000000${id}`,
    city: 'Bariloche',
    category: 'otro',
    notes: '',
    stage
  });
}

describe('computePipelineStats', () => {
  it('counts totals, new, replies, closed clients, and response rate', () => {
    const stats = computePipelineStats([
      contact('nuevo', '1'),
      contact('nuevo', '2'),
      contact('contactado', '3'),
      contact('respondio', '4'),
      contact('en_negociacion', '5'),
      contact('cliente', '6'),
      contact('descartado', '7')
    ]);
    expect(stats.total).toBe(7);
    expect(stats.nuevo).toBe(2);
    expect(stats.respondieron).toBe(3);
    expect(stats.clientes).toBe(1);
    expect(stats.responseRatePercent).toBe(75);
  });

  it('returns 0% when nobody has been contacted', () => {
    expect(computePipelineStats([contact('nuevo', '1')]).responseRatePercent).toBe(0);
  });
});
