import {
  TOUR_TARGET_ATTRIBUTE,
  isSameTourRoute,
  settingsTabAnchor,
  type OperatorTourStep,
} from './operator-tour-steps';

/**
 * First-run journey hops (#1136).
 *
 * driver.js hooks are synchronous — `type DriverHook = (...) => void`, and the
 * 1.8/1.9 runtime calls `onNextClick?.()` without awaiting it — so a hook can
 * never `await router.navigate()`. The decision of *where the next step lives*
 * therefore belongs to a pure function, and the service only executes it:
 * navigate first, then `moveTo`.
 */

export type OperatorTourDirection = 1 | -1;

export interface OperatorTourAdvanceState {
  /** Index driver.js last highlighted. */
  readonly activeIndex: number;
  /** True while a hop is still in flight; further clicks are dropped. */
  readonly transitioning: boolean;
}

export type OperatorTourAdvance =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'finish' }
  | {
      readonly kind: 'move';
      readonly index: number;
      /** Set when the target step lives on another route. */
      readonly navigateTo?: string;
    };

/** Route the step still needs to be shown, or undefined when it is already home. */
export function requiredNavigation(
  step: OperatorTourStep | undefined,
  activeRoute: string,
): string | undefined {
  if (!step?.route) return undefined;

  return isSameTourRoute(step.route, activeRoute) ? undefined : step.route;
}

/**
 * Selector of the settings tab button a step needs active before it can be
 * shown, or undefined when the step does not depend on a tab.
 *
 * The configuration panels live behind `@if (isActiveTab(...))`, so a step that
 * points inside one has no anchor until its tab is active. Resolving the button
 * here keeps the decision pure and lets the service press it, so "Siguiente"
 * reaches the panel instead of skipping the step as a missing anchor.
 */
export function requiredSettingsTabAnchor(step: OperatorTourStep | undefined): string | undefined {
  if (!step?.settingsTab) return undefined;

  return `[${TOUR_TARGET_ATTRIBUTE}="${settingsTabAnchor(step.settingsTab)}"]`;
}

export function planOperatorTourAdvance(
  steps: readonly OperatorTourStep[],
  state: OperatorTourAdvanceState,
  direction: OperatorTourDirection,
  activeRoute: string,
): OperatorTourAdvance {
  if (state.transitioning) {
    return { kind: 'ignore' };
  }

  const index = state.activeIndex + direction;
  const step = steps[index];

  if (!step) {
    // Past the end the journey closes; before the start there is nothing to do.
    return direction > 0 ? { kind: 'finish' } : { kind: 'ignore' };
  }

  const navigateTo = requiredNavigation(step, activeRoute);

  return navigateTo ? { kind: 'move', index, navigateTo } : { kind: 'move', index };
}

export interface OperatorTourWaitBudget {
  /** Anchor that is already on screen when its step activates. */
  readonly localAnchorMs: number;
  /** Anchor that may need a lazy chunk plus a first render. */
  readonly routeAnchorMs: number;
}

/**
 * How long each step may wait for its anchor.
 *
 * The long budget goes to every step a route hop can land on, in either
 * direction: forward hops mount a lazy page, and Atrás can remount the page it
 * came from. `waitForElement` only costs time when the anchor never shows up,
 * so budgeting generously here is free for the happy path.
 */
export function planOperatorTourWaits(
  steps: readonly OperatorTourStep[],
  activeRoute: string,
  budget: OperatorTourWaitBudget,
): number[] {
  return steps.map((step, index) => {
    const onAnotherRoute =
      step.route !== undefined && !isSameTourRoute(step.route, activeRoute);
    const neighbourElsewhere = [steps[index - 1]?.route, steps[index + 1]?.route].some(
      (route) =>
        route !== undefined &&
        (step.route === undefined || !isSameTourRoute(route, step.route)),
    );

    return onAnotherRoute || neighbourElsewhere ? budget.routeAnchorMs : budget.localAnchorMs;
  });
}
