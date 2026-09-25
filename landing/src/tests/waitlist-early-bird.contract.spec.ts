import { describe, expect, it } from 'vitest';

import { EARLY_BIRD_TIERS, getCurrentFranja, getOfferForPosition } from '../lib/waitlist';

describe('Contract: waitlist early-bird franjas', () => {
  it('defines first-come tiers of 10 / 15 / 25 for 50% / 25% / 10%', () => {
    expect(EARLY_BIRD_TIERS).toEqual([
      expect.objectContaining({ slots: 10, discountPercent: 50 }),
      expect.objectContaining({ slots: 15, discountPercent: 25 }),
      expect.objectContaining({ slots: 25, discountPercent: 10 })
    ]);
  });

  it('maps occupied 0 to the 50% franja with 10 of 10 remaining and 50 total', () => {
    expect(getCurrentFranja(0)).toEqual({
      discountPercent: 50,
      discountLabel: '50%',
      remainingInTier: 10,
      tierSlots: 10,
      remainingTotal: 50,
      inBenefit: true
    });
  });

  it('maps occupied 10 to the 25% franja with 15 of 15 remaining', () => {
    expect(getCurrentFranja(10)).toMatchObject({
      discountPercent: 25,
      discountLabel: '25%',
      remainingInTier: 15,
      tierSlots: 15,
      remainingTotal: 40,
      inBenefit: true
    });
  });

  it('maps occupied 25 to the 10% franja with 25 of 25 remaining', () => {
    expect(getCurrentFranja(25)).toMatchObject({
      discountPercent: 10,
      discountLabel: '10%',
      remainingInTier: 25,
      tierSlots: 25,
      remainingTotal: 25,
      inBenefit: true
    });
  });

  it('marks occupied 50 as outside the founder benefit', () => {
    expect(getCurrentFranja(50)).toMatchObject({
      inBenefit: false,
      remainingInTier: 0,
      remainingTotal: 0
    });
  });

  it('assigns exact offer by 1-based sheet position', () => {
    expect(getOfferForPosition(1)).toMatchObject({ position: 1, inBenefit: true, discountLabel: '50%' });
    expect(getOfferForPosition(10)).toMatchObject({ position: 10, inBenefit: true, discountLabel: '50%' });
    expect(getOfferForPosition(11)).toMatchObject({ position: 11, inBenefit: true, discountLabel: '25%' });
    expect(getOfferForPosition(26)).toMatchObject({ position: 26, inBenefit: true, discountLabel: '10%' });
    expect(getOfferForPosition(51)).toMatchObject({ position: 51, inBenefit: false, discountLabel: null });
  });
});
