import { Component, ElementRef, HostListener, afterNextRender, inject, signal, viewChild, viewChildren } from '@angular/core';
import { DASHBOARD_TOUR } from '@orvel/dashboard-core/shell/dashboard-chrome.ports';
import {
  TOUR_INVITE_ACCEPT_LABEL,
  TOUR_INVITE_DECLINE_LABEL,
  TOUR_INVITE_DESCRIPTION,
  TOUR_INVITE_TITLE,
  shouldOfferTourInvite,
} from './operator-tour-invite';

/**
 * First-run invite for the operator tour.
 *
 * Rendered by the shell on every dashboard route, because a new operator lands
 * on the agenda, not on Inicio (#1136). It asks before the tour takes over the
 * screen and it is the only automatic entry point: the shell never opens the
 * tour on its own.
 *
 * Declining is permanent for the device (the help button is always there to
 * replay), so the modal cannot become a nag. Escape counts as declining; the
 * scrim does not, so a stray click cannot silence the tour.
 */
@Component({
  selector: 'app-operator-tour-invite',
  standalone: true,
  template: `
    @if (visible()) {
      <div
        class="operator-tour-invite"
        data-testid="operator-tour-invite"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operator-tour-invite-title"
        aria-describedby="operator-tour-invite-description"
      >
        <div class="operator-tour-invite__scrim bg-slate-950/80"></div>

        <div class="operator-tour-invite__card">
          <span class="operator-tour-invite__icon" aria-hidden="true">
            <i class="ri-route-line text-xl"></i>
          </span>

          <h2 id="operator-tour-invite-title" class="operator-tour-invite__title">
            {{ title }}
          </h2>
          <p id="operator-tour-invite-description" class="operator-tour-invite__description">
            {{ description }}
          </p>

          <div class="operator-tour-invite__actions">
            <button
              #acceptButton
              #dialogButton
              type="button"
              data-testid="operator-tour-invite-accept"
              class="operator-tour-invite__accept"
              (click)="accept()"
            >
              {{ acceptLabel }}
            </button>
            <button
              #dialogButton
              type="button"
              data-testid="operator-tour-invite-decline"
              class="operator-tour-invite__decline"
              (click)="decline()"
            >
              {{ declineLabel }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .operator-tour-invite {
        position: fixed;
        inset: 0;
        z-index: 60;
        display: grid;
        place-items: center;
        padding: 1.25rem;
      }

      .operator-tour-invite__scrim {
        position: absolute;
        inset: 0;
      }

      .operator-tour-invite__card {
        position: relative;
        width: 100%;
        max-width: 26rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        border-radius: 1.25rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: #0d1220;
        padding: 1.5rem;
        box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.8);
      }

      .operator-tour-invite__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 2.5rem;
        width: 2.5rem;
        border-radius: 0.9rem;
        background: rgba(124, 92, 255, 0.16);
        color: #a78bfa;
      }

      .operator-tour-invite__title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 700;
        color: #f3f1fa;
      }

      .operator-tour-invite__description {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: #9096ae;
      }

      .operator-tour-invite__actions {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }

      .operator-tour-invite__accept,
      .operator-tour-invite__decline {
        min-height: 2.75rem;
        border-radius: 0.9rem;
        font-size: 0.875rem;
        font-weight: 600;
        transition: background-color 150ms ease, color 150ms ease;
      }

      .operator-tour-invite__accept {
        background: #7c5cff;
        color: #ffffff;
      }

      .operator-tour-invite__accept:hover {
        background: #6b4bf0;
      }

      .operator-tour-invite__decline {
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: transparent;
        color: #b9bdd0;
      }

      .operator-tour-invite__decline:hover {
        color: #f3f1fa;
      }

      .operator-tour-invite__accept:focus-visible,
      .operator-tour-invite__decline:focus-visible {
        outline: 2px solid #9b7bff;
        outline-offset: 2px;
      }

      @media (min-width: 640px) {
        .operator-tour-invite__actions {
          flex-direction: row-reverse;
        }

        .operator-tour-invite__accept,
        .operator-tour-invite__decline {
          flex: 1;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .operator-tour-invite__accept,
        .operator-tour-invite__decline {
          transition: none;
        }
      }
    `,
  ],
})
export class OperatorTourInviteComponent {
  private readonly tour = inject(DASHBOARD_TOUR);
  private readonly acceptButton = viewChild<ElementRef<HTMLButtonElement>>('acceptButton');
  private readonly dialogButtons = viewChildren<ElementRef<HTMLButtonElement>>('dialogButton');

  protected readonly title = TOUR_INVITE_TITLE;
  protected readonly description = TOUR_INVITE_DESCRIPTION;
  protected readonly acceptLabel = TOUR_INVITE_ACCEPT_LABEL;
  protected readonly declineLabel = TOUR_INVITE_DECLINE_LABEL;

  protected readonly visible = signal(shouldOfferTourInvite(this.tour));

  constructor() {
    afterNextRender(() => {
      if (this.visible()) {
        this.acceptButton()?.nativeElement.focus();
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent): void {
    if (!this.visible()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.decline();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const buttons = this.dialogButtons().map((button) => button.nativeElement);
    if (buttons.length === 0) {
      return;
    }

    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.shiftKey ? -1 : 1;
    const next = buttons[(current + delta + buttons.length) % buttons.length];

    event.preventDefault();
    next?.focus();
  }

  protected accept(): void {
    this.visible.set(false);
    void this.tour?.acceptInvite();
  }

  protected decline(): void {
    this.visible.set(false);
    this.tour?.declineInvite();
  }
}
