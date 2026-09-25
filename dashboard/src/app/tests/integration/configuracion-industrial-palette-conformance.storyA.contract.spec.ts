import { describe, expect, it } from 'vitest';
import {
  extractConditionalBlock,
  readConfiguracionSources
} from './helpers/configuracion-source';

function extractBetween(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  if (start === -1) return '';

  const fromIndex = start + from.length;
  const end = source.indexOf(to, fromIndex);
  if (end === -1) return source.slice(fromIndex);

  return source.slice(fromIndex, end);
}

function assertNoForbiddenNamespaces(block: string, areaLabel: string): void {
  expect(block, `${areaLabel} should be present in industrial branch contract`).not.toEqual('');

  expect(block, `${areaLabel} must not leak zen palette tokens`).not.toMatch(/\bzen-[a-z0-9_-]*/i);
  expect(block, `${areaLabel} must not leak chic palette tokens`).not.toMatch(/\bchic-[a-z0-9_-]*/i);
  expect(block, `${areaLabel} must not leak ink palette tokens`).not.toMatch(/\bink-[a-z0-9_-]*/i);
}

function assertNoForbiddenAccentPalettes(block: string, areaLabel: string): void {
  const forbiddenAccentUtilities =
    /\b(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|placeholder|caret|accent)-(?:amber|rose|cyan)-\d{1,3}(?:\/\d{1,3})?\b/i;

  expect(
    block,
    `${areaLabel} must not use non-industrial accent palettes (amber/rose/cyan) while industrial template is active`
  ).not.toMatch(forbiddenAccentUtilities);
}

function assertIndustrialNamespacePresent(block: string, areaLabel: string): void {
  expect(
    block,
    `${areaLabel} must include industrial namespace classes when industrial template is active`
  ).toMatch(/\bind(?:ustrial)?-[a-z0-9_-]+/i);
}

function gatherIndustrialScopedSource(
  htmlByFile: Record<string, string>,
  fallbackBlock: string | null
): string {
  if (fallbackBlock) {
    return fallbackBlock;
  }

  return Object.values(htmlByFile)
    .filter((content) => /\bind(?:ustrial)?-/i.test(content))
    .join('\n');
}

describe('Story A contract - Configuracion industrial palette conformance', () => {
  it('keeps industrial branch free from zen/chic/ink namespace leakage', async () => {
    const { htmlByFile, htmlSource } = await readConfiguracionSources();
    const industrialBlock = gatherIndustrialScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isIndustrial')
    );

    expect(industrialBlock, 'Missing industrial-scoped template source').not.toEqual('');

    assertNoForbiddenNamespaces(industrialBlock, 'Industrial branch');
  });

  it('enforces industrial palette namespace across key UI areas (shell, cards, controls, alerts, modal states)', async () => {
    const { htmlByFile, htmlSource } = await readConfiguracionSources();
    const industrialBlock = gatherIndustrialScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isIndustrial')
    );
    const modalBlock = extractConditionalBlock(htmlSource, 'isTimePickerOpen()') ?? htmlSource;

    const pageShellArea = extractBetween(industrialBlock, '<section', '</header>');
    const settingsCardsArea = Array.from(industrialBlock.matchAll(/<article[\s\S]*?<\/article>/g))
      .map((match) => match[0])
      .join('\n');
    const controlsButtonsArea = Array.from(
      industrialBlock.matchAll(/<(?:input|select|button)\b[\s\S]*?>/g)
    )
      .map((match) => match[0])
      .join('\n');
    const alertsArea = extractBetween(industrialBlock, '<!-- Status Messages -->', '<!-- Main Settings Form -->');

    assertNoForbiddenNamespaces(pageShellArea, 'Industrial page shell');
    assertNoForbiddenNamespaces(settingsCardsArea, 'Industrial settings cards');
    assertNoForbiddenNamespaces(controlsButtonsArea, 'Industrial controls/buttons');
    assertNoForbiddenNamespaces(alertsArea, 'Industrial alerts states');
    assertNoForbiddenNamespaces(modalBlock, 'Industrial modal states');

    assertNoForbiddenAccentPalettes(pageShellArea, 'Industrial page shell');
    assertNoForbiddenAccentPalettes(settingsCardsArea, 'Industrial settings cards');
    assertNoForbiddenAccentPalettes(controlsButtonsArea, 'Industrial controls/buttons');
    assertNoForbiddenAccentPalettes(alertsArea, 'Industrial alerts states');
    assertNoForbiddenAccentPalettes(modalBlock, 'Industrial modal states');

    assertIndustrialNamespacePresent(pageShellArea, 'Industrial page shell');
    assertIndustrialNamespacePresent(settingsCardsArea, 'Industrial settings cards');
    assertIndustrialNamespacePresent(controlsButtonsArea, 'Industrial controls/buttons');
    assertIndustrialNamespacePresent(alertsArea, 'Industrial alerts states');
    assertIndustrialNamespacePresent(modalBlock, 'Industrial modal states');
  });

  it('blocks foreign accent tokens from the industrial branch while allowing neutral structural utilities', async () => {
    const { htmlByFile, htmlSource } = await readConfiguracionSources();
    const industrialBlock = gatherIndustrialScopedSource(
      htmlByFile,
      extractConditionalBlock(htmlSource, 'isIndustrial')
    );

    expect(industrialBlock, 'Missing industrial-scoped template source').not.toEqual('');

    assertNoForbiddenAccentPalettes(industrialBlock, 'Industrial branch');
    assertNoForbiddenNamespaces(industrialBlock, 'Industrial branch');
  });
});
