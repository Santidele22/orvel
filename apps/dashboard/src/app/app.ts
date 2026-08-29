import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PwaInAppUpdateBannerComponent } from './features/pwa-in-app-update/pwa-in-app-update-banner.component';
import { shouldShowBootSplash } from './features/pwa-install/pwa-display';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PwaInAppUpdateBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly bootSplashVisible = signal(shouldShowBootSplash());
  private readonly splashHideTimeoutId = setTimeout(() => {
    this.bootSplashVisible.set(false);
  }, 8000);

  constructor() {
    this.markBooted();
  }

  onRouteActivate(): void {
    clearTimeout(this.splashHideTimeoutId);
    this.bootSplashVisible.set(false);
  }

  private markBooted(): void {
    try {
      (window as Window & { __ORVEL_BOOTED?: boolean }).__ORVEL_BOOTED = true;
      sessionStorage.removeItem('orvel-boot-retry');
    } catch {
      // Private mode or blocked storage must not fail boot.
    }
  }
}
