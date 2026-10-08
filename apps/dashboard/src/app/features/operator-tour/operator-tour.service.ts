import { DestroyRef, Injectable, InjectionToken, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import {
  OPERATOR_TOUR_POPOVER_CLASS,
  TOUR_ROUTES,
  filterOperatorTourSteps,
  isSameTourRoute,
  resolveTourSurface,
  type OperatorTourStep,
  type TourSurface,
} from './operator-tour-steps';
import {
  planOperatorTourAdvance,
  planOperatorTourWaits,
  requiredNavigation,
  type OperatorTourDirection,
} from './operator-tour-journey';
import { browserPlatform } from '@orvel/dashboard-core/platform/platform.adapter';
import { createOperatorTourStorage } from './operator-tour-storage';

/** Minimal slice of the driver.js API this service uses. */
interface DriverInstance {
  drive: (stepIndex?: number) => void;
  destroy: () => void;
  moveTo: (index: number) => void;
}

interface DriverModule {
  driver: (config: unknown) => DriverInstance;
}

type DriverLoader = () => Promise<DriverModule>;

interface DriverHighlightOptions {
  readonly index?: number;
}

/** A planned step plus how long its anchor may take to mount. */
interface PlannedStep {
  readonly step: OperatorTourStep;
  readonly waitForElement: number;
}

/** How long an anchor on the active route may take to mount before it is skipped. */
const OPTIONAL_ANCHOR_WAIT_MS = 1200;

/**
 * A step that crosses routes waits for a lazy `loadComponent` chunk plus its
 * first render, which is slower than an anchor that is already on screen.
 */
const ROUTE_ANCHOR_WAIT_MS = 4000;

/**
 * How long the journey start may take to settle after the invite navigates
 * there. The plan probes anchors when it is built, so running against a still
 * loading page would silently drop the home content steps.
 */
export interface OperatorTourReadyBudget {
  readonly pollMs: number;
  readonly timeoutMs: number;
}

export const OPERATOR_TOUR_READY_BUDGET = new InjectionToken<OperatorTourReadyBudget>(
  'OPERATOR_TOUR_READY_BUDGET',
  { factory: () => ({ pollMs: 250, timeoutMs: 3000 }) },
);

/**
 * Runs the operator first-run tour with driver.js.
 *
 * The journey walks the app (#1136): it walks Inicio, detours through Servicios
 * and Configuración, and closes back on the booking link. driver.js hooks are
 * synchronous, so hops are planned by `operator-tour-journey` and executed here:
 * navigate first, then `moveTo`.
 *
 * driver.js is loaded with a dynamic `import()` inside `run()`, so the library
 * stays out of the initial bundle and off the critical path of the PWA shell.
 */
@Injectable({ providedIn: 'root' })
export class OperatorTourService {
  private readonly platformId = inject(PLATFORM_ID, { optional: true });
  private readonly destroyRef = inject(DestroyRef, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly readyBudget = inject(OPERATOR_TOUR_READY_BUDGET, { optional: true }) ?? {
    pollMs: 250,
    timeoutMs: 3000,
  };
  private readonly platform = browserPlatform();

  private readonly storage = createOperatorTourStorage();
  /**
   * driver.js publishes its own `Config`/`Driver` types. This service keeps only
   * the narrow slice above so the library's types do not leak through the
   * feature, so the dynamic import is narrowed once, here.
   */
  private readonly loadDriver: DriverLoader = () =>
    import('driver.js') as unknown as Promise<DriverModule>;

  private driver: DriverInstance | undefined;
  /** False during a programmatic teardown, so it does not count as completion. */
  private mounted = false;
  /** Steps of the current run, in tour order. */
  private steps: readonly OperatorTourStep[] = [];
  private plan: readonly PlannedStep[] = [];
  /** Index driver.js last highlighted. */
  private activeIndex = 0;
  /** Index the current hop asked for; a different landing means driver.js skipped. */
  private pendingIndex = 0;
  /** True while a hop is in flight, so double clicks cannot skip a step twice. */
  private transitioning = false;

  private readonly activeSignal = signal(false);
  private readonly completedSignal = signal(this.storage.hasCompleted());

  /** True while the tour is on screen; the help button uses it to stay idempotent. */
  readonly isActive = this.activeSignal.asReadonly();

  /** True once the operator finished or dismissed the tutorial at least once. */
  readonly hasCompleted = this.completedSignal.asReadonly();

  constructor() {
    this.destroyRef?.onDestroy(() => this.teardown());
  }

  private get isBrowser(): boolean {
    return this.platformId === null || isPlatformBrowser(this.platformId);
  }

  /**
   * Auto-start gate for the first-run invite: a browser session where the tour
   * was neither completed nor declined, and no tour is on screen already.
   */
  canAutoStart(): boolean {
    return this.isBrowser && !this.storage.hasCompleted() && !this.activeSignal();
  }

  /** Opens the tour. Safe to call repeatedly: a running tour is left alone. */
  async run(): Promise<void> {
    if (!this.isBrowser || this.activeSignal()) {
      return;
    }

    const activeRoute = this.currentRoute();
    // driver.js stages with `offsetParent`, so hidden anchors are never offered.
    // Anchors on other routes are kept: they are mounted after the hop.
    const steps = filterOperatorTourSteps(this.currentSurface(), { activeRoute });
    if (steps.length === 0) {
      return;
    }

    this.steps = steps;
    const waits = planOperatorTourWaits(steps, activeRoute, {
      localAnchorMs: OPTIONAL_ANCHOR_WAIT_MS,
      routeAnchorMs: ROUTE_ANCHOR_WAIT_MS,
    });
    this.plan = steps.map((step, index) => ({
      step,
      waitForElement: waits[index] ?? OPTIONAL_ANCHOR_WAIT_MS,
    }));

    try {
      const module = await this.loadDriver();
      this.activeSignal.set(true);
      this.mounted = true;
      this.activeIndex = 0;
      this.pendingIndex = 0;
      this.transitioning = false;
      this.driver = module.driver(this.buildConfig());
      this.driver.drive();
    } catch {
      // A failed tour must never break the shell: leave the help button usable.
      this.activeSignal.set(false);
      this.mounted = false;
      this.driver = undefined;
    }
  }

  /**
   * Invite accepted: the journey begins on its own first stop, so an operator
   * who landed on the agenda gets the dashboard walkthrough instead of a tour
   * with its content steps silently dropped.
   */
  async acceptInvite(): Promise<void> {
    await this.startJourney();
  }

  /** Invite declined: the operator is not asked again on this device. */
  declineInvite(): void {
    this.markCompleted();
  }

  /** Help-button entry point: restarts the tutorial from the very first step. */
  async replay(): Promise<void> {
    this.storage.reset();
    this.completedSignal.set(false);
    await this.startJourney();
  }

  private async startJourney(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }

    if (!isSameTourRoute(TOUR_ROUTES.inicio, this.currentRoute())) {
      try {
        await this.router?.navigateByUrl(TOUR_ROUTES.inicio);
      } catch {
        // A blocked navigation must not swallow the tour: it opens where it can.
      }
    }

    await this.waitForJourneyStart();
    await this.run();
  }

  /**
   * Waits for the home data to settle, because the plan probes anchors when it
   * is built: running against the loading skeleton would drop them.
   */
  private async waitForJourneyStart(): Promise<void> {
    const deadline = Date.now() + this.readyBudget.timeoutMs;

    while (Date.now() < deadline) {
      if (this.isJourneyStartReady()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, this.readyBudget.pollMs));
    }
  }

  private isJourneyStartReady(): boolean {
    try {
      if (typeof document === 'undefined') {
        return true;
      }

      return (
        document.querySelector('[data-tour="home-metrics"]') !== null &&
        document.querySelector('[data-testid="dashboard-home-loading-skeleton"]') === null
      );
    } catch {
      return true;
    }
  }

  /** Interrupts the tour without marking it as completed. */
  teardown(): void {
    this.mounted = false;
    try {
      this.driver?.destroy();
    } catch {
      // Ignore: driver.js may already be destroyed.
    }
    this.driver = undefined;
    this.steps = [];
    this.plan = [];
    this.transitioning = false;
    this.activeSignal.set(false);
  }

  private markCompleted(): void {
    this.storage.markCompleted();
    this.completedSignal.set(true);
  }

  private currentSurface(): TourSurface {
    return resolveTourSurface({
      matchesMediaQuery: (query: string) => this.platform.matchesMediaQuery(query)
    });
  }

  private currentRoute(): string {
    return this.router?.url ?? TOUR_ROUTES.inicio;
  }

  private toDriveStep(entry: PlannedStep): unknown {
    const { step, waitForElement } = entry;

    return {
      element: step.target,
      skipMissingElement: true,
      waitForElement,
      advanceOnClick: step.advanceOnClick === true,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
      },
    };
  }

  private buildConfig(): unknown {
    return {
      steps: this.plan.map((entry) => this.toDriveStep(entry)),
      animate: true,
      smoothScroll: true,
      allowClose: true,
      overlayColor: '#05070E',
      overlayOpacity: 0.72,
      stagePadding: 8,
      stageRadius: 14,
      popoverOffset: 12,
      showProgress: true,
      progressText: '{{current}} de {{total}}',
      nextBtnText: 'Siguiente',
      prevBtnText: 'Atrás',
      doneBtnText: 'Listo',
      // driver.js ships a light default theme; the class lets the dashboard
      // stylesheet paint the popover with its own surface tokens.
      popoverClass: OPERATOR_TOUR_POPOVER_CLASS,
      skipMissingElement: true,
      // A global hook replaces driver.js' default advance on every step, which is
      // what lets a hop navigate to another route before moving on.
      onNextClick: () => this.advance(1),
      onPrevClick: () => this.advance(-1),
      onHighlightStarted: (_element: unknown, _step: unknown, opts?: DriverHighlightOptions) =>
        this.handleHighlightStarted(opts?.index),
      onDestroyed: () => this.handleDestroyed(),
    };
  }

  private advance(direction: OperatorTourDirection): void {
    const plan = planOperatorTourAdvance(
      this.steps,
      { activeIndex: this.activeIndex, transitioning: this.transitioning },
      direction,
      this.currentRoute(),
    );

    if (plan.kind === 'ignore') {
      return;
    }
    if (plan.kind === 'finish') {
      this.driver?.destroy();
      return;
    }

    this.transitioning = true;
    this.pendingIndex = plan.index;

    if (plan.navigateTo) {
      void this.navigateThenMove(plan.navigateTo, plan.index);
      return;
    }
    this.driver?.moveTo(plan.index);
  }

  private async navigateThenMove(url: string, index: number): Promise<void> {
    const driver = this.driver;
    if (!driver) {
      return;
    }

    try {
      await this.router?.navigateByUrl(url);
    } catch {
      // A blocked navigation must not kill the tour: the anchor wait and the
      // skip-missing-element rule degrade that single step instead.
    }

    if (this.driver !== driver) {
      // The operator closed the tour while the route was loading.
      return;
    }
    driver.moveTo(index);
  }

  private handleHighlightStarted(index: number | undefined): void {
    const landed = typeof index === 'number' ? index : this.pendingIndex;
    const skippedByDriver = landed !== this.pendingIndex;

    this.activeIndex = landed;
    this.pendingIndex = landed;
    this.transitioning = false;

    if (!skippedByDriver) {
      return;
    }

    // driver.js drops a step whose anchor never mounted and jumps forward on its
    // own. That landing step may live on another route, so the tour has to move
    // there instead of highlighting an anchor that is not on screen.
    const navigateTo = requiredNavigation(this.steps[landed], this.currentRoute());
    if (!navigateTo) {
      return;
    }

    this.transitioning = true;
    void this.navigateThenMove(navigateTo, landed);
  }

  private handleDestroyed(): void {
    const countsAsCompletion = this.mounted;
    this.mounted = false;
    this.driver = undefined;
    this.steps = [];
    this.plan = [];
    this.transitioning = false;
    this.activeSignal.set(false);
    if (countsAsCompletion) {
      this.markCompleted();
    }
  }
}
