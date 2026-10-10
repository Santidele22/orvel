import { describe, expect, it } from 'vitest';
import {
  TOUR_TARGET_ATTRIBUTE,
  TOUR_ROUTES,
  settingsTabAnchor,
  type OperatorTourStep,
} from './operator-tour-steps';
import {
  planOperatorTourAdvance,
  planOperatorTourWaits,
  requiredNavigation,
  requiredSettingsTabAnchor,
  type OperatorTourAdvance,
} from './operator-tour-journey';

/**
 * The first-run journey crosses routes, and driver.js hooks are synchronous:
 * `onNextClick` cannot `await router.navigate()`. The hop decision therefore
 * lives here as a pure function, and the service only executes it.
 */

const step = (id: string, route?: string): OperatorTourStep => ({
  id,
  target: `[data-tour="${id}"]`,
  surfaces: ['desktop', 'mobile'],
  title: id,
  description: id,
  ...(route ? { route } : {}),
});

const JOURNEY: readonly OperatorTourStep[] = [
  step('welcome', TOUR_ROUTES.inicio),
  step('servicios', TOUR_ROUTES.servicios),
  step('configuracion', TOUR_ROUTES.configuracion),
  step('link', TOUR_ROUTES.inicio),
];

const settled = (activeIndex: number) => ({ activeIndex, transitioning: false });
const moving = (activeIndex: number) => ({ activeIndex, transitioning: true });

describe('operator tour journey contract', () => {
  it('moves straight ahead when the next step lives on the active route', () => {
    expect(planOperatorTourAdvance([JOURNEY[0], JOURNEY[0]], settled(0), 1, TOUR_ROUTES.inicio)).toEqual({
      kind: 'move',
      index: 1,
    });
  });

  it('navigates first when the next step lives on another route', () => {
    expect(planOperatorTourAdvance(JOURNEY, settled(0), 1, TOUR_ROUTES.inicio)).toEqual({
      kind: 'move',
      index: 1,
      navigateTo: TOUR_ROUTES.servicios,
    });
  });

  it('treats both shell mounts as the same route', () => {
    // The shell is mounted at `/dashboard/*` and at the root, so `/servicios`
    // must not trigger a redundant navigation to `/dashboard/servicios`.
    expect(planOperatorTourAdvance(JOURNEY, settled(0), 1, '/servicios')).toEqual({
      kind: 'move',
      index: 1,
    });
  });

  it('walks back across routes so Atrás never strands the operator', () => {
    expect(planOperatorTourAdvance(JOURNEY, settled(2), -1, TOUR_ROUTES.configuracion)).toEqual({
      kind: 'move',
      index: 1,
      navigateTo: TOUR_ROUTES.servicios,
    });
  });

  it('finishes when the operator advances past the last step', () => {
    expect(planOperatorTourAdvance(JOURNEY, settled(JOURNEY.length - 1), 1, TOUR_ROUTES.inicio)).toEqual({
      kind: 'finish',
    });
  });

  it('ignores an advance that would leave the list backwards', () => {
    expect(planOperatorTourAdvance(JOURNEY, settled(0), -1, TOUR_ROUTES.inicio)).toEqual({
      kind: 'ignore',
    });
  });

  it('ignores clicks while a transition is still in flight', () => {
    const advance: OperatorTourAdvance = planOperatorTourAdvance(
      JOURNEY,
      moving(0),
      1,
      TOUR_ROUTES.inicio,
    );

    expect(advance).toEqual({ kind: 'ignore' });
  });

  it('survives an empty plan', () => {
    expect(planOperatorTourAdvance([], settled(0), 1, TOUR_ROUTES.inicio)).toEqual({ kind: 'finish' });
  });

  it('resolves the navigation a step still needs, if any', () => {
    expect(requiredNavigation(JOURNEY[1], TOUR_ROUTES.inicio)).toBe(TOUR_ROUTES.servicios);
    expect(requiredNavigation(JOURNEY[1], TOUR_ROUTES.servicios)).toBeUndefined();
    expect(requiredNavigation(JOURNEY[0], '/inicio')).toBeUndefined();
    expect(requiredNavigation(undefined, TOUR_ROUTES.inicio)).toBeUndefined();
  });

  it('resolves the settings tab whose panel holds a step anchor', () => {
    const panelStep: OperatorTourStep = { ...step('panel', TOUR_ROUTES.configuracion), settingsTab: 'equipo' };

    expect(requiredSettingsTabAnchor(panelStep)).toBe(
      `[${TOUR_TARGET_ATTRIBUTE}="${settingsTabAnchor('equipo')}"]`,
    );
    expect(requiredSettingsTabAnchor(JOURNEY[0])).toBeUndefined();
    expect(requiredSettingsTabAnchor(undefined)).toBeUndefined();
  });
});

describe('operator tour wait budget', () => {
  const WINDOW = { localAnchorMs: 1200, routeAnchorMs: 4000 };

  it('waits longer for anchors that only mount after a route hop', () => {
    const waits = planOperatorTourWaits(JOURNEY, TOUR_ROUTES.inicio, WINDOW);

    // Every step here can be reached by a hop, forward or back, so every anchor
    // gets the lazy-page budget. Only same-route steps keep the local budget.
    expect(waits[1]).toBe(WINDOW.routeAnchorMs); // servicios: lazy chunk + render
    expect(waits[2]).toBe(WINDOW.routeAnchorMs); // configuracion: lazy chunk + render
    expect(waits[3]).toBe(WINDOW.routeAnchorMs); // link: the hop back home
  });

  it('keeps the local budget for steps that no hop can reach', () => {
    const steps = [step('a', TOUR_ROUTES.inicio), step('b', TOUR_ROUTES.inicio)];

    expect(planOperatorTourWaits(steps, TOUR_ROUTES.inicio, WINDOW)).toEqual([
      WINDOW.localAnchorMs,
      WINDOW.localAnchorMs,
    ]);
  });

  it('budgets for Atrás too: a neighbour on another route can remount the anchor', () => {
    const steps = [
      step('a', TOUR_ROUTES.inicio),
      step('b', TOUR_ROUTES.inicio),
      step('c', TOUR_ROUTES.servicios),
    ];
    const waits = planOperatorTourWaits(steps, TOUR_ROUTES.inicio, WINDOW);

    expect(waits[1]).toBe(WINDOW.routeAnchorMs);
    expect(waits[2]).toBe(WINDOW.routeAnchorMs);
  });
});
