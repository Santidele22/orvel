import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { isStandaloneDisplay } from './features/pwa-install/pwa-display';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly bootSplashVisible = signal(isStandaloneDisplay());

  onRouteActivate(): void {
    this.bootSplashVisible.set(false);
  }
}
