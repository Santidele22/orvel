import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MAIN_TS_PATH = path.join(process.cwd(), 'src', 'main.ts');
const FORBIDDEN_PLACEHOLDERS = ['__MP_ACCESS_TOKEN__', '__MP_WEBHOOK_SECRET__'] as const;

function collectForbiddenPlaceholders(source: string): string[] {
  return FORBIDDEN_PLACEHOLDERS.filter((placeholder) => source.includes(placeholder));
}

describe('P0-2 main.ts runtime placeholder guard (RED contract)', () => {
  it('forbids all known Mercado Pago secret placeholders in src/main.ts', () => {
    expect(fs.existsSync(MAIN_TS_PATH), `Missing file: ${MAIN_TS_PATH}`).toBe(true);

    const source = fs.readFileSync(MAIN_TS_PATH, 'utf8');
    const offenders = collectForbiddenPlaceholders(source);

    expect(
      offenders,
      `Forbidden placeholders detected in src/main.ts: ${offenders.join(', ') || 'none'}`
    ).toEqual([]);
  });

  it('keeps the guard deterministic by checking exact forbidden token list', () => {
    expect(FORBIDDEN_PLACEHOLDERS).toEqual(['__MP_ACCESS_TOKEN__', '__MP_WEBHOOK_SECRET__']);
  });
});
