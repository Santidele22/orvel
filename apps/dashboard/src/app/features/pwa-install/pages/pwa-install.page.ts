import { CommonModule } from '@angular/common';
import { Component, HostListener, signal } from '@angular/core';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

@Component({
  selector: 'app-pwa-install-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="pwa-install">
      <h1>Instalá la app</h1>
      <p>
        Instalá Orvel en tu teléfono desde el navegador. Cuando abras el ícono, ahí sí iniciás sesión.
      </p>
      <button type="button" (click)="installApp()">Instalar app</button>
      @if (showManualInstructions()) {
        <p class="pwa-install__hint">
          En Android, el navegador te ofrece instalar. En iOS: Compartir → Agregar a pantalla de inicio.
        </p>
      }
    </main>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: auto;
    }

    .pwa-install {
      box-sizing: border-box;
      min-height: 100%;
      padding: 48px 24px;
      text-align: center;
      background: var(--or-bg-primary);
      color: var(--or-text-primary);
      font-family: var(--or-font-family);
    }

    h1 {
      margin: 0 0 16px;
      font-size: var(--or-font-h2);
    }

    p {
      max-width: 28rem;
      margin: 0 auto 24px;
      color: var(--or-text-secondary);
    }

    button {
      padding: 16px 32px;
      border: 0;
      border-radius: 999px;
      background: var(--or-primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }

    .pwa-install__hint {
      margin-top: 24px;
    }
  `,
})
export class PwaInstallPage {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  protected readonly showManualInstructions = signal(false);

  @HostListener('window:beforeinstallprompt', ['$event'])
  protected onBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
  }

  protected async installApp(): Promise<void> {
    if (!this.deferredPrompt) {
      this.showManualInstructions.set(true);
      return;
    }

    await this.deferredPrompt.prompt();
    this.deferredPrompt = null;
  }
}
