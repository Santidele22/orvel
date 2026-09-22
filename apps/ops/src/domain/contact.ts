import type { ContactCategory } from './category';
import { normalizePhoneForWhatsApp } from './phone';
import type { StageId } from './stage';

export type ContactHistoryEntry = {
  at: string;
  templateId: string;
  templateName: string;
};

export type Contact = {
  id: string;
  name: string;
  phoneRaw: string;
  phoneNormalized: string | null;
  city: string;
  address: string;
  rating: number | null;
  category: ContactCategory;
  notes: string;
  stage: StageId;
  lastContactedAt: string | null;
  history: ContactHistoryEntry[];
};

export type CreateContactInput = {
  id: string;
  name: string;
  phoneRaw: string;
  city: string;
  address?: string;
  rating?: number | null;
  category: ContactCategory;
  notes: string;
  stage?: StageId;
};

export function createContact(input: CreateContactInput): Contact {
  return {
    id: input.id,
    name: input.name.trim(),
    phoneRaw: input.phoneRaw.trim(),
    phoneNormalized: normalizePhoneForWhatsApp(input.phoneRaw),
    city: input.city.trim(),
    address: input.address?.trim() ?? '',
    rating: input.rating ?? null,
    category: input.category,
    notes: input.notes,
    stage: input.stage ?? 'nuevo',
    lastContactedAt: null,
    history: []
  };
}

export function moveStage(contact: Contact, stage: StageId): Contact {
  return { ...contact, stage };
}

export function applyOutboundSend(
  contact: Contact,
  template: { id: string; name: string },
  atIso: string
): Contact {
  return {
    ...contact,
    stage: contact.stage === 'nuevo' ? 'contactado' : contact.stage,
    lastContactedAt: atIso,
    history: [
      ...contact.history,
      {
        at: atIso,
        templateId: template.id,
        templateName: template.name
      }
    ]
  };
}
