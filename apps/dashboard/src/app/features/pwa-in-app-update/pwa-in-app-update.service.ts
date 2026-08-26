import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { createPwaInAppUpdateController } from './pwa-in-app-update.controller';

@Injectable({ providedIn: 'root' })
export class PwaInAppUpdateService {
  private readonly inner = createPwaInAppUpdateController(
    inject(SwUpdate),
    () => location.reload(),
  );

  readonly updateReady = this.inner.updateReady;

  applyUpdate(): Promise<void> {
    return this.inner.applyUpdate();
  }
}
