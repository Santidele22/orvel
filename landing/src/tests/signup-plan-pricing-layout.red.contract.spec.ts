import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const SIGNUP_PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const SIGNUP_PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: signup plan page reuses public pricing layout', () => {
  it('renders signup plans through the shared pricing PlanCard component, not a divergent signup-only card', async () => {
    const signupCardsSource = await loadSource(SIGNUP_PLAN_CARDS_PATH);

    expect(signupCardsSource).toMatch(/import\s+PlanCard\s+from\s+["']\.\.\/molecules\/PlanCard\.astro["']/);
    expect(signupCardsSource).not.toMatch(/import\s+SignupPlanCard\s+from/);
    expect(signupCardsSource).toMatch(/<PlanCard\s+plan=\{plan\}\s+isSignupPage(?:=\{true\})?\s*\/>/);
  });

  it('keeps signup cards monthly-only without quarterly or annual billing toggles', async () => {
    const signupCardsSource = await loadSource(SIGNUP_PLAN_CARDS_PATH);

    const cardsIndex = signupCardsSource.indexOf('id="plans-container"');

    expect(cardsIndex).toBeGreaterThan(-1);
    expect(signupCardsSource).not.toMatch(/data-billing=["'](?:quarterly|annual)["']/);
    expect(signupCardsSource).not.toMatch(/Trimestral|Anual/);
  });

  it('centers signup cards responsively instead of using a separate fixed grid design', async () => {
    const signupCardsSource = await loadSource(SIGNUP_PLAN_CARDS_PATH);

    expect(signupCardsSource).toMatch(/flex\s+flex-col\s+md:flex-row\s+flex-wrap\s+justify-center\s+items-stretch\s+gap-6/);
    expect(signupCardsSource).not.toMatch(/md:grid-cols-4|md:grid-cols-3/);
  });

  it('inherits public pricing card content and signup-safe CTAs without checkout or multi-local base claims', async () => {
    const signupPageSource = await loadSource(SIGNUP_PLAN_PAGE_PATH);
    const signupCardsSource = await loadSource(SIGNUP_PLAN_CARDS_PATH);
    const planCardSource = await loadSource(PLAN_CARD_PATH);
    const effectiveSignupPlanSource = `${signupPageSource}\n${signupCardsSource}\n${planCardSource}`;

    for (const expected of [
      'Incluye 1 local',
      'Turnos ilimitados',
      'Clientes',
      'Servicios',
      'Horarios personalizados',
      'Descansos y bloqueos',
      'Reprogramaciones',
      'Elegir Premium',
    ]) {
      expect(effectiveSignupPlanSource).toContain(expected);
    }

    expect(effectiveSignupPlanSource).toContain('/auth/signup/credentials?plan=');
    expect(effectiveSignupPlanSource).not.toMatch(/checkout|Comprar ahora/i);
    expect(effectiveSignupPlanSource).not.toMatch(/Hasta\s+(?:[2-9]|\d{2,})\s+(?:locales|sucursales)/i);
    expect(effectiveSignupPlanSource).not.toMatch(/M[úu]ltiples\s+(?:locales|sucursales)/i);
  });
});
