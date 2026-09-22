import { Component, inject } from '@angular/core';
import { OperatorTourService } from './operator-tour.service';

/**
 * Floating replay control for the operator onboarding tour.
 *
 * Positioned above the mobile bottom nav (and above the safe area in a
 * standalone PWA) and pinned to the bottom-right corner on desktop. It is also
 * the final step of the tour, which teaches the operator how to repeat it.
 */
@Component({
  selector: 'app-operator-tour-help-button',
  standalone: true,
  template: `
    <button
      type="button"
      data-tour="tour-help"
      data-testid="operator-tour-help"
      [class]="'operator-tour-help' + (tour.isActive() ? ' invisible pointer-events-none' : '')"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-disabled]="tour.isActive()"
      (click)="openTour()"
    >
      <i class="ri-question-line text-xl" aria-hidden="true"></i>
    </button>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .operator-tour-help {
        position: fixed;
        right: 1rem;
        bottom: calc(4.75rem + env(safe-area-inset-bottom, 0px));
        z-index: 45;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 2.75rem;
        width: 2.75rem;
        border-radius: 9999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(13, 18, 32, 0.92);
        color: #9b7bff;
        box-shadow: 0 10px 24px -10px rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(12px);
        transition:
          transform 150ms ease,
          background-color 150ms ease,
          color 150ms ease;
      }

      .operator-tour-help:hover {
        background: rgba(124, 92, 255, 0.18);
        color: #f3f1fa;
      }

      .operator-tour-help:active {
        transform: scale(0.95);
      }

      .operator-tour-help:focus-visible {
        outline: 2px solid #9b7bff;
        outline-offset: 2px;
      }

      /* The tour hides the button with visibility (Tailwind invisible), never
         display, because driver.js stages its final step against this node. */
      @media (min-width: 1024px) {
        .operator-tour-help {
          bottom: 1.5rem;
          right: 1.5rem;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .operator-tour-help {
          transition: none;
        }
      }
    `,
  ],
})
export class OperatorTourHelpButtonComponent {
  protected readonly tour = inject(OperatorTourService);

  protected ariaLabel(): string {
    return this.tour.isActive() ? 'Tutorial en curso' : 'Ver tutorial de Orvel';
  }

  protected openTour(): void {
    void this.tour.replay();
  }
}
