import { describe, expect, it } from 'vitest';
import type { OnboardingDraft, OnboardingStepState } from '../lib/onboarding-l01-contract';
import {
  canContinueToNextStep,
  canSubmitOnboarding,
  createOnboardingDraft,
  getPlanUxContract,
  nextStep,
  normalizeOnboardingPayload,
  previousStep,
  validateOnboardingDraft
} from '../lib/onboarding-l01-contract';

function makeValidDraft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {
    firstName: 'Santi',
    lastName: 'Lopez',
    businessType: 'peluqueria',
    salonNames: ['Salon Centro'],
    selectedPlan: 'FREE',
    ...overrides
  };
}

describe('RED contract L-01: multi-step onboarding data capture', () => {
  it('requires firstName, lastName, businessType, at least one salonName, and selectedPlan', () => {
    const invalid = makeValidDraft({
      firstName: ' ',
      lastName: '',
      businessType: '  ',
      salonNames: [],
      selectedPlan: ''
    });

    const validation = validateOnboardingDraft(invalid);

    expect(validation.valid).toBe(false);
    expect(validation.fieldErrors.firstName).toMatch(/first\s*name|required/i);
    expect(validation.fieldErrors.lastName).toMatch(/last\s*name|required/i);
    expect(validation.fieldErrors.businessType).toMatch(/business\s*type|required/i);
    expect(validation.fieldErrors.salonNames).toMatch(/salon.*at least one|required/i);
    expect(validation.fieldErrors.selectedPlan).toMatch(/plan|required/i);
  });

  it('blocks moving to next step when required fields for current step are missing', () => {
    const state: OnboardingStepState = {
      currentStep: 'profile',
      draft: makeValidDraft({ firstName: '' })
    };

    expect(canContinueToNextStep(state)).toBe(false);
  });

  it('preserves entered values when navigating forward and back between steps', () => {
    const initial: OnboardingStepState = {
      currentStep: 'business',
      draft: makeValidDraft({
        firstName: 'Lucia',
        lastName: 'Gomez',
        businessType: 'barberia',
        salonNames: ['Salon Norte', 'Salon Centro'],
        selectedPlan: 'MEDIUM'
      })
    };

    const forward = nextStep(initial);
    const back = previousStep(forward);

    expect(back.draft).toEqual(initial.draft);
  });

  it('returns clear per-field error messages instead of a generic global error only', () => {
    const invalid = makeValidDraft({ firstName: '', salonNames: [] });
    const validation = validateOnboardingDraft(invalid);

    expect(validation.fieldErrors.firstName).toBeDefined();
    expect(validation.fieldErrors.salonNames).toBeDefined();
    expect(Object.keys(validation.fieldErrors).length).toBeGreaterThanOrEqual(2);
  });

  it('updates plan hints when selecting FREE vs premium tiers', () => {
    const free = getPlanUxContract('FREE');
    const basic = getPlanUxContract('BASIC');
    const medium = getPlanUxContract('MEDIUM');
    const pro = getPlanUxContract('PRO');

    expect(free.maxSalons).toBe(1);
    expect(basic.maxSalons).toBeGreaterThanOrEqual(3);
    expect(medium.maxSalons).toBeGreaterThanOrEqual(4);
    expect(pro.maxSalons).toBeGreaterThanOrEqual(5);
    expect(free.salonNamesHint).not.toEqual(pro.salonNamesHint);
  });

  it('exposes premium multi-salon input contract (enabled + bounded by tier limits)', () => {
    const free = getPlanUxContract('FREE');
    const premium = getPlanUxContract('PRO');

    expect(free.multiSalonEnabled).toBe(false);
    expect(premium.multiSalonEnabled).toBe(true);
    expect(premium.maxSalons).toBeGreaterThan(1);
  });

  it('blocks submit until the draft is fully valid', () => {
    expect(canSubmitOnboarding(makeValidDraft({ selectedPlan: '' }))).toBe(false);
    expect(canSubmitOnboarding(makeValidDraft())).toBe(true);
  });

  it('produces normalized payload with stable keys and basic types', () => {
    const payload = normalizeOnboardingPayload(
      makeValidDraft({
        firstName: '  Santi ',
        lastName: '  Lopez ',
        businessType: '  Peluqueria ',
        salonNames: [' Salon Centro ', 'Salon Centro', ''],
        selectedPlan: 'BASIC'
      })
    );

    expect(payload).toEqual({
      firstName: 'Santi',
      lastName: 'Lopez',
      businessType: 'peluqueria',
      salonNames: ['Salon Centro'],
      selectedPlan: 'BASIC'
    });
  });

  it('starts from deterministic empty draft baseline for step persistence', () => {
    expect(createOnboardingDraft()).toEqual({
      firstName: '',
      lastName: '',
      businessType: '',
      salonNames: [],
      selectedPlan: ''
    });
  });
});
