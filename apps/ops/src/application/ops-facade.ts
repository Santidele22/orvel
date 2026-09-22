import {
  applyOutboundSend,
  computePipelineStats,
  createContact,
  interpolateTemplate,
  moveStage,
  parseImportTable,
  previewImportRows,
  whatsappUrl,
  type Contact,
  type ImportPreviewRow,
  type MessageTemplate,
  type PipelineStats,
  type StageId
} from '../domain';
import type { Clock, IdGenerator } from './ports/clock';
import type { ContactRepository } from './ports/contact-repository';
import type { TemplateRepository } from './ports/template-repository';
import type { WhatsAppGateway } from './ports/whatsapp-gateway';

export type OpsDeps = {
  contacts: ContactRepository;
  templates: TemplateRepository;
  whatsapp: WhatsAppGateway;
  clock: Clock;
  ids: IdGenerator;
};

export type ImportResult = {
  imported: number;
  skipped: number;
};

export type SendResult = {
  contact: Contact;
  url: string;
};

export type ContactPatch = {
  name?: string;
  phoneRaw?: string;
  city?: string;
  category?: Contact['category'];
  notes?: string;
};

export type OpsFacade = {
  listContacts(): Promise<Contact[]>;
  listTemplates(): Promise<MessageTemplate[]>;
  pipelineStats(): Promise<PipelineStats>;
  moveStage(contactId: string, stage: StageId): Promise<Contact>;
  updateContact(contactId: string, patch: ContactPatch): Promise<Contact>;
  deleteContact(contactId: string): Promise<void>;
  sendWhatsApp(contactId: string, templateId: string): Promise<SendResult>;
  previewImport(raw: string): Promise<ImportPreviewRow[]>;
  confirmImport(raw: string): Promise<ImportResult>;
  saveTemplate(template: MessageTemplate): Promise<MessageTemplate>;
  deleteTemplate(id: string): Promise<void>;
};

export function createOpsFacade(deps: OpsDeps): OpsFacade {
  return {
    listContacts: () => deps.contacts.list(),
    listTemplates: () => deps.templates.list(),
    pipelineStats: async () => computePipelineStats(await deps.contacts.list()),
    moveStage: async (contactId, stage) => {
      const contact = await requireContact(deps.contacts, contactId);
      const updated = moveStage(contact, stage);
      await deps.contacts.save(updated);
      return updated;
    },
    updateContact: async (contactId, patch) => {
      const contact = await requireContact(deps.contacts, contactId);
      const updated = createContact({
        id: contact.id,
        name: patch.name ?? contact.name,
        phoneRaw: patch.phoneRaw ?? contact.phoneRaw,
        city: patch.city ?? contact.city,
        address: contact.address,
        rating: contact.rating,
        category: patch.category ?? contact.category,
        notes: patch.notes ?? contact.notes,
        stage: contact.stage
      });
      updated.lastContactedAt = contact.lastContactedAt;
      updated.history = contact.history;
      await deps.contacts.save(updated);
      return updated;
    },
    deleteContact: (contactId) => deps.contacts.delete(contactId),
    sendWhatsApp: async (contactId, templateId) => {
      const contact = await requireContact(deps.contacts, contactId);
      const template = await deps.templates.get(templateId);
      if (!template) {
        throw new Error('TEMPLATE_NOT_FOUND');
      }
      if (!contact.phoneNormalized) {
        throw new Error('PHONE_INVALID');
      }
      const text = interpolateTemplate(template.body, {
        nombre: contact.name,
        ciudad: contact.city
      });
      const url = whatsappUrl(contact.phoneNormalized, text);
      await deps.whatsapp.open(url);
      const updated = applyOutboundSend(contact, template, deps.clock.nowIso());
      await deps.contacts.save(updated);
      return { contact: updated, url };
    },
    previewImport: async (raw) => {
      const existing = await deps.contacts.list();
      return previewImportRows(parseImportTable(raw), existing);
    },
    confirmImport: async (raw) => {
      const existing = await deps.contacts.list();
      const preview = previewImportRows(parseImportTable(raw), existing);
      const toImport = preview.filter((row) => row.selected && row.phoneNormalized);
      const created = toImport.map((row) =>
        createContact({
          id: deps.ids.next(),
          name: row.name,
          phoneRaw: row.phoneRaw,
          city: row.city,
          address: row.address,
          rating: row.rating,
          category: row.category,
          notes: ''
        })
      );
      if (created.length > 0) {
        await deps.contacts.saveMany(created);
      }
      return {
        imported: created.length,
        skipped: preview.length - created.length
      };
    },
    saveTemplate: async (template) => {
      const stored: MessageTemplate = {
        ...template,
        id: template.id || deps.ids.next()
      };
      await deps.templates.save(stored);
      return stored;
    },
    deleteTemplate: (id) => deps.templates.delete(id)
  };
}

async function requireContact(repo: ContactRepository, id: string): Promise<Contact> {
  const contact = await repo.get(id);
  if (!contact) {
    throw new Error('CONTACT_NOT_FOUND');
  }
  return contact;
}
