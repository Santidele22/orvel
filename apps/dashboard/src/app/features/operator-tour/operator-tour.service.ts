import { DestroyRef, Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  filterOperatorTourSteps,
  resolveTourSurface,
  type OperatorTourStep,
  type TourSurface,
  type TourSurfaceEnvironment,
} from './operator-tour-steps';
import { createOperatorTourStorage } from './operator-tour-storage';

/** Minimal slice of the driver.js API this service uses. */
interface DriverInstance {
  drive: () => void;
  destroy: () => void;
}

interface DriverModule {
  driver: (config: unknown) => DriverInstance;
}

type DriverLoader = () => Promise<DriverModule>;

/** How long an optional anchor may take to mount before its step is skipped. */
const OPTIONAL_ANCHOR_WAIT_MS = 1200;

/**
 * Runs the operator onboarding tour with driver.js.
 *
 * driver.js is loaded with a dynamic `import()` inside `run()`, so the library
 * stays out of the initial bundle and off the critical path of the PWA shell.
 */
@Injectable({ providedIn: 'root' })
export class OperatorTourService {
  private readonly platformId = inject(PLATFORM_ID, { optional: true });
  private readonly destroyRef = inject(DestroyRef, { optional: true });

  private readonly storage = createOperatorTourStorage();
  private readonly loadDriver: DriverLoader = () => import('driver.js');

  private driver: DriverInstance | undefined;
  /** False during a programmatic teardown, so it does not count as completion. */
  private mounted = false;

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

  /** Auto-start gate for the shell: first visit on this device only. */
  canAutoStart(): boolean {
    return this.isBrowser && !this.storage.hasCompleted();
  }

  /** Opens the tour. Safe to call repeatedly: a running tour is left alone. */
  async run(): Promise<void> {
    if (!this.isBrowser || this.activeSignal()) {
      return;
    }

    // driver.js stages with `offsetParent`, so hidden anchors are never offered.
    const steps = filterOperatorTourSteps(this.currentSurface()).map((step) =>
      this.toDriveStep(step),
    );
    if (steps.length === 0) {
      return;
    }

    try {
      const module = await this.loadDriver();
      this.activeSignal.set(true);
      this.mounted = true;
      this.driver = module.driver(this.buildConfig(steps));
      this.driver.drive();
    } catch {
      // A failed tour must never break the shell: leave the help button usable.
      this.activeSignal.set(false);
      this.mounted = false;
      this.driver = undefined;
    }
  }

  /** Help-button entry point: restarts the tutorial from the very first step. */
  async replay(): Promise<void> {
    this.storage.reset();
    this.completedSignal.set(false);
    await this.run();
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
    this.activeSignal.set(false);
  }

  private markCompleted(): void {
    this.storage.markCompleted();
    this.completedSignal.set(true);
  }

  private currentSurface(): TourSurface {
    const environment = this.matchMediaEnvironment();
    return resolveTourSurface(environment ?? {});
  }

  private matchMediaEnvironment(): TourSurfaceEnvironment | undefined {
    try {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return undefined;
      }
      return {
        matchMedia: (query: string) => window.matchMedia(query),
      };
    } catch {
      return undefined;
    }
  }

  private toDriveStep(step: OperatorTourStep): unknown {
    return {
      element: step.target,
      skipMissingElement: true,
      waitForElement: step.optional ? OPTIONAL_ANCHOR_WAIT_MS : 0,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
      },
    };
  }

  private buildConfig(steps: unknown[]): unknown {
    return {
      steps,
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
      skipMissingElement: true,
      onDestroyed: () => this.handleDestroyed(),
    };
  }

  private handleDestroyed(): void {
    const countsAsCompletion = this.mounted;
    this.mounted = false;
    this.driver = undefined;
    this.activeSignal.set(false);
    if (countsAsCompletion) {
      this.markCompleted();
    }
  }
}
