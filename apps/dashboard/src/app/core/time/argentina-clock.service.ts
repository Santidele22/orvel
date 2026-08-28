import { DestroyRef, Injectable, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ArgentinaClockService {
  readonly now = signal(new Date());

  constructor() {
    const interval = setInterval(() => {
      this.now.set(new Date());
    }, 60_000);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
    });
  }
}
