import { describe, expect, it } from 'vitest';
import {
  escapeRegex,
  extractConditionalBlock,
  readConfiguracionSources
} from './helpers/configuracion-source';

function assertNoPaletteTokens(block: string, forbiddenPrefixes: readonly string[], contractLabel: string): void {
  for (const prefix of forbiddenPrefixes) {
    expect(
      block,
      `${contractLabel} must not include "${prefix}" palette tokens`
    ).not.toMatch(new RegExp(`\\b${escapeRegex(prefix)}[a-z0-9_-]*`, 'i'));
  }
}

function gatherPaletteScopedSource(
  htmlByFile: Record<string, string>,
  fallbackBlock: string | null,
  namespaceMatcher: RegExp
): string {
  if (fallbackBlock) {
    return fallbackBlock;
  }

  return Object.values(htmlByFile)
    .filter((content) => namespaceMatcher.test(content))
    .join('\n');
}

describe('Story 2 contract - Configuracion palette isolation', () => {
  it('defines theme guards for ink and industrial in Configuracion TS', async () => {
    const { tsSource } = await readConfiguracionSources();

    expect(tsSource).toMatch(/get\s+isInk\s*\(\)\s*\{/);
    expect(tsSource).toMatch(/get\s+isIndustrial\s*\(\)\s*\{/);
  });

  it('keeps ink branch free from zen/chic/industrial palettes', async () => {
    const { htmlByFile, htmlSource } = await readConfiguracionSources();
    const inkBlock = gatherPaletteScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isInk'),
      /\bink-/i
    );

    expect(inkBlock, 'Missing ink-scoped template source').not.toEqual('');

    assertNoPaletteTokens(inkBlock, ['zen-', 'chic-', 'ind-', 'industrial-'], 'Ink branch');
  });

  it('keeps industrial branch free from zen/chic/ink palettes', async () => {
    const { htmlByFile, htmlSource } = await readConfiguracionSources();
    const industrialBlock = gatherPaletteScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isIndustrial'),
      /\bind(?:ustrial)?-/i
    );

    expect(industrialBlock, 'Missing industrial-scoped template source').not.toEqual('');

    assertNoPaletteTokens(industrialBlock, ['zen-', 'chic-', 'ink-'], 'Industrial branch');
  });

  it('does not leave ink/industrial palette classes in shared fallback markup (prevents stale switch leakage)', async () => {
    const { htmlByFile, htmlSource } = await readConfiguracionSources();
    const inkBlock = gatherPaletteScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isInk'),
      /\bink-/i
    );
    const industrialBlock = gatherPaletteScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isIndustrial'),
      /\bind(?:ustrial)?-/i
    );

    const sourceWithoutScopedThemeBlocks = htmlSource
      .replace(inkBlock, '')
      .replace(industrialBlock, '');

    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bink-[a-z0-9_-]*/i);
    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bind-[a-z0-9_-]*/i);
    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bindustrial-[a-z0-9_-]*/i);
  });
});
