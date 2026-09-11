import type { ContactRepository } from '../application/ports/contact-repository';
import type { TemplateRepository } from '../application/ports/template-repository';
import type { Contact } from '../domain/contact';
import type { MessageTemplate } from '../domain/message-template';
import { DEFAULT_TEMPLATES } from '../domain/seed-templates';

export const OPS_STORAGE_KEY = 'orvel-ops.v1';

type Snapshot = {
  version: 1;
  contacts: Contact[];
  templates: MessageTemplate[];
};

export type OpsStoreRepos = {
  contacts: ContactRepository;
  templates: TemplateRepository;
};

export function createLocalStorageRepos(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key = OPS_STORAGE_KEY
): OpsStoreRepos {
  const read = (): Snapshot => {
    const raw = storage.getItem(key);
    if (!raw) {
      const empty: Snapshot = { version: 1, contacts: [], templates: [...DEFAULT_TEMPLATES] };
      storage.setItem(key, JSON.stringify(empty));
      return empty;
    }
    try {
      const parsed = JSON.parse(raw) as Snapshot;
      if (parsed.version !== 1 || !Array.isArray(parsed.contacts) || !Array.isArray(parsed.templates)) {
        throw new Error('OPS_STORE_INVALID');
      }
      return parsed;
    } catch {
      const empty: Snapshot = { version: 1, contacts: [], templates: [...DEFAULT_TEMPLATES] };
      storage.setItem(key, JSON.stringify(empty));
      return empty;
    }
  };

  const write = (snapshot: Snapshot): void => {
    storage.setItem(key, JSON.stringify(snapshot));
  };

  const contacts: ContactRepository = {
    list: async () => read().contacts,
    get: async (id) => read().contacts.find((contact) => contact.id === id) ?? null,
    save: async (contact) => {
      const snapshot = read();
      const index = snapshot.contacts.findIndex((row) => row.id === contact.id);
      if (index === -1) {
        snapshot.contacts.push(contact);
      } else {
        snapshot.contacts[index] = contact;
      }
      write(snapshot);
    },
    saveMany: async (rows) => {
      const snapshot = read();
      for (const contact of rows) {
        const index = snapshot.contacts.findIndex((row) => row.id === contact.id);
        if (index === -1) {
          snapshot.contacts.push(contact);
        } else {
          snapshot.contacts[index] = contact;
        }
      }
      write(snapshot);
    },
    delete: async (id) => {
      const snapshot = read();
      snapshot.contacts = snapshot.contacts.filter((contact) => contact.id !== id);
      write(snapshot);
    }
  };

  const templates: TemplateRepository = {
    list: async () => read().templates,
    get: async (id) => read().templates.find((template) => template.id === id) ?? null,
    save: async (template) => {
      const snapshot = read();
      const index = snapshot.templates.findIndex((row) => row.id === template.id);
      if (index === -1) {
        snapshot.templates.push(template);
      } else {
        snapshot.templates[index] = template;
      }
      write(snapshot);
    },
    delete: async (id) => {
      const snapshot = read();
      snapshot.templates = snapshot.templates.filter((template) => template.id !== id);
      write(snapshot);
    }
  };

  return { contacts, templates };
}
