import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FLOW_STATE_PATH = new URL('../../features/onboarding/data-access/onboarding-flow-state.ts', import.meta.url);
const ONBOARDING_PAGE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.ts', import.meta.url);
const ONBOARDING_TEMPLATE_PATH = new URL('../../features/onboarding/pages/signup-business-types-step.page.html', import.meta.url);

function read(path: URL): string {
  return readFileSync(path, 'utf8');
}

describe('Onboarding welcome email paused contract', () => {
  it('does not expose or mutate welcome-email trigger state while welcome email is disabled', () => {
    const source = read(FLOW_STATE_PATH);

    expect(source).not.toMatch(/WELCOME_EMAIL|welcome-email|welcomeEmail|markWelcomeEmailTriggeredOnce/i);
  });

  it('does not dispatch frontend welcome-email events from onboarding completion', () => {
    const source = read(ONBOARDING_PAGE_PATH);

    expect(source).not.toMatch(/welcome-email|onboarding:welcome-email-trigger|triggerWelcomeEmail|markWelcomeEmailTriggeredOnce/i);
  });

  it('does not mention email in the visible welcome copy', () => {
    const template = read(ONBOARDING_TEMPLATE_PATH);

    expect(template).not.toMatch(/email|correo|mail/i);
  });
});
