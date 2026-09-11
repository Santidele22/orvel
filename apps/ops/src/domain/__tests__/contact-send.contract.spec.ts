import { describe, expect, it } from 'vitest';
import { applyOutboundSend, createContact } from '../contact';

describe('applyOutboundSend', () => {
  it('moves nuevo to contactado and records history', () => {
    const contact = createContact({
      id: 'c1',
      name: 'Peluquería Norte',
      phoneRaw: '+54 9 294 412-3390',
      city: 'Bariloche',
      category: 'peluqueria',
      notes: ''
    });
    expect(contact.stage).toBe('nuevo');
    const sent = applyOutboundSend(
      contact,
      { id: 't1', name: 'Primer contacto' },
      '2026-09-06T15:00:00.000Z'
    );
    expect(sent.stage).toBe('contactado');
    expect(sent.lastContactedAt).toBe('2026-09-06T15:00:00.000Z');
    expect(sent.history).toEqual([
      {
        at: '2026-09-06T15:00:00.000Z',
        templateId: 't1',
        templateName: 'Primer contacto'
      }
    ]);
  });

  it('does not regress a later stage back to contactado', () => {
    const contact = createContact({
      id: 'c2',
      name: 'Barber Sur',
      phoneRaw: '2944008821',
      city: 'Bariloche',
      category: 'barberia',
      notes: '',
      stage: 'respondio'
    });
    const sent = applyOutboundSend(
      contact,
      { id: 't2', name: 'Seguimiento' },
      '2026-09-06T16:00:00.000Z'
    );
    expect(sent.stage).toBe('respondio');
  });
});
