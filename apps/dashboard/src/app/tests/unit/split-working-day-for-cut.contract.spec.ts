import { describe, expect, it } from 'vitest';
import { splitWorkingDayForCut } from '../../features/settings/data-access/resolve-working-day-intervals';

describe('splitWorkingDayForCut', () => {
  it('uses a 13:30-16:00 siesta when the current window contains it', () => {
    expect(splitWorkingDayForCut('09:00', '18:00')).toEqual({
      end: '13:30',
      start2: '16:00',
      end2: '18:00'
    });
    expect(splitWorkingDayForCut('09:00', '20:00')).toEqual({
      end: '13:30',
      start2: '16:00',
      end2: '20:00'
    });
  });

  it('splits a short afternoon window with a 30-minute gap instead of overlapping', () => {
    expect(splitWorkingDayForCut('10:00', '14:00')).toEqual({
      end: '11:45',
      start2: '12:15',
      end2: '14:00'
    });
  });
});
