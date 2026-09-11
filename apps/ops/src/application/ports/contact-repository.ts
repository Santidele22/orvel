import type { Contact } from '../../domain/contact';

export type ContactRepository = {
  list(): Promise<Contact[]>;
  get(id: string): Promise<Contact | null>;
  save(contact: Contact): Promise<void>;
  saveMany(contacts: Contact[]): Promise<void>;
  delete(id: string): Promise<void>;
};
