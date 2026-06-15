import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REAL_GATEWAY_PATH = join(
  process.cwd(),
  'src/app/core/api/supabase-booking/real-gateway.ts'
);
const CALENDAR_TEMPLATE_PATH = join(
  process.cwd(),
  'src/app/shared/components/calendar-picker/calendar-picker.component.html'
);
const CALENDAR_COMPONENT_PATH = join(
  process.cwd(),
  'src/app/shared/components/calendar-picker/calendar-picker.component.ts'
);

describe('KB-013 RED guard - Angular build blockers must be explicitly fixed', () => {
  it('prevents unresolved free identifier usage in real gateway (TS2304 isDev)', () => {
    const source = readFileSync(REAL_GATEWAY_PATH, 'utf8');

    // RED now: real-gateway currently contains `if (isDev)` without declared symbol.
    expect(source).not.toContain('if (isDev)');
  });

  it('forbids constructing Date directly inside calendar template expressions (NG5002)', () => {
    const template = readFileSync(CALENDAR_TEMPLATE_PATH, 'utf8');

    // RED now: Angular template parser rejects `new Date()` in this click binding.
    expect(template).not.toContain('pivotDate.set(new Date())');
    expect(template).not.toMatch(/\bnew\s+Date\s*\(/);
  });

  it('requires an explicit component API for "today" action instead of template-side object creation', () => {
    const template = readFileSync(CALENDAR_TEMPLATE_PATH, 'utf8');
    const componentTs = readFileSync(CALENDAR_COMPONENT_PATH, 'utf8');

    // RED now: there is no dedicated method and template calls signal.set(new Date()) directly.
    expect(template).toContain('(click)="goToToday()"');
    expect(componentTs).toMatch(/\bgoToToday\s*\(\s*\)\s*\{/);
  });
});
