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

  it('keeps plan hints at one included salon for every base tier', () => {
    const free = getPlanUxContract('FREE');
    const basic = getPlanUxContract('BASIC');
    const medium = getPlanUxContract('MEDIUM');
    const pro = getPlanUxContract('PRO');

    for (const contract of [free, basic, medium, pro]) {
      expect(contract.maxSalons).toBe(1);
      expect(contract.multiSalonEnabled).toBe(false);
      expect(contract.salonNamesHint).toMatch(/1 salón incluido|1 local incluido/i);
      expect(contract.salonNamesHint).toMatch(/add-on|adicionales|consult/i);
      expect(contract.salonNamesHint).not.toMatch(/premium.*multi-sucursal/i);
    }
  });

  it('does not enable premium multi-salon input without an explicit add-on model', () => {
    const premiumPlans = ['BASIC', 'MEDIUM', 'PRO'] as const;

    for (const plan of premiumPlans) {
      const contract = getPlanUxContract(plan);
      expect(contract.multiSalonEnabled).toBe(false);
      expect(contract.maxSalons).toBe(1);
    }
  });

  it('rejects multiple salon names for paid base plans until add-on support is modeled', () => {
    const validation = validateOnboardingDraft(
      makeValidDraft({
        selectedPlan: 'PRO',
        salonNames: ['Salon Centro', 'Salon Norte']
      })
    );

    expect(validation.valid).toBe(false);
    expect(validation.fieldErrors.salonNames).toMatch(/1 salon|1 salón|maximum/i);
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
