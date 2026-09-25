import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TURNOS_HTML = 'src/app/features/booking/pages/turnos-list.page.html';

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
  const nextConditionalMatcher = /@else\s+if\s*\(is[A-Za-z]+\)\s*\{|@if\s*\(is[A-Za-z]+\)\s*\{|@else\s*\{/g;
  nextConditionalMatcher.lastIndex = startIndex;

  const nextConditionalMatch = nextConditionalMatcher.exec(source);
  const endIndex = nextConditionalMatch?.index ?? source.length;
  return source.slice(startIndex, endIndex);
}

function extractAgendaLayoutBlock(scopedTemplateBlock: string): string | null {
  const agendaMarker = 'data-layout-section="main_agenda"';
  const rightPanelMarker = 'data-layout-section="right_panel"';

  const agendaStart = scopedTemplateBlock.indexOf(agendaMarker);
  if (agendaStart < 0) {
    return null;
  }

  const rightPanelStart = scopedTemplateBlock.indexOf(rightPanelMarker, agendaStart);
  const agendaEnd = rightPanelStart >= 0 ? rightPanelStart : scopedTemplateBlock.length;

  return scopedTemplateBlock.slice(agendaStart, agendaEnd);
}

function assertNoPaletteTokens(block: string, forbiddenPrefixes: readonly string[], contractLabel: string): void {
  for (const prefix of forbiddenPrefixes) {
    expect(
      block,
      `${contractLabel} must not include "${prefix}" palette tokens`
    ).not.toMatch(new RegExp(`\\b${escapeRegex(prefix)}[a-z0-9_-]*`, 'i'));
  }
}

describe('Story 3 contract - Agenda palette isolation for Ink and Industrial', () => {
  it('defines dedicated template branches for ink and industrial in Turnos', async () => {
    const source = await readFile(fromRoot(TURNOS_HTML), 'utf-8');

    expect(source).toMatch(/@if\s*\(isIndustrial\)\s*\{/);
    expect(source).toMatch(/@if\s*\(isInk\)\s*\{/);
  });

  it('keeps ink agenda block free from zen/chic/industrial palette tokens', async () => {
    const source = await readFile(fromRoot(TURNOS_HTML), 'utf-8');
    const inkTemplateBlock = extractConditionalBlock(source, 'isInk');

    expect(inkTemplateBlock, 'Missing dedicated ink conditional block').not.toBeNull();

    const inkAgendaBlock = extractAgendaLayoutBlock(inkTemplateBlock ?? '');
    expect(inkAgendaBlock, 'Missing Ink agenda block with data-layout-section="main_agenda"').not.toBeNull();

    assertNoPaletteTokens(inkAgendaBlock ?? '', ['zen-', 'chic-', 'ind-', 'industrial-'], 'Ink agenda block');
  });

  it('keeps industrial agenda block free from zen/chic/ink palette tokens', async () => {
    const source = await readFile(fromRoot(TURNOS_HTML), 'utf-8');
    const industrialTemplateBlock = extractConditionalBlock(source, 'isIndustrial');

    expect(industrialTemplateBlock, 'Missing dedicated industrial conditional block').not.toBeNull();

    const industrialAgendaBlock = extractAgendaLayoutBlock(industrialTemplateBlock ?? '');
    expect(
      industrialAgendaBlock,
      'Missing Industrial agenda block with data-layout-section="main_agenda"'
    ).not.toBeNull();

    assertNoPaletteTokens(industrialAgendaBlock ?? '', ['zen-', 'chic-', 'ink-'], 'Industrial agenda block');
  });

  it('does not retain ink/industrial palette tokens in shared markup outside scoped branches', async () => {
    const source = await readFile(fromRoot(TURNOS_HTML), 'utf-8');
    const zenTemplateBlock = extractConditionalBlock(source, 'isZen') ?? '';
    const chicTemplateBlock = extractConditionalBlock(source, 'isChic') ?? '';
    const inkTemplateBlock = extractConditionalBlock(source, 'isInk') ?? '';
    const industrialTemplateBlock = extractConditionalBlock(source, 'isIndustrial') ?? '';

    const sourceWithoutScopedThemeBlocks = source
      .replace(zenTemplateBlock, '')
      .replace(chicTemplateBlock, '')
      .replace(inkTemplateBlock, '')
      .replace(industrialTemplateBlock, '');

    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bink-[a-z0-9_-]*/i);
    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bind-[a-z0-9_-]*/i);
    expect(sourceWithoutScopedThemeBlocks).not.toMatch(/\bindustrial-[a-z0-9_-]*/i);
  });
});
