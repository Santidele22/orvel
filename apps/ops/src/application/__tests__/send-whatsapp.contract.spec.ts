import { describe, expect, it } from 'vitest';
import { createContact } from '../../domain/contact';
import type { MessageTemplate } from '../../domain/message-template';
import { createOpsFacade } from '../ops-facade';
import { MemoryOpsStore } from './memory-ops-store';

const template: MessageTemplate = {
  id: 'tmpl-seguimiento',
  name: 'Seguimiento',
  category: 'Seguimiento',
  body: 'Hola {nombre}, te vuelvo a escribir. Están en {ciudad}.'
};

describe('sendWhatsApp', () => {
  it('opens wa.me, moves nuevo to contactado, and persists history', async () => {
    const store = new MemoryOpsStore();
    const opened: string[] = [];
    const contact = createContact({
      id: 'c1',
      name: 'Estética Bianco',
      phoneRaw: '+54 9 294 455-7712',
      city: 'Bariloche',
      category: 'estetica',
      notes: ''
    });
    await store.save(contact);
    await store.saveTemplate(template);
    const ops = createOpsFacade({
      contacts: store.contactRepo(),
      templates: store.templateRepo(),
      whatsapp: { open: async (url) => { opened.push(url); } },
      clock: { nowIso: () => '2026-09-06T18:00:00.000Z' },
      ids: { next: () => 'id-1' }
    });

    const result = await ops.sendWhatsApp('c1', 'tmpl-seguimiento');

    expect(opened).toEqual([
      'https://wa.me/5492944557712?text=Hola%20Est%C3%A9tica%20Bianco%2C%20te%20vuelvo%20a%20escribir.%20Est%C3%A1n%20en%20Bariloche.'
    ]);
    expect(result.contact.stage).toBe('contactado');
    expect(result.contact.lastContactedAt).toBe('2026-09-06T18:00:00.000Z');
    const persisted = await store.get('c1');
    expect(persisted?.history[0]?.templateId).toBe('tmpl-seguimiento');
  });

  it('rejects when the phone cannot be normalized', async () => {
    const store = new MemoryOpsStore();
    await store.save(
      createContact({
        id: 'c-bad',
        name: 'Sin tel',
        phoneRaw: '12',
        city: 'Bariloche',
        category: 'otro',
        notes: ''
      })
    );
    await store.saveTemplate(template);
    const ops = createOpsFacade({
      contacts: store.contactRepo(),
      templates: store.templateRepo(),
      whatsapp: { open: async () => undefined },
      clock: { nowIso: () => '2026-09-06T18:00:00.000Z' },
      ids: { next: () => 'id-1' }
    });
    await expect(ops.sendWhatsApp('c-bad', 'tmpl-seguimiento')).rejects.toThrow('PHONE_INVALID');
  });
});
