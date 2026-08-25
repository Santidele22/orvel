import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, signal } from '@angular/core';
import { isIosDevice, isStandaloneDisplay } from '../pwa-display';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type OrvelWindow = Window & {
  __ORVEL_DEFERRED_INSTALL_PROMPT?: BeforeInstallPromptEvent;
};

@Component({
  selector: 'app-pwa-install-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="pwa-install">
      <img
        class="pwa-install__logo"
        src="/dashboard/icons/icon-192x192.png"
        width="96"
        height="96"
        alt="Orvel"
      />
      @if (alreadyInstalled()) {
        <h1>Listo</h1>
        <p>Orvel ya está instalada. Abrí el ícono en tu teléfono para usarla.</p>
      } @else {
        <h1>Instalá la app</h1>
        <p>Tocá Instalar y queda en tu pantalla de inicio. Sin tienda. Cuando abras el ícono, ahí iniciás sesión.</p>
        @if (isIos()) {
          <ol class="pwa-install__steps">
            <li>
              <span>1</span>
              Tocá <i class="ri-share-line" aria-hidden="true"></i> Compartir
            </li>
            <li>
              <span>2</span>
              Elegí Agregar a pantalla de inicio
            </li>
          </ol>
        } @else {
          @if (canPromptNativeInstall()) {
            <button type="button" class="pwa-install__cta" (click)="installApp()">Instalar</button>
          } @else {
            <p>
              Abrí esta página en Chrome del celular. En Android, tocá Instalar.
            </p>
          }
        }
      }
      @if (installFeedback()) {
        <p class="pwa-install__hint">{{ installFeedback() }}</p>
      }
    </main>
    @if (isInstallSuccessModalOpen()) {
      <div class="pwa-install-modal">
        <button
          type="button"
          class="pwa-install-modal__overlay"
          data-testid="pwa-install-success-modal-overlay"
          aria-label="Cerrar"
          (click)="closeInstallSuccessModal()"
        ></button>
        <div
          class="pwa-install-modal__dialog"
          data-testid="pwa-install-success-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-success-modal-title"
        >
          <div class="pwa-install-modal__header">
            <h3 id="pwa-install-success-modal-title">Aplicación instalada</h3>
            <button
              type="button"
              class="pwa-install-modal__close"
              data-testid="pwa-install-success-modal-close"
              (click)="closeInstallSuccessModal()"
            >
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </div>
          <div class="pwa-install-modal__body">
            <div class="pwa-install-modal__icon">
              <i class="ri-checkbox-circle-line" aria-hidden="true"></i>
            </div>
            <p>Ya está en tu pantalla de inicio.</p>
            <button type="button" class="pwa-install-modal__done" (click)="closeInstallSuccessModal()">
              Entendido
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .pwa-install {
      box-sizing: border-box;
      min-height: 100%;
      padding: 48px 24px;
      text-align: center;
      background: var(--or-bg-primary);
      color: var(--or-text-primary);
      font-family: var(--or-font-family);
    }
    .pwa-install__logo {
      display: block;
      width: 96px;
      height: 96px;
      margin: 0 auto 24px;
      border-radius: 24px;
    }
    h1 { margin: 0 0 16px; font-size: var(--or-font-h2); }
    p { max-width: 28rem; margin: 0 auto 24px; color: var(--or-text-secondary); }
    .pwa-install__cta {
      padding: 16px 32px;
      border: 0;
      border-radius: 999px;
      background: var(--or-primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .pwa-install-modal {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--or-space-6);
    }
    .pwa-install-modal__overlay {
      position: absolute;
      inset: 0;
      border: 0;
      background: rgb(var(--or-bg-primary-rgb) / 0.72);
      cursor: pointer;
    }
    .pwa-install-modal__dialog {
      position: relative;
      width: 100%;
      max-width: 28rem;
      padding: var(--or-space-8);
      border: 1px solid var(--or-border);
      border-radius: var(--or-radius-lg);
      background: var(--or-bg-secondary);
      box-shadow: var(--or-shadow-lg);
    }
    .pwa-install-modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--or-space-6);
    }
    .pwa-install-modal__header h3 {
      margin: 0;
      font-size: var(--or-font-h3);
      color: var(--or-text-primary);
    }
    .pwa-install-modal__close {
      border: 0;
      background: transparent;
      color: var(--or-text-secondary);
      cursor: pointer;
      font-size: 1.5rem;
    }
    .pwa-install-modal__body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: var(--or-space-6);
    }
    .pwa-install-modal__icon {
      display: flex;
      width: 5rem;
      height: 5rem;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: color-mix(in srgb, var(--or-success) 12%, transparent);
      color: var(--or-success);
      font-size: 2.5rem;
    }
    .pwa-install-modal__body p {
      margin: 0;
      color: var(--or-text-secondary);
    }
    .pwa-install-modal__done {
      width: 100%;
      padding: 16px 32px;
      border: 0;
      border-radius: 999px;
      background: var(--or-primary);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .pwa-install__steps {
      max-width: 22rem;
      margin: 0 auto 24px;
      padding: 0;
      list-style: none;
      text-align: left;
    }
    .pwa-install__steps li {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
      color: var(--or-text-primary);
    }
    .pwa-install__steps span {
      flex: 0 0 1.75rem;
      height: 1.75rem;
      border-radius: 999px;
      background: var(--or-primary);
      color: #fff;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pwa-install__hint { margin-top: 24px; }
  `,
})
export class PwaInstallPage implements OnInit {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  protected readonly alreadyInstalled = signal(false);
  protected readonly isIos = signal(false);
  protected readonly hasNativePrompt = signal(false);
  protected readonly installFeedback = signal('');
  protected readonly isInstallSuccessModalOpen = signal(false);

  ngOnInit(): void {
    this.alreadyInstalled.set(isStandaloneDisplay());
    this.isIos.set(
      isIosDevice(
        navigator.userAgent,
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      ),
    );
    const stashed = (window as OrvelWindow).__ORVEL_DEFERRED_INSTALL_PROMPT;
    if (stashed) {
      this.deferredPrompt = stashed;
      this.hasNativePrompt.set(true);
    }
  }

  @HostListener('window:beforeinstallprompt', ['$event'])
  protected onBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    this.deferredPrompt = event as BeforeInstallPromptEvent;
    this.hasNativePrompt.set(true);
  }

  @HostListener('window:appinstalled')
  protected onAppInstalled(): void {
    this.isInstallSuccessModalOpen.set(true);
  }

  protected closeInstallSuccessModal(): void {
    this.isInstallSuccessModalOpen.set(false);
  }

  protected canPromptNativeInstall(): boolean {
    return this.hasNativePrompt() && !this.isIos() && !this.alreadyInstalled();
  }

  protected async installApp(): Promise<void> {
    if (this.isIos()) {
      return;
    }
    await this.runNativeInstallPrompt();
  }

  private async runNativeInstallPrompt(): Promise<void> {
    if (!this.deferredPrompt) {
      this.installFeedback.set('Abrí esta página en Chrome del celular.');
      return;
    }

    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.hasNativePrompt.set(false);
    (window as OrvelWindow).__ORVEL_DEFERRED_INSTALL_PROMPT = undefined;
    this.installFeedback.set('');
    if (outcome === 'accepted') {
      this.isInstallSuccessModalOpen.set(true);
    }
  }
}
