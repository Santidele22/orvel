import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.ts'),
  'utf8'
);

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
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

describe('TurnosListPage section cache', () => {
  it('second ngOnInit does not call crud.getAll when the same branch is warm', () => {
    const loadBookings = methodBody(source, 'loadBookings');
    const ngOnInit = methodBody(source, 'ngOnInit');

    expect(loadBookings).toMatch(/isAdminBookingsWarm\s*\(\s*branchId\s*\)/);
    expect(loadBookings).toMatch(/getAdminBookings\s*\(/);
    expect(loadBookings).toMatch(/return;/);
    expect(ngOnInit).toMatch(/isAdminBookingsWarm/);
    expect(ngOnInit).toMatch(/await this\.loadBookings\s*\(/);
  });

  it('adds and removes operator.agenda.sync with the booking.created handler', () => {
    expect(source).toMatch(
      /addEventListener\(\s*['"]operator\.agenda\.sync['"]\s*,\s*this\.onBookingCreated/
    );
    expect(source).toMatch(
      /removeEventListener\(\s*['"]operator\.agenda\.sync['"]\s*,\s*this\.onBookingCreated/
    );
    expect(source).toMatch(
      /addEventListener\(\s*['"]booking\.created['"]\s*,\s*this\.onBookingCreated/
    );
    expect(source).toMatch(
      /removeEventListener\(\s*['"]booking\.created['"]\s*,\s*this\.onBookingCreated/
    );
  });
});
