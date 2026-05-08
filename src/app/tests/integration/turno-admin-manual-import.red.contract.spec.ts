import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Turno service booking payload typing import contract', () => {
  it('does not import non-exported AdminManualBookingPayload type directly', () => {
    const filePath = join(process.cwd(), 'src/app/services/turno.service.ts');
    const source = readFileSync(filePath, 'utf8');

    expect(source.includes('type AdminManualBookingPayload')).toBe(false);
  });
});
