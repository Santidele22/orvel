export function buildOnboardingRuntimeFlags(_input: {
  selectedTemplateIds: unknown;
  selectedRubros: unknown;
}): {
  enableServiceCrud: true;
  enableCategoryCrud: true;
  onboardingMode: 'standard';
} {
  return {
    enableServiceCrud: true,
    enableCategoryCrud: true,
    onboardingMode: 'standard'
  };
}
