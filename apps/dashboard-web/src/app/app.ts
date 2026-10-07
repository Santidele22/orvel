import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root of the web target.
 *
 * Deliberately thinner than the PWA root (`apps/dashboard/src/app/app.ts`): no boot splash, no
 * in-app update banner, no service-worker retry — none of that machinery exists in this artifact.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
export class App {}
