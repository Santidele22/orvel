import { Component, inject } from '@angular/core';
import { PwaInAppUpdateService } from './pwa-in-app-update.service';

@Component({
  selector: 'app-pwa-in-app-update-banner',
  standalone: true,
  template: `
    @if (updateReady()) {
      <div
        class="pwa-in-app-update"
        data-testid="pwa-in-app-update-banner"
        role="status"
        aria-live="polite"
      >
        <p>Hay una actualización. Tocá para usarla.</p>
        <button type="button" data-testid="pwa-in-app-update-apply" (click)="applyUpdate()">
          Usar ahora
        </button>
      </div>
    }
  `,
  styles: `
    .pwa-in-app-update {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 60;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--or-space-3);
      padding: calc(var(--or-space-3) + env(safe-area-inset-top, 0px)) var(--or-space-4) var(--or-space-3);
      border-bottom: 1px solid var(--or-border);
      background: var(--or-bg-secondary);
      color: var(--or-text-primary);
      font-family: var(--or-font-family);
      box-shadow: var(--or-shadow-md);
    }
    .pwa-in-app-update p {
      margin: 0;
      flex: 1 1 12rem;
      font-size: var(--or-font-body);
    }
    .pwa-in-app-update button {
      padding: var(--or-space-2) var(--or-space-4);
      border: 0;
      border-radius: 999px;
      background: var(--or-primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .pwa-in-app-update button:hover {
      background: var(--or-primary-hover);
    }
    .pwa-in-app-update button:focus-visible {
      outline: 2px solid var(--or-primary-light);
      outline-offset: 2px;
    }
  `,
})
export class PwaInAppUpdateBannerComponent {
  private readonly pwaUpdate = inject(PwaInAppUpdateService);
  protected readonly updateReady = this.pwaUpdate.updateReady;

  protected applyUpdate(): void {
    void this.pwaUpdate.applyUpdate();
  }
}
