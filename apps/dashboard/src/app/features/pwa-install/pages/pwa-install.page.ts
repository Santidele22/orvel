import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, signal } from '@angular/core';
import { isIosDevice, isStandaloneDisplay } from '../pwa-display';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
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
        <p>Instalá Orvel en tu teléfono. Cuando abras el ícono, ahí sí iniciás sesión.</p>
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
            <button type="button" (click)="installApp()">Instalar</button>
          } @else {
            <p>
              Abrí esta página en Chrome del celular. En Android, tocá el menú y después Instalar app.
            </p>
          }
        }
      }
      @if (installFeedback()) {
        <p class="pwa-install__hint">{{ installFeedback() }}</p>
      }
    </main>
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
    button {
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
    this.deferredPrompt = null;
    this.hasNativePrompt.set(false);
    (window as OrvelWindow).__ORVEL_DEFERRED_INSTALL_PROMPT = undefined;
    this.installFeedback.set('');
  }
}
