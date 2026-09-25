import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { EMPTY } from 'rxjs';
import { createPwaInAppUpdateController } from './pwa-in-app-update.controller';

@Injectable({ providedIn: 'root' })
export class PwaInAppUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly inner = createPwaInAppUpdateController(
    this.swUpdate.isEnabled
      ? this.swUpdate
      : {
          isEnabled: false,
          versionUpdates: EMPTY,
          checkForUpdate: async () => false,
          activateUpdate: async () => false
        },
    () => location.reload(),
  );

  readonly updateReady = this.inner.updateReady;

  applyUpdate(): Promise<void> {
    return this.inner.applyUpdate();
  }
}
