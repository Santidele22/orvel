import type { Contact } from '../../domain/contact';
import type { MessageTemplate } from '../../domain/message-template';
import type { ContactRepository } from '../ports/contact-repository';
import type { TemplateRepository } from '../ports/template-repository';

export class MemoryOpsStore {
  private readonly contacts = new Map<string, Contact>();
  private readonly templates = new Map<string, MessageTemplate>();

  contactRepo(): ContactRepository {
    return {
      list: async () => [...this.contacts.values()],
      get: async (id) => this.contacts.get(id) ?? null,
      save: async (contact) => {
        this.contacts.set(contact.id, contact);
      },
      saveMany: async (contacts) => {
        for (const contact of contacts) {
          this.contacts.set(contact.id, contact);
        }
      },
      delete: async (id) => {
        this.contacts.delete(id);
      }
    };
  }

  templateRepo(): TemplateRepository {
    return {
      list: async () => [...this.templates.values()],
      get: async (id) => this.templates.get(id) ?? null,
      save: async (template) => {
        this.templates.set(template.id, template);
      },
      delete: async (id) => {
        this.templates.delete(id);
      }
    };
  }

  async save(contact: Contact): Promise<void> {
    this.contacts.set(contact.id, contact);
  }

  async get(id: string): Promise<Contact | null> {
    return this.contacts.get(id) ?? null;
  }

  async saveTemplate(template: MessageTemplate): Promise<void> {
    this.templates.set(template.id, template);
  }
}
