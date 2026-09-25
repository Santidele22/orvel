import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SERVICIOS_HTML = 'src/app/pages/dashboard/servicios/servicios.page.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractConditionalBlock(source: string, condition: string): string | null {
  const conditionMatcher = new RegExp(`@(?:if|else\\s+if)\\s*\\(${escapeRegex(condition)}\\)\\s*\\{`);
  const conditionMatch = conditionMatcher.exec(source);

  if (!conditionMatch || conditionMatch.index === undefined) {
    return null;
  }

  const startIndex = conditionMatch.index + conditionMatch[0].length;
  const nextConditionalMatcher = /@else\s+if\s*\(is[A-Za-z]+\)\s*\{|@else\s*\{/g;
  nextConditionalMatcher.lastIndex = startIndex;

  const nextConditionalMatch = nextConditionalMatcher.exec(source);
  const endIndex = nextConditionalMatch?.index ?? source.length;
  return source.slice(startIndex, endIndex);
}

function assertNoPaletteTokens(block: string, forbiddenPrefixes: readonly string[], contractLabel: string): void {
  for (const prefix of forbiddenPrefixes) {
    expect(
      block,
      `${contractLabel} must not include \"${prefix}\" palette tokens`
    ).not.toMatch(new RegExp(`\\b${escapeRegex(prefix)}[a-z0-9_-]*`, 'i'));
  }
}

describe('Story 1 contract - Servicios palette isolation', () => {
  it('defines explicit template branches for ink and industrial in Servicios', async () => {
    const source = await readFile(fromRoot(SERVICIOS_HTML), 'utf-8');

    expect(source).toMatch(/@if\s*\(isInk\)\s*\{/);
    expect(source).toMatch(/@else\s+if\s*\(isIndustrial\)\s*\{/);
  });

  it('keeps ink branch free from zen/chic/industrial palettes', async () => {
    const source = await readFile(fromRoot(SERVICIOS_HTML), 'utf-8');
    const inkBlock = extractConditionalBlock(source, 'isInk');

    expect(inkBlock, 'Missing dedicated ink conditional block').not.toBeNull();

    assertNoPaletteTokens(inkBlock ?? '', ['zen-', 'chic-', 'ind-', 'industrial-'], 'Ink branch');
  });

  it('keeps industrial branch free from zen/chic/ink palettes', async () => {
    const source = await readFile(fromRoot(SERVICIOS_HTML), 'utf-8');
    const industrialBlock = extractConditionalBlock(source, 'isIndustrial');

    expect(industrialBlock, 'Missing dedicated industrial conditional block').not.toBeNull();

    assertNoPaletteTokens(industrialBlock ?? '', ['zen-', 'chic-', 'ink-'], 'Industrial branch');
  });

  it('does not leave ink/industrial palette classes in shared fallback markup (prevents stale switch leakage)', async () => {
    const source = await readFile(fromRoot(SERVICIOS_HTML), 'utf-8');
    const inkBlock = extractConditionalBlock(source, 'isInk') ?? '';
    const industrialBlock = extractConditionalBlock(source, 'isIndustrial') ?? '';

    const sourceWithoutScopedThemeBlocks = source
      .replace(inkBlock, '')
      .replace(industrialBlock, '');

    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bink-[a-z0-9_-]*/i);
    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bind-[a-z0-9_-]*/i);
  });
});
