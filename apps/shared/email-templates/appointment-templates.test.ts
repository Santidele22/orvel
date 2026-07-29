import { describe, expect, it } from 'vitest';
import {
  renderAppointmentConfirmationEmail,
  renderAppointmentReminder24hEmail,
  renderAppointmentCancellationEmail,
  renderAppointmentRescheduleEmail,
  renderAppointmentBusinessNotificationEmail,
  renderAppointmentBusinessCancellationEmail,
  formatArgentinaAppointmentDate,
  type AppointmentTemplateData,
  type EmailPayload,
} from './appointment-templates.ts';

const MINIMAL_DATA: AppointmentTemplateData = {
  customer: { name: 'Cliente Test', email: 'cliente@test.test' },
  business: { name: 'Negocio Test', address: 'Dirección Test 123' },
  service: { name: 'Corte de prueba' },
  date: new Date('2026-07-04T15:45:00.000Z'),
  time: '12:45',
  duration: 45,
  price: 12000,
  contact: { phone: '+5411123456', email: 'soporte@test.test' },
  links: {
    view: 'https://orvel.test/turno/123',
    cancel: 'https://orvel.test/turno/123/cancel',
    reschedule: 'https://orvel.test/turno/123/reschedule',
  },
};

function expectValidEmailPayload(result: EmailPayload) {
  expect(result).toBeDefined();
  expect(typeof result.subject).toBe('string');
  expect(result.subject.length).toBeGreaterThan(0);
  expect(typeof result.html).toBe('string');
  expect(result.html.length).toBeGreaterThan(0);
  expect(result.html).toMatch(/<!doctype\s+html>/i);
}

function expectContainsAppointmentDetails(html: string) {
  expect(html).toContain('Negocio Test');
  expect(html).toContain('Dirección Test 123');
  expect(html).toContain('Corte de prueba');
  expect(html).toContain('<strong>Fecha:</strong>');
  expect(html).toContain('<strong>Horario:</strong>');
  expect(html).toContain('<strong>Duración:</strong>');
  expect(html).toContain('<strong>Precio:</strong>');
}

describe('appointment-templates', () => {
  describe('formatArgentinaAppointmentDate', () => {
    it('formats UTC timestamp to Argentina date', () => {
      // 2026-07-04T15:45:00Z = 2026-07-04 12:45 ART (UTC-3)
      expect(formatArgentinaAppointmentDate('2026-07-04T15:45:00.000Z')).toBe('04/07/2026');
    });

    it('handles Date object input', () => {
      expect(formatArgentinaAppointmentDate(new Date('2026-01-01T02:30:00.000Z'))).toBe('31/12/2025');
    });

    it('returns placeholder for invalid date', () => {
      expect(formatArgentinaAppointmentDate(null as unknown as string)).toBe('--/--/----');
      expect(formatArgentinaAppointmentDate('not-a-date')).toBe('--/--/----');
    });
  });

  describe('renderAppointmentConfirmationEmail', () => {
    it('produces valid full email HTML', () => {
      const result = renderAppointmentConfirmationEmail(MINIMAL_DATA);
      expectValidEmailPayload(result);
      expect(result.subject).toBe('Turno confirmado');
      expect(result.html).toContain('gracias por confiar en nosotros');
    });
  });

  describe('renderAppointmentReminder24hEmail', () => {
    it('produces valid email with reminder content', () => {
      const result = renderAppointmentReminder24hEmail(MINIMAL_DATA);
      expectValidEmailPayload(result);
      expect(result.subject).toMatch(/recordatorio|24/i);
      expectContainsAppointmentDetails(result.html);
    });
  });

  describe('renderAppointmentCancellationEmail', () => {
    it('produces valid cancellation email', () => {
      const result = renderAppointmentCancellationEmail(MINIMAL_DATA);
      expectValidEmailPayload(result);
      expect(result.subject).toMatch(/cancelad/i);
      expectContainsAppointmentDetails(result.html);
    });
  });

  describe('renderAppointmentRescheduleEmail', () => {
    it('produces valid reschedule email', () => {
      const result = renderAppointmentRescheduleEmail(MINIMAL_DATA);
      expectValidEmailPayload(result);
      expect(result.subject).toMatch(/reprogramad/i);
      expectContainsAppointmentDetails(result.html);
    });
  });

  describe('renderAppointmentBusinessNotificationEmail', () => {
    it('produces valid business notification email', () => {
      const result = renderAppointmentBusinessNotificationEmail(MINIMAL_DATA);
      expectValidEmailPayload(result);
      expect(result.subject).toMatch(/nuevo turno/i);
      expect(result.html).toContain('Negocio Test');
      expect(result.html).toContain('Cliente Test');
    });
  });

  describe('renderAppointmentBusinessCancellationEmail', () => {
    it('produces valid business cancellation email', () => {
      const result = renderAppointmentBusinessCancellationEmail(MINIMAL_DATA);
      expectValidEmailPayload(result);
      expect(result.subject).toMatch(/cancelad/i);
      expect(result.html).toContain('Negocio Test');
    });
  });
});
