import { signal } from '@angular/core';
import { Observable } from 'rxjs';

export type PwaUpdateBridge = {
  isEnabled: boolean;
  versionUpdates: Observable<{ type: string }>;
  checkForUpdate: () => Promise<boolean>;
  activateUpdate: () => Promise<boolean>;
};

export function createPwaInAppUpdateController(bridge: PwaUpdateBridge, reload: () => void) {
  const updateReady = signal(false);

  if (bridge.isEnabled) {
    bridge.versionUpdates.subscribe((event) => {
      if (event.type === 'VERSION_READY') {
        updateReady.set(true);
      }
    });
    void bridge.checkForUpdate().catch(() => undefined);
  }

  return {
    updateReady,
    applyUpdate: async () => {
      await bridge.activateUpdate();
      reload();
    },
  };
}
