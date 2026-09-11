import { describe, expect, it } from 'vitest';
import { createContact } from '../../domain/contact';
import { createOpsFacade } from '../ops-facade';
import { MemoryOpsStore } from './memory-ops-store';

describe('confirmImport', () => {
  it('imports new rows and skips duplicates by normalized phone', async () => {
    const store = new MemoryOpsStore();
    await store.save(
      createContact({
        id: 'existing',
        name: 'Uñas Reina',
        phoneRaw: '+54 9 294 466-2210',
        city: 'Dina Huapi',
        category: 'unas',
        notes: ''
      })
    );
    const ops = createOpsFacade({
      contacts: store.contactRepo(),
      templates: store.templateRepo(),
      whatsapp: { open: async () => undefined },
      clock: { nowIso: () => '2026-09-06T18:00:00.000Z' },
      ids: {
        next: (() => {
          let n = 0;
          return () => `new-${++n}`;
        })()
      }
    });
    const raw = [
      'Title\tAddress\tPhone',
      'Uñas Reina\tDina Huapi, Río Negro, Argentina\t0294 15 466-2210',
      'Barbería Andes\tBariloche, Río Negro, Argentina\t2944027765'
    ].join('\n');

    const preview = await ops.previewImport(raw);
    expect(preview.filter((row) => row.duplicate)).toHaveLength(1);
    const result = await ops.confirmImport(raw);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    const listed = await ops.listContacts();
    expect(listed).toHaveLength(2);
    expect(listed.some((contact) => contact.name === 'Barbería Andes')).toBe(true);
  });
});
