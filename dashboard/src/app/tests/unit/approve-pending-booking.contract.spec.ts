import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { BookingCrudService } from '@orvel/booking/application';
import type { BookingRecord } from '@orvel/booking/application';

const REPO_ROOT = resolve(process.cwd(), '../..');
const PAGE_HTML = resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.html');
const PAGE_TS = resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.ts');
const BOOKING_RECORD = join(REPO_ROOT, 'packages/booking/src/application/booking-record.ts');
const BOOKING_CRUD = join(REPO_ROOT, 'packages/booking/src/application/booking-crud.service.ts');

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+|async\\s+)*${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }

  return sourceText.slice(signatureStart);
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function latestUpdateBookingStatusBody(sql: string): string {
  const cleanSql = stripSqlComments(sql);
  const pattern =
    /create\s+or\s+replace\s+function\s+public\.update_booking_status\s*\([\s\S]*?\)\s*returns[\s\S]*?as\s+(\$[a-z_0-9]*\$)([\s\S]*?)\1/gi;
  const matches = [...cleanSql.matchAll(pattern)];
  return matches.at(-1)?.[2] ?? '';
}

function sampleRecord(estado: BookingRecord['estado']): BookingRecord {
  return {
    id: `b-${estado}`,
    fecha: new Date('2026-08-27T00:00:00.000Z'),
    hora: '10:00',
    duracionMinutos: 30,
    estado,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z')
  };
}

describe('operator approve pending booking', () => {
  it('maps DB pending to pendiente, not confirmado', () => {
    const source = read(BOOKING_RECORD);

    expect(source).toMatch(/pending:\s*'pendiente'/);
    expect(source).not.toMatch(/pending:\s*'confirmado'/);
    expect(source).toMatch(/pendiente:\s*'pending'/);
  });

  it('keeps pending bookings on the agenda via getAgendados', () => {
    const crud = new BookingCrudService({} as never);
    const items = [
      sampleRecord('pendiente'),
      sampleRecord('confirmado'),
      sampleRecord('en-proceso'),
      sampleRecord('cancelado')
    ];

    const agendados = crud.getAgendados(items);

    expect(agendados.map((item) => item.estado)).toEqual(['pendiente', 'confirmado', 'en-proceso']);
  });

  it('approvePending calls update_booking_status with confirmed, not booked', async () => {
    const updateStatus = vi.fn().mockResolvedValue({
      status: 200,
      data: { bookingId: 'b-1', status: 'confirmed' }
    });
    const crud = new BookingCrudService({ updateStatus } as never);

    await expect(crud.approvePending('b-1', 'admin-1')).resolves.toEqual({
      bookingId: 'b-1',
      status: 'confirmed'
    });
    expect(updateStatus).toHaveBeenCalledWith({
      bookingId: 'b-1',
      status: 'confirmed',
      performedBy: 'admin-1'
    });

    const crudSource = read(BOOKING_CRUD);
    const body = methodBody(crudSource, 'approvePending');
    expect(body).toMatch(/status:\s*['"]confirmed['"]/);
    expect(body).not.toMatch(/booked/);
  });

  it('shows Aprobar only for pendiente and opens a confirm modal like cancel', () => {
    const html = read(PAGE_HTML);
    const ts = read(PAGE_TS);

    expect(html).toMatch(/data-testid=["']turno-admin-approve-action["']/);
    expect(html).toMatch(/turno\.estado\s*===\s*['"]pendiente['"][\s\S]{0,400}turno-admin-approve-action|turno-admin-approve-action[\s\S]{0,400}turno\.estado\s*===\s*['"]pendiente['"]/);
    expect(html).toMatch(/data-testid=["']turnos-approve-confirm-modal["']/);
    expect(html).toMatch(/data-testid=["']turnos-approve-confirm-overlay["']/);
    expect(html).toMatch(/data-testid=["']turnos-approve-confirm-cancel["']/);
    expect(html).toMatch(/data-testid=["']turnos-approve-confirm-confirm["']/);
    expect(html).toMatch(/\(click\)=["']approveTurno\(turno\)["']/);

    const confirmBody = methodBody(ts, 'confirmApproveTurno');
    expect(confirmBody).toMatch(/approvePending\(/);
    expect(confirmBody).toMatch(/performedBy/);
  });

  it('latest update_booking_status allows pending→confirmed with lock+assert excluding self, and still raises otherwise', () => {
    const migrationsDir = join(REPO_ROOT, 'supabase/migrations');
    const sql = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
      .join('\n');
    const body = latestUpdateBookingStatusBody(sql);
    const normalized = stripSqlComments(body).replace(/\s+/g, ' ').trim().toLowerCase();

    expect(body.length, 'latest update_booking_status body must exist').toBeGreaterThan(0);
    expect(normalized).toMatch(/status\s+is\s+distinct\s+from\s+'pending'|status\s*<>\s*'pending'|status\s+!=\s*'pending'/);
    expect(normalized).toMatch(/booking_status_confirm_requires_reschedule_or_create/);
    expect(normalized).toMatch(/_lock_booking_conflict_window\s*\(/);
    expect(normalized).toMatch(/_assert_no_slot_conflict\s*\(/);
    expect(normalized).toMatch(/_assert_no_slot_conflict\s*\([^;]*v_booking\.id/);

    const lockIndex = normalized.search(/_lock_booking_conflict_window\s*\(/);
    const assertIndex = normalized.search(/_assert_no_slot_conflict\s*\(/);
    const updateIndex = normalized.search(/update\s+public\.bookings/);
    expect(lockIndex).toBeGreaterThan(-1);
    expect(assertIndex).toBeGreaterThan(lockIndex);
    expect(updateIndex).toBeGreaterThan(assertIndex);
  });
});
