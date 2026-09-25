import { describe, expect, it } from 'vitest';
import {
  extractConditionalBlock,
  readConfiguracionSources
} from './helpers/configuracion-source';

function assertContainsConfiguracionSection(block: string, label: string): void {
  expect(block, `${label} must include Configuracion section container`).toMatch(/<section\b[\s\S]*data-testid=["']configuracion-responsive-container["']/i);
  expect(block, `${label} must include settings title marker`).toMatch(/id=["']settings-title["']/i);
  expect(block, `${label} must include settings form contract`).toMatch(/<form\s+\[formGroup\]=["']settingsForm["']/i);
}

describe('Story B contract - Configuracion rendering for Zen and Chic', () => {
  it('defines theme guards in TS for zen/chic/industrial rendering', async () => {
    const { tsSource } = await readConfiguracionSources();

    expect(tsSource).toMatch(/get\s+isIndustrial\s*\(\)\s*\{/);
    expect(tsSource).toMatch(/get\s+isZen\s*\(\)\s*\{/);
    expect(tsSource).toMatch(/get\s+isChic\s*\(\)\s*\{/);
  });

  it('renders Configuracion for Zen with required section contracts', async () => {
    const { htmlSource } = await readConfiguracionSources();
    const zenBlock = extractConditionalBlock(htmlSource, 'isZen') ?? htmlSource;

    expect(zenBlock, 'Missing Zen rendering source in Configuracion templates').not.toEqual('');
    assertContainsConfiguracionSection(zenBlock, 'Zen block');
  });

  it('renders Configuracion for Chic with required section contracts', async () => {
    const { htmlSource } = await readConfiguracionSources();
    const chicBlock = extractConditionalBlock(htmlSource, 'isChic') ?? htmlSource;

    expect(chicBlock, 'Missing Chic rendering source in Configuracion templates').not.toEqual('');
    assertContainsConfiguracionSection(chicBlock, 'Chic block');
  });

  it('keeps Configuracion section available when switching Industrial ↔ Zen ↔ Chic', async () => {
    const { htmlSource } = await readConfiguracionSources();
    const industrialBlock = extractConditionalBlock(htmlSource, 'isIndustrial') ?? htmlSource;
    const zenBlock = extractConditionalBlock(htmlSource, 'isZen') ?? htmlSource;
    const chicBlock = extractConditionalBlock(htmlSource, 'isChic') ?? htmlSource;

    assertContainsConfiguracionSection(industrialBlock, 'Industrial block');
    assertContainsConfiguracionSection(zenBlock, 'Zen block');
    assertContainsConfiguracionSection(chicBlock, 'Chic block');
  });
});
