import { createOpsFacade, type OpsFacade } from '../application/ops-facade';
import { createLocalStorageRepos } from './local-storage.store';
import { WindowWhatsAppGateway } from './window-whatsapp.gateway';

export function createBrowserOps(storage: Storage = window.localStorage): OpsFacade {
  const repos = createLocalStorageRepos(storage);
  return createOpsFacade({
    contacts: repos.contacts,
    templates: repos.templates,
    whatsapp: new WindowWhatsAppGateway(),
    clock: { nowIso: () => new Date().toISOString() },
    ids: { next: () => crypto.randomUUID() }
  });
}
