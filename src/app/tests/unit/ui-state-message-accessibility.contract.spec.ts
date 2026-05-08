import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_STATE_COMPONENT_TS =
  'src/app/shared/components/ui-state-message/ui-state-message.component.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('UiStateMessage a11y contract (unit, RED)', () => {
  it('requires explicit API for live region semantics and error tone support', async () => {
    const source = await readFile(fromRoot(UI_STATE_COMPONENT_TS), 'utf-8');

    // TODO(Aurora): agregar inputs ariaLive/role para feedback accesible consistente.
    expect(source).toMatch(/@Input\(\).*ariaLive|@Input\(\).*live/);
    expect(source).toMatch(/@Input\(\).*role/);

    // TODO(Aurora): soportar estado de error compartido en componente presentacional.
    expect(source).toMatch(/tone:\s*'neutral'\s*\|\s*'warning'\s*\|\s*'error'/);
    expect(source).toMatch(/danger|error/);
  });
});
