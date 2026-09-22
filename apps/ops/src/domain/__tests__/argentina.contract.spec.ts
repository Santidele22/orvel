import { describe, expect, it } from 'vitest';
import { extractCityFromAddress, isArgentinaProspect } from '../argentina';

describe('isArgentinaProspect', () => {
  it('accepts a Maps row in Argentina with +54', () => {
    expect(
      isArgentinaProspect({
        address: 'Mitre 500, San Carlos de Bariloche, Río Negro, Argentina',
        phoneRaw: '+54 9 294 412-3390'
      })
    ).toBe(true);
  });

  it('rejects Chile even if the name looks like a salon', () => {
    expect(
      isArgentinaProspect({
        address: 'Providencia 123, Santiago, Chile',
        phoneRaw: '+56 9 8765 4321'
      })
    ).toBe(false);
  });

  it('rejects a foreign calling code even with an empty address', () => {
    expect(isArgentinaProspect({ address: '', phoneRaw: '+56 9 8765 4321' })).toBe(false);
  });

  it('accepts a national AR number when the address names a province', () => {
    expect(
      isArgentinaProspect({
        address: 'San Carlos de Bariloche, Río Negro',
        phoneRaw: '0294 15 412-3390'
      })
    ).toBe(true);
  });
});

describe('extractCityFromAddress', () => {
  it('takes the city before province and country', () => {
    expect(
      extractCityFromAddress('Av. Bustillo 4200, San Carlos de Bariloche, Río Negro, Argentina')
    ).toBe('San Carlos de Bariloche');
  });
});
